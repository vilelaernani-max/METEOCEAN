# Spec: direção do vento nos limites e mapa de onda + vento

## Objetivo
Quem usa: o Ernani, no planejamento de operações marítimas, pelo navegador (GitHub Pages) e pelo celular.
Problema: a análise não considera de onde o vento vem, e não há visão da região, só do ponto.

Entregas:
1. **Direção do vento bloqueada (opcional).** Campo "Direção do vento bloqueada" com dois valores escolhidos por **pontos cardeais** (16 pontos: N, NNE, NE, ENE, E, ESE, SE, SSE, S, SSO, SO, OSO, O, ONO, NO, NNO): "de" e "até". Cada ponto cobre ±11,25° em volta do seu centro (ex.: S = 168,75° a 191,25°); a faixa vai do início do setor "de" ao fim do setor "até", no sentido horário. Hora com vento vindo dessa faixa vira NO-GO, com o motivo no relatório. Vazio = não usa.
2. **Mapa de onda + vento.** Mapa em volta do ponto (quadrado de 300 km de lado) com Hs em cores e vento em setas, e uma barra para escolher o horário da previsão.

Critérios de aceite (testáveis):
- Faixa SSE a SSO (do início do setor SSE, 146,25°, ao fim do setor SSO, 213,75°): hora com vento de 180° é NO-GO com o motivo "direção S (180°) na faixa bloqueada SSE–SSO"; hora com 90° não é afetada.
- Faixa que cruza o norte (ex.: NO a NE) funciona: 350° e 10° bloqueiam, 90° não.
- Só um dos dois valores preenchido: o formulário avisa e não salva. "de" igual a "até" bloqueia apenas aquele ponto.
- Campos vazios: o resultado é idêntico ao de hoje (nenhum teste antigo muda).
- Hora sem dado de direção, com a faixa preenchida, vira "sem dado" (como os outros limites), nunca GO.
- O limite aparece na tabela "Limites aplicados" do relatório e no PDF.
- O mapa carrega a grade, pinta cada ponto pela Hs com legenda de cores, desenha a seta do vento (apontando para onde o vento vai) e mostra o horário escolhido.
- As cores da Hs seguem o limite de Hs do perfil: verde abaixo de 70% do limite, amarelo de 70% a 100%, vermelho acima do limite. Sem limite de Hs no perfil, escala fixa (até 1 m, 1–2 m, 2–3 m, acima de 3 m) e um aviso na legenda.
- O mapa só é buscado quando o usuário clica em "Ver mapa da região" dentro do relatório.
- Mudar o horário na barra atualiza cores e setas sem nova busca.
- Ponto sobre terra (Hs nula) aparece sem cor, sem erro.
- Falha ou limite de taxa da Open-Meteo: mensagem clara no lugar do mapa; o relatório e o resto da página continuam funcionando.
- O mapa fica no relatório (tela), e nunca bloqueia a geração do relatório se falhar. Relatório baixado em HTML e PDF não leva o mapa.

## Pilha
Arquivo único `index.html`, JavaScript puro, sem dependência nova. Mapa de fundo é o do próprio app (blocos do OpenStreetMap), com camada de pontos e setas em SVG sobre ele. Dados da Open-Meteo (vento: `api.open-meteo.com`; onda: `marine-api.open-meteo.com`), com a lista de 49 coordenadas em uma única requisição por API. Melhor modelo automático (`best_match`) para o mapa.

## Comandos
- Rodar local: `python3 -m http.server 8765` na raiz do repositório e abrir `http://localhost:8765/index.html`.
- Teste do navegador: scripts Playwright (Chromium em `/opt/pw-browsers/chromium`) com a Open-Meteo simulada via `page.route`.
- Testes da versão local em Python (não são alterados): `cd local && python3 -m unittest discover -s tests`.

