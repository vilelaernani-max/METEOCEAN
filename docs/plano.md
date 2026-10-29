# Plano: direção do vento e mapa de onda + vento

- [x] T1: Cálculo da direção bloqueada (função pura + `evaluateHour`)
  - Aceite: `dirBlocked(dir, de, ate)` com 16 pontos cardeais, faixa que cruza o norte, bordas e dado ausente; `normalizeLimits` aceita `dir_from`/`dir_to` (ou nulos); `evaluateHour` marca NO-GO com motivo e "sem dado" quando faltar direção; campos vazios não mudam nada.
  - Verificar: teste unitário da função pura no navegador (Playwright) + análise com dados simulados, antes e depois.
  - Arquivos: `index.html`, `tests/dir_blocked.js`
  - Ciclo: completo

- [x] T2: Campos de direção nos três formulários
  - Aceite: selects "de" e "até" (16 pontos + "não usar") no perfil de limites, na análise rápida e nos limites do local; validação "só um preenchido"; salvam e carregam; backup preserva; perfis e locais antigos abrem iguais.
  - Verificar: Playwright: salvar perfil com faixa, recarregar, analisar; exportar e importar backup.
  - Arquivos: `index.html`, `tests/dir_forms.js`
  - Ciclo: completo (dados salvos)
  - Depende de: T1

- [x] T3: Direção no relatório e no PDF
  - Aceite: linha "Direção do vento bloqueada" na tabela "Limites aplicados" (tela, HTML baixado e PDF); motivo NO-GO exibido onde já aparecem os motivos.
  - Verificar: gerar relatório com faixa e conferir o texto na tela e no HTML baixado; PDF gera sem erro.
  - Arquivos: `index.html`
  - Ciclo: leve
  - Depende de: T1

- [x] T4: Busca da grade (7×7, 300 km) e escala de cores
  - Aceite: função que gera os 49 pontos em volta do ponto (passo de ~50 km, longitude corrigida pela latitude); busca com 1 requisição por API; resposta em lista é lida por ponto; escala de cores relativa ao limite de Hs do perfil (70%/100%) com escala fixa de reserva; erro e 429 viram mensagem.
  - Verificar: teste da geração da grade (limites de lat/lon, quantidade 49) e da escala de cores; Open-Meteo simulada com lista de 49 respostas, com pontos de terra (Hs nula) e com 429.
  - Arquivos: `index.html`, `tests/grid.js`
  - Ciclo: completo (cálculo e dados externos)

- [x] T5: Mapa de onda + vento no relatório
  - Aceite: botão "Ver mapa da região" no relatório; mapa de fundo com pontos coloridos pela Hs e setas de vento (para onde o vento vai); legenda; barra de horário (horas da previsão, no fuso do local) que atualiza sem nova busca; marcador do ponto da operação; funciona no celular, sem rolagem horizontal; não aparece em HTML baixado nem PDF; falha do mapa não afeta o relatório.
  - Verificar: Playwright com Open-Meteo simulada: clique no botão, 49 pontos, mudar o horário muda cores e setas, ponto sobre terra sem cor, erro mostra mensagem; captura de tela em largura de celular (400 px) e de desktop, nos temas claro e escuro.
  - Arquivos: `index.html`, `tests/map.js`
  - Ciclo: leve
  - Depende de: T4

- [x] T6: Fechamento
  - Aceite: todos os testes passam; fluxo antigo (análise sem direção, sem mapa) idêntico ao anterior; `SPEC.md` e `docs/plano.md` atualizados.
  - Verificar: rodar todos os scripts de `tests/`, o teste de backup e o de idade da previsão; revisar o diff do `index.html`.
  - Arquivos: `index.html`, `SPEC.md`, `docs/plano.md`
  - Ciclo: completo
  - Depende de: T1–T5

Ordem: T1 → (T2 e T3 em paralelo, sem arquivo em comum além do `index.html`: fazer em sequência) → T4 → T5 → T6.

## Registro
- T1 a T6 concluídas em 2026-10-25. Testes: `tests/dir_blocked.js`, `tests/grid.js`, `tests/dir_forms.js`, `tests/map.js` (Node + Playwright).
- Ajuste fora do plano: a rosa dos ventos/ondas (`.wind2`) fazia a página rolar para o lado no celular; corrigido com `min-width:0` e `minmax(0,1fr)`.
- Decisões de construção: o mapa se encaixa no maior zoom inteiro que cabe na tela (altura máxima 720 px); seta com tamanho proporcional à célula e à velocidade do vento.

---

# Plano 2: direção da onda, data de início e mapa com mais opções (spec 2)

- [x] M1 Direção da onda bloqueada: `wdir_from`/`wdir_to` nos limites, formulários (perfil, análise rápida, local), relatório, PDF, rótulo do local e backup. Testes: `tests/dir_blocked.js`, `tests/dir_forms.js`.
- [x] M2 Data de início: campo "Início da análise" na análise rápida, `parseStart` (fuso do local, hora cheia em UTC, limite de 16 dias), busca com dias suficientes, alerta acima de 7 dias à frente. Teste: `tests/inicio.js`.
- [x] M3 Mapa: seletor de 100/200/300 km (nova busca mantendo célula e horário) e botão Reproduzir/Pausar (0,5 s por hora). Teste: `tests/map.js`.

## Registro
- Concluído em 2026-10-25. Todos os testes e o de paridade passam.
- Decisões de construção: "Dias à frente" passa a aceitar até 16 (antes 10); o início é arredondado para a hora cheia em UTC (com fuso de meia hora, 08:00 local vira o início da hora UTC anterior); ao chegar ao fim, Reproduzir recomeça do início; o início escolhido não é lembrado entre visitas (evita erro de "início no passado").

---

# Plano 3: gráfico combinado de vento e onda (spec 3)
- [x] G1 Escala de cores frio → quente (`coldWarm`) e gráfico SVG de dois eixos (`dualBody`/`dualChartHtml`), com seletor de fonte na tela (`wireDual`).
- [x] G2 Versão para o PDF (`pdfDualChart`) com legenda das escalas.
- [x] G3 Teste `tests/grafico.js` (puro, navegador, PDF e celular).
- Registro (2026-10-29): título do PDF sai em maiúsculas (padrão do `pdf.h2`); no celular o gráfico rola dentro do quadro para manter o texto legível.
- [x] G4 (29/10/2026) Limites do gráfico mais visíveis: linha preta tracejada (vento, eixo esq.) e roxa pontilhada (Hs, eixo dir.), rótulos com fundo por cima dos dados, legenda dos limites, aviso quando não há limite; PDF com o mesmo destaque. Testes em `tests/grafico.js`.
- [x] G5 (29/10/2026) Revisão do gráfico: onda em linha (eixo direito) e vento em setas de direção (eixo esquerdo, uma a cada N h), tela, HTML e PDF; testes atualizados em `tests/grafico.js`.
- [x] G6 (29/10/2026) Linha suave de vento (curva por todas as horas, colorida) sob setas menores desenhadas por cima; PDF acompanha; testes atualizados.
- [x] G7 (29/10/2026) Seta do vento com haste e ponta, estreita, com contorno escuro, para a direção ficar legível (tela e PDF); testes de formato e tamanho.
- [x] G8 (29/10/2026) Bússola com o Norte no topo do gráfico (tela e PDF) e nota explicando a seta do vento; testes atualizados.
- [x] G9 (29/10/2026) Relatório resumido com o gráfico combinado e as rosas de vento e de ondas (tela, HTML e PDF); completo inalterado. Teste `tests/resumido.js`.
