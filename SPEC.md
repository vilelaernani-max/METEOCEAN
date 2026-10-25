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