## Estrutura
- Tudo em `index.html`: `normalizeLimits`/`evaluateHour` (limite de direção), formulários de limites (perfil, análise rápida, limites por local), `buildReport` (tabela de limites e mapa), `downloadPdf` (tabela de limites).
- Testes novos em `tests/` (scripts Playwright e uma função pura para o cálculo de direção).
- Esta spec e `docs/plano.md`.

## Testes
- **Função pura** `dirBlocked(dir, from, to)` com casos: faixa normal, faixa que cruza o norte, bordas, valores 0 e 360, dado ausente.
- **Navegador (Playwright, Open-Meteo simulada):** análise com faixa → hora NO-GO com motivo; campos vazios → resultado igual ao atual; mapa com grade simulada (cores, setas, barra de horário, ponto sobre terra, erro 429).
- **Ciclo completo:** `evaluateHour` e o relatório (decisão operacional, afeta GO/NO-GO). **Ciclo leve:** layout do mapa, textos.

## Limites
- Sempre: teste que falha antes e passa depois; campo de direção vazio não muda nada; backup exportar e restaurar continua funcionando (o novo campo entra nos perfis e locais salvos); previsão antiga continua com o alerta de idade.
- Perguntar antes: dependência nova, mudança do formato de dados salvos que quebre perfis antigos, aumento da quantidade de pontos da grade.
- Nunca: chave ou senha no repositório; dado real de cliente em teste; commit fora das regras do `CLAUDE.md`.

## Critérios de sucesso
- Os critérios de aceite acima passam nos testes.
- Perfis e locais salvos antes da mudança abrem e analisam igual a hoje.
- A grade usa no máximo 2 requisições por mapa (uma por API) e a página não excede o limite gratuito da Open-Meteo no uso normal.
- O mapa funciona no celular (toque, barra de horário) e sem rolagem horizontal da página.

## Decisões do Ernani
- Direção por pontos cardeais (16 pontos), não por graus.
- Cores do mapa relativas ao limite de Hs do perfil.
- Mapa só aparece quando clicar em "Ver mapa da região".

## Perguntas em aberto
Nenhuma.

---

# Spec 2: direção da onda, data de início e mapa com mais opções

Pedido do Ernani (25/10/2026): itens 2, 4 e 5 da lista de sugestões.

## Mapa de módulos
| Módulo | O que entrega | Depende de | Ciclo |
|---|---|---|---|
| M1 Direção da onda | faixa de direção de onda bloqueada, opcional, igual à do vento | nada (reaproveita `dirBlocked`) | completo (decide GO/NO-GO) |
| M2 Data de início | análise rápida começa numa data e hora escolhidas, horizonte até 16 dias | nada | completo (muda o período analisado) |
| M3 Mapa: tamanho e animação | região de 100, 200 ou 300 km; botão que passa as horas sozinho | nada | leve |

Ordem: M1, M2, M3 (independentes; sequência só para o `index.html` não ter edições simultâneas).

## M1 Direção da onda bloqueada
- Dois campos "de" e "até" (16 pontos cardeais, como no vento) no perfil de limites, na análise rápida e nos limites do local. Vazio = não usa.
- A direção usada é **de onde a onda vem** (`wave_direction` da Open-Meteo, já guardado como `wave_dir`). Mesma regra do vento: setor "de" ao setor "até", sentido horário; só um preenchido = erro.
- Hora com onda na faixa vira NO-GO com o motivo "onda vindo de SE (135°) na faixa bloqueada L–S". Sem dado de direção de onda vira "sem dado".
- Aparece na tabela "Limites aplicados" (tela, HTML, PDF), no rótulo de limites do local e no backup.
- Se "Ondas" estiver desmarcado na análise rápida, o limite de direção de onda é ignorado (como os demais limites de onda).
- Aceite: caso de teste igual ao do vento (faixa normal, cruzando o norte, bordas, dado ausente, só um valor); campos vazios não mudam nenhum resultado; perfis e locais antigos abrem igual.

