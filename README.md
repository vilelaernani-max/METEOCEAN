# MetOcean OP

Gerador de relatórios de janelas operacionais (vento e onda, GO/NO-GO) para operações marítimas. Uso pessoal.

- **Versão web** (`index.html`): arquivo único, sem servidor. Busca a previsão na Open-Meteo direto do navegador, aplica seus limites e gera o relatório com comparação entre modelos e avisos da Marinha. Locais, limites e histórico ficam salvos só no navegador de quem usa.
  Publicada pelo GitHub Pages: Settings → Pages → Deploy from a branch → `main` → `/ (root)`.
- **Versão local** (`local/`): servidor Python (só biblioteca padrão) com mapa e banco SQLite. Veja `local/README.md`.

Apoio à decisão: não substitui o julgamento do responsável pela operação, os boletins oficiais nem a observação local.
