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