## M2 Data de início
- Na análise rápida, campo opcional "Início da análise" (data e hora, no fuso do local). Vazio = agora, como hoje.
- "Dias à frente" passa a contar a partir do início. O total (do momento atual até o fim da análise) não pode passar de 16 dias; acima disso o formulário avisa.
- A busca na Open-Meteo pede dias suficientes para cobrir até o fim da análise e a análise recorta a janela pedida.
- Início no passado: erro claro ("o início tem de ser a partir de agora").
- Quando o início está a mais de 7 dias de hoje, o relatório mostra um alerta de que a previsão perde confiança com a distância (o alerta de idade da previsão continua valendo).
- O período aparece no cabeçalho do relatório e no histórico; o resumo do mapa usa a mesma janela.
- Aceite: início em 3 dias gera grade que começa nessa hora (arredondada para baixo à hora cheia); total acima de 16 dias é recusado; vazio funciona como hoje; fuso do local respeitado (início 08:00 do local = 08:00 − fuso em UTC).

## M3 Mapa: tamanho e animação
- Seletor "Tamanho da região": 100, 200 ou 300 km (padrão 300). Mudar o tamanho com o mapa aberto busca de novo (a grade muda); sem mapa aberto, só guarda a escolha.
- Botão "Reproduzir" passa uma hora a cada 0,5 s a partir da hora atual da barra, para no fim e vira "Pausar" enquanto roda. Não inicia sozinho (respeita quem prefere menos movimento).
- Aceite: com 100 km a grade 7×7 continua com 49 pontos e o passo cai para ~17 km; reproduzir avança a barra e as cores; pausar e chegar ao fim param a animação; mudar o tamanho faz uma nova busca (2 requisições) e mantém a célula e o horário selecionados quando possível.

## Pilha e comandos
Mesma da spec anterior: `index.html` único, JavaScript puro, sem dependência nova. Testes: `node tests/<nome>.js` (Playwright para os de navegador) e `python3 tests/paridade.py`.

## Testes
- M1: estender `tests/dir_blocked.js` (função pura com onda) e `tests/dir_forms.js` (formulários, motivo no relatório, backup).
- M2: novo `tests/inicio.js` (navegador, Open-Meteo simulada): início futuro, limite de 16 dias, início no passado, fuso, alerta acima de 7 dias.
- M3: estender `tests/map.js` (tamanhos, reproduzir/pausar, nova busca ao mudar o tamanho).
- Ao fim: rodar todos os testes e o de paridade (a direção da onda e a data de início não existem no Python: ficam fora da paridade, como a direção do vento).

## Limites
- Sempre: campos novos vazios não mudam nenhum resultado; backup continua exportando e restaurando; alerta de idade da previsão continua.
- Perguntar antes: dependência nova, mudança de formato de dados que quebre perfis antigos.
- Nunca: chave no repositório; commit fora das regras do `CLAUDE.md`.

## Fora do escopo
Data de início no modo completo (colagem manual), direção de onda no PDF do mapa, mais de 16 dias, alertas automáticos.

## Perguntas em aberto
Nenhuma. Estou supondo: (1) direção da onda bloqueia, como a do vento; (2) data de início só na análise rápida; (3) animação de 0,5 s por hora, sem escolha de velocidade.

---

# Spec 3: gráfico combinado de vento e onda

Pedido do Ernani (29/10/2026): gráfico de linha e dispersão; eixo primário com a intensidade do vento em linha sólida; eixo secundário com a altura da onda em pontos; plotagem do frio para o quente.

## Objetivo e aceite
- Seção "Vento e onda juntos" no relatório (tela, HTML baixado e PDF), quando vento e ondas estão na análise.
- Eixo esquerdo: vento em nós, **linha sólida** em segmentos. Eixo direito: Hs em metros, **pontos**. Os dois eixos têm 5 divisões alinhadas à mesma grade.
- Cores **do frio ao quente**: azul (valor baixo) → ciano → verde → laranja → vermelho (valor alto). A cor de cada trecho da linha segue a intensidade do vento e a de cada ponto segue a Hs, cada uma na escala do seu próprio eixo (0 até o máximo do eixo). A matiz só diminui do azul ao vermelho.
- Limites do perfil aparecem como **linhas bem visíveis e diferentes entre si**: vento no eixo esquerdo (preta, tracejada, 2,2 px) e Hs no direito (roxa, pontilhada, 2,6 px), com rótulo sobre fundo, desenhado por cima dos dados, que diz o valor e o eixo ("limite vento 20 kn (eixo esq.)"). A legenda lista as duas linhas; sem limite no perfil, ela avisa "sem limite de Hs/vento no perfil" e a linha não é desenhada. Pedido do Ernani em 29/10/2026.
- Legenda com a escala de cores das duas séries e a frase "azul = baixo, vermelho = alto".
- Fonte do gráfico: a primeira fonte. Na tela, com mais de uma fonte, um seletor troca a fonte (HTML baixado e PDF usam a primeira, e o nome da fonte aparece no gráfico).
- Horas sem dado deixam buraco na linha e nos pontos (sem interpolar).
- No celular o gráfico rola na horizontal dentro do próprio quadro (largura mínima de 720 px), sem rolagem da página.

## Fora do escopo
Direção do vento ou da onda no gráfico, gráfico por fonte lado a lado, rajada.

## Testes
`tests/grafico.js`: escala de cores (função pura), segmentos e pontos, cores frio/quente nos extremos, eixos, limites, legenda, seletor de fonte, HTML baixado, PDF, celular escuro sem rolagem da página, e ausência do gráfico quando só o vento está ligado.

## Revisão (29/10/2026): onda em linha, vento em setas
Pedido do Ernani: "Onda linha; vento dispersão representada pela seta com direção do vento". Substitui o desenho original:
- **Altura de onda (Hs):** **linha sólida** no eixo direito, em segmentos, colorida do frio ao quente pela própria Hs.
- **Vento:** **dispersão de setas** no eixo esquerdo (posição vertical = intensidade em nós). Cada seta **aponta para onde o vento vai** (direção de onde vem + 180°; vento de 120° → seta a 300°), preenchida do frio ao quente pela intensidade. Não há mais linha de vento.
- Para não sobrepor, uma seta a cada N horas (N escolhido pela largura do gráfico: pelo menos ~15 px entre setas; a legenda informa o N). Hora sem direção mas com vento vira ponto redondo.
- Os limites (linha preta tracejada do vento, linha roxa pontilhada da Hs), a legenda das escalas, o seletor de fonte e o PDF seguem como antes; a legenda e a nota do PDF dizem que a seta aponta para onde o vento vai.
- Testes: `tests/grafico.js` (linha da onda, setas, rotação, cores, espaçamento).

## Revisão 2 (29/10/2026): linha suave de vento e setas menores por cima
Pedido do Ernani: "seta pode ser menor, coloque uma linha suave e as setas por cima" (leitura: "pro cima" = por cima; se for "apontando para cima", a seta perderia a direção do vento e isso precisa ser confirmado).
- **Linha suave de vento:** curva (Catmull-Rom → Bézier cúbica) passando por todas as horas com vento, em trechos coloridos do frio ao quente pela intensidade, fina (1,6 px) e translúcida. Sem dado, a curva se interrompe (sem interpolar).
- **Setas menores** (altura de cerca de 11 px no desenho, antes 15,5), desenhadas **depois** da linha (por cima), uma a cada N h (N para dar pelo menos ~11 px de espaço).
- A linha da onda (sólida, mais grossa) e os limites seguem como antes. PDF acompanha (linha suave e setas menores).
- Testes: `tests/grafico.js` confere curvas, linha fina e translúcida, ordem (setas depois da linha) e tamanho das setas.

## Revisão 3 (29/10/2026): a seta tem de mostrar a direção
Pedido do Ernani: "Seta tem q mostrar direção". A seta menor da revisão 2 virou um triângulo pequeno, sem direção legível. Passa a ser uma **seta com haste e ponta**, estreita e alongada (cerca de 14 px de altura por 8 px de largura, ainda menor que a primeira, de 15,5 × 11), com **contorno escuro** para se destacar da linha de mesma cor. Aceite: altura entre 12 e 15 px, altura pelo menos 1,6 vez a largura, formato com haste e ponta, contorno #13232b; rotação segue sendo "de onde vem + 180°". PDF acompanha. Teste: `tests/grafico.js`.

## Revisão 4 (29/10/2026): o Norte no gráfico
Pedido do Ernani: representar o Norte no gráfico. Faixa nova no alto do gráfico com uma **bússola** pequena (cruz com N em negrito e triângulo vermelho para cima, e L, S, O nos outros pontos) e a nota "Norte para cima: a seta do vento aponta para onde ele vai (seta para cima = vento indo para o norte)". Fica acima da grade, sem cobrir dados. No PDF, a mesma bússola e a mesma nota. Altura do gráfico passa de 300 para 340 (faixa de 58 px no topo). Teste: `tests/grafico.js` (letras N/L/S/O nas posições certas, N em negrito, seta do norte, nota, bússola acima da grade, nota no PDF).

## Revisão 5 (29/10/2026): relatório resumido com o gráfico e as rosas
Pedido do Ernani: no relatório resumido, usar este gráfico e a rosa. O resumido passa a trazer, depois das janelas e da linha do tempo: (1) **"Vento e onda juntos"** (quando vento e ondas estão na análise; se só um estiver, o gráfico simples daquele parâmetro); (2) **rosa dos ventos** (quando há vento) e **rosa de ondas** (quando há ondas), lado a lado no desktop e empilhadas no celular. Saem do resumido os gráficos separados de Hs e de vento (o combinado os substitui). O relatório **completo** não muda. No PDF do resumido: o gráfico combinado e as duas rosas lado a lado. Teste: `tests/resumido.js`.

---

# Spec 4: cadastro de equipamentos

Pedido do Ernani (29/10/2026): "cadastrar equipamentos; na previsão usar o limite do equipamento mais alto selecionado". Decisões dele: regra **mais restritiva** (não a mais alta), cadastro **só com limites do ambiente**, campos de limite da análise **preenchem sozinhos** com o limite combinado.

## Objetivo e aceite
- Aba **Equipamentos**: cadastro (nome, tipo, limites). Limites: Hs máxima (m), Tp mínimo (s), vento máximo (nós), rajada máxima (nós), corrente máxima (nós), direção do vento bloqueada (de, até) e direção da onda bloqueada (de, até), cada par com os 16 pontos cardeais. Campo vazio = o equipamento não limita aquele parâmetro. Salvar, novo, excluir (com confirmação) e lista.
- Na **análise rápida**: caixas de marcar com os equipamentos cadastrados ("Equipamentos (opcional)"). Marcar ou desmarcar recalcula o limite combinado e **preenche os campos de limite**; o usuário pode digitar por cima antes de gerar, e vale o que estiver nos campos.
- **Combinação** (mais restritivo): Hs máxima, vento máximo, rajada máxima e corrente máxima = **menor** valor entre os equipamentos que têm o limite; Tp mínimo = **maior** valor; parâmetro que nenhum equipamento limita fica vazio. **Direção bloqueada = união das faixas**: hora bloqueada se qualquer equipamento bloquear aquela direção.
- A análise passa a aceitar **várias faixas bloqueadas** (`dir_ranges`, `wdir_ranges`) além do par `dir_from/dir_to`. Com uma única faixa, os seletores de direção do formulário mostram a faixa. Com mais de uma, os seletores ficam desabilitados e uma nota diz quantas faixas vêm dos equipamentos; as faixas valem na geração.
- **Relatório** (tela, HTML e PDF): "Equipamentos: A, B" no cabeçalho e linha "Equipamentos usados" na tabela de limites; a linha de direção bloqueada mostra todas as faixas ("SSE a SSO; NO a NE"). O motivo NO-GO cita a faixa que bloqueou.
- Sem equipamento selecionado, nada muda (campos manuais, relatório como hoje).
- **Backup** exporta e restaura os equipamentos. **Artefato:** nova coleção `equipments` com as mesmas regras de acesso das outras (republicar com a capacidade `db` atualizada).
- Excluir equipamento que está marcado na análise o desmarca. Equipamento sem nenhum limite é aceito (não limita nada).

## Testes
`tests/equipamentos.js`: combinação (função pura: menor, maior, vazios, união de faixas), várias faixas na avaliação hora a hora, cadastro e validação (só um lado da direção), seleção preenchendo os campos, digitar por cima, relatório (cabeçalho, tabela, motivo), backup, exclusão, e ausência de mudança sem seleção.

## Fora do escopo
Fabricante, modelo, número de série, limites de operação (diurno, janela mínima) dentro do equipamento, a regra "limite mais alto", seleção de equipamento no modo completo (colagem manual).

---

# Spec 5: gráficos do resumido, corrente e maré, identidade e ajuda

Pedido do Ernani (29/10/2026), em quatro partes. Mapa de módulos (independentes, nesta ordem):

| Módulo | O que entrega | Depende de | Ciclo |
|---|---|---|---|
| M1 Resumido | ordem e gráficos por variável (vento, onda) | nada | leve (tela) |
| M2 Corrente e maré | gráficos de corrente e de maré no resumido e no completo, quando selecionados | M1 (ordem do resumido) | leve |
| M3 Identidade | logotipo discreto no app e nos relatórios (tela, HTML, PDF) e "Desenvolvido por" | nada | leve |
| M4 Ajuda | aba Ajuda e pontos de ajuda onde convém | M3 (rodapé) | leve |

## M1 Resumido: ordem
Depois do cabeçalho, indicadores, aviso de idade, veredito, janelas e linha do tempo, nesta ordem (cada bloco só aparece se a análise foi marcada):
1. **Gráfico de vento e onda juntos** (o atual).
2. **Embaixo: rosa dos ventos e rosa de ondas**, lado a lado (o atual).
3. **Vento (gráfico):** intensidade (linha), rajada (linha mais fina, tracejada) e direção (setas numa faixa abaixo do gráfico), com os limites de vento e de rajada.
4. **Onda (gráfico):** Hs (linha, eixo esquerdo), Tp (linha, eixo direito) e direção (setas numa faixa abaixo), com o limite de Hs e de Tp.
5. **Corrente (gráfico):** ver M2.
6. **Maré (gráfico):** ver M2.
7. Limites aplicados e rodapé.
"Ps" do pedido = **período de pico (Tp)**. A direção do vento usa a seta que aponta para onde ele vai (como no gráfico combinado); a direção da onda, de onde ela vem, com a seta apontando para onde a onda vai; a legenda diz isso e a bússola do Norte aparece nos gráficos com setas.
Aceite: ordem acima; cada gráfico traz as séries pedidas; blocos de variáveis desmarcadas não aparecem; o completo não perde nenhuma seção que já tem.

## M2 Corrente e maré
- Quando **corrente** estiver marcada: gráfico de velocidade (linha, com limite de corrente) e direção (setas), tanto no resumido quanto no completo (o completo já tem os gráficos de corrente; o resumido passa a ter o de velocidade com setas e o stick plot atual).
- Quando **maré** estiver marcada: curva da maré (nível do mar em m, com preamar e baixa-mar marcadas) no resumido (o completo já tem).
- Sem dado de corrente ou de maré no ponto: aviso curto no lugar do gráfico, como hoje.
- Aceite: com cada análise marcada e com dados, o gráfico aparece nos dois modos; desmarcada, não aparece; sem dado, aparece o aviso e o relatório não quebra.

## M3 Identidade
- **Logotipo** (o selo circular do cartão enviado, recortado com fundo transparente), embutido no `index.html` (arquivo único; versão com fundo branco para o PDF). Discreto: no cabeçalho do app (cerca de 36 px), no cabeçalho do relatório na tela e no HTML baixado (cerca de 40 px, ao lado do título) e no PDF (cabeçalho, pequeno).
- **"Desenvolvido por Ernani Vilela · Oceanógrafo Surveyor · © 2026"** com e-mail e WhatsApp do cartão (vilelaernani@gmail.com, (35) 99159-5388), em letra pequena e cor suave, no rodapé do app, no rodapé de todos os relatórios (tela, HTML, PDF) e na Ajuda.
- Aceite: logotipo visível sem atrapalhar o conteúdo (claro e escuro), imagem leve (até ~40 KB no total), rodapé presente nos três formatos.

## M4 Ajuda
- Nova aba **Ajuda** com roteiro curto e perguntas frequentes: como gerar uma análise; limites, perfis e equipamentos; direção bloqueada; resumido x completo; como ler o gráfico (setas, Norte, cores do frio ao quente); mapa da região; avisos da Marinha e idade da previsão; backup e dados salvos; contato ("Desenvolvido por").
- Pontos de ajuda ("?" que leva ao trecho da Ajuda) ao lado de: equipamentos, direção bloqueada, tipo de relatório e o gráfico combinado.
- Aceite: a aba abre no celular sem rolagem lateral; cada "?" abre a aba Ajuda no trecho certo; o texto está em português simples.

## Testes
`tests/resumido.js` (ordem e novos gráficos), `tests/equipamentos.js`/novo `tests/identidade.js` (logotipo, rodapé nas três saídas), novo `tests/ajuda.js`, e os existentes continuam passando.

## Fora do escopo
Boletim Meteoromarinha (depende da coleta pelo GitHub), uso offline, mudar os gráficos do relatório completo além do que é pedido.

## Perguntas em aberto
Nenhuma que bloqueie. Suposições a corrigir: (1) rajada em linha tracejada no gráfico de vento; (2) direção em setas numa faixa abaixo de cada gráfico; (3) e-mail e WhatsApp visíveis no rodapé dos relatórios que você envia a clientes.

---

# Spec 6: versão em inglês (troca PT/EN)

## Objetivo
O app, a ajuda e os relatórios (tela, HTML, PDF) funcionam em **português** e em **inglês**, com um botão de idioma. Mesmo arquivo, mesmo link; nada de segundo site.

## Mapa de módulos
| Módulo | O que faz | Depende de | Risco |
|---|---|---|---|
| L1 Base | dicionário `I18N` (pt/en), função `t(chave, vars)`, idioma salvo no navegador, botão PT/EN no cabeçalho | nada | médio |
| L2 App | todos os textos fixos e gerados da tela (abas, formulários, mensagens, erros, ajuda, rodapé) passam por `t()` | L1 | alto (muito texto) |
| L3 Relatórios | tela, HTML e PDF no idioma escolhido (títulos, tabelas, legendas dos gráficos, veredito, janelas, aviso de idade, rodapé) | L1, L2 | alto |
| L4 Entorno | `lang` do HTML, título da aba, nomes de arquivo, datas e números no formato do idioma, manifest | L1 | leve |

## Decisões
- **Idioma inicial:** o do navegador (`pt*` → português; qualquer outro → inglês). Depois, vale o que o usuário escolher e fica salvo.
- **Botão com bandeirinhas:** Brasil (português) e Estados Unidos (inglês), lado a lado no cabeçalho (celular incluso); a do idioma atual fica destacada. As bandeiras são desenhadas em SVG dentro do arquivo (emoji de bandeira não aparece no Windows), com texto alternativo "Português" e "English" para leitor de tela. Mesmo link, nada de endereço separado. Troca na hora, sem recarregar e sem perder o que foi digitado; um relatório aberto é refeito no novo idioma.
- **Conteúdo do usuário não é traduzido:** nomes de locais, equipamentos, cliente, embarcação, responsável.
- **Avisos da Marinha** vêm em português da fonte: continuam em português, com uma nota em inglês ("Source text in Portuguese").
- **Unidades:** as mesmas do app (nós, m, s, °). Em inglês, "kt" no lugar de "nós"; e "N, NE, E…" já são iguais. Ponto decimal em inglês, vírgula em português, como hoje.
- **Datas:** dia/mês/ano em português; mês por extenso ou AAAA-MM-DD em inglês (sem ambiguidade). Fuso continua UTC no relatório.
- **Rodapé "Desenvolvido por":** "Developed by Ernani Vilela · Surveyor Oceanographer · © 2026" com o mesmo e-mail e WhatsApp.
- **Aviso da Open-Meteo** (uso não comercial, crédito à fonte) e "apoio à decisão" nos dois idiomas.
- **Arquivo único:** o dicionário vai dentro do `index.html`; sem biblioteca nova.
- **Saída salva de análises antigas:** ao reabrir, o relatório sai no idioma atual (os dados são os mesmos; só os textos mudam).

## Testes
- `tests/idiomas.js` (novo): (1) toda chave de português tem a de inglês e vice-versa, sem texto vazio; (2) em inglês, a tela principal, a Ajuda, o relatório resumido e o completo não têm palavras de português (lista de palavras-chave: "Janela", "Previsão", "Vento" etc., fora o conteúdo do usuário e os avisos da Marinha); (3) a troca de idioma mantém campos e resultado; (4) PDF em inglês lido por `pdftotext` traz os títulos em inglês.
- Os testes atuais rodam em português (idioma fixo nos testes) e continuam passando; os de relatório e PDF rodam também em inglês.
- Paridade Python × JavaScript não muda (números iguais nos dois idiomas).

## Fora do escopo
Outros idiomas; tradução dos avisos da Marinha; versão local em Python (`local/`); tradução do conteúdo digitado.

## Perguntas em aberto
Nenhuma que bloqueie. Suposições a corrigir: (1) idioma inicial pelo navegador; (2) "kt" em inglês; (3) data AAAA-MM-DD ou mês por extenso em inglês; (4) avisos da Marinha ficam em português com nota.

## Revisão (29/10/2026): decisões da construção
- **Unidade:** em inglês fica **kn** (como os gráficos já mostravam), não "kt".
- **Datas:** em inglês, `Thu 29 Oct 07:00` (dia da semana, dia, mês abreviado, hora); em português, `qui 29/10 07:00` como antes. Com ano: `29 Oct 2026` / `29/10/2026`.
- **Números:** os valores já saíam com ponto na maior parte do app; só o texto do regime de ondas, a maré e as legendas de classe usavam vírgula em português. Em inglês tudo sai com ponto.
- **Avisos da Marinha:** continuam em português (texto da fonte); a linha de fonte do relatório em inglês diz "(in Portuguese)".
- **Idioma dos relatórios salvos:** o histórico guarda os dados, não o texto; ao abrir, o relatório sai no idioma escolhido na hora. O nome automático do perfil da análise rápida ("Hs ≤ 2 m, vento ≤ 20 kn") também troca de idioma.
- **Rótulos padrão** (fontes, perfis de exemplo, fases da Lua, estado da maré) trocam de idioma na tela e no relatório; nomes digitados pelo usuário não.
- **Revisão de consistência (31/10/2026):** em português a unidade de vento e corrente é **nós** em todo o app (formulários, relatórios, gráficos, PDF); em inglês, **kn**. "Tp mínima" virou "Tp mínimo" na tabela de limites. O cálculo não mudou.

