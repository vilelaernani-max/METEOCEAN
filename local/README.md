# MetOcean OP

Gerador de relatórios de janelas operacionais (vento e onda) para operações marítimas.
Uso pessoal, sem senha, roda no seu computador. **Só Python 3.10+; nada para instalar.**

## Como rodar

Duplo clique em `iniciar.bat` (Windows) ou `iniciar.command` (Mac). Para usar também no celular: `iniciar-celular.bat` / `iniciar-celular.command`.
Na primeira vez, rode `python3 run.py --check` para confirmar que as fontes de previsão respondem na sua internet.

```bash
python3 run.py              # abre o navegador em http://localhost:8000
python3 run.py --check      # testa as fontes de previsão
METEOCEAN_DEMO=1 python3 run.py   # modo demonstração (dados sintéticos, sem internet)
python3 -m unittest discover -s tests   # testes
```

Os dados (banco, relatórios, séries brutas) ficam em `data/`. Para trocar: `METEOCEAN_DATA=/outra/pasta`.
Porta: `METEOCEAN_PORT`.

## Como usar

1. **Mapa / Locais**: clique no mapa, dê um nome, informe o fuso e (opcional) a área da Marinha (ex.: `GOLF`), adicione **tags** e salve.
2. **Limites**: ajuste ou crie perfis (Hs máx., Tp mín., vento, rajada, só diurno, janela mínima em horas). Os três perfis iniciais são **exemplos genéricos**: coloque seus limites reais.
3. **Análise**: escolha local + perfil + dias, acrescente tags e clique em *Solicitar análise*. O relatório abre em HTML estático (um arquivo só, imprimível em PDF pelo navegador).
4. **Histórico**: lista de relatórios, com filtro por tag.
5. **Marinha**: status da última coleta dos avisos, botão *Buscar agora* e opção de colar o texto manualmente se a página mudar.

## O que o relatório traz

Janelas GO no cenário **conservador** (todas as fontes dentro dos limites) e **otimista** (qualquer fonte), linha do tempo por fonte, gráficos de Hs e vento com o limite, % de concordância entre fontes, avisos da Marinha vigentes no período (texto original), limites aplicados e alertas (fonte fora do ar, dados faltando, avisos desatualizados).

## Fontes de previsão

Todas via [Open-Meteo](https://open-meteo.com) (gratuita, sem chave): melhor modelo, NOAA GFS/GFS-Wave e ECMWF IFS/WAM, uma requisição por modelo. Edite `SOURCES` em `meteocean/config.py` para trocar ou acrescentar. Se um nome de modelo estiver errado ou uma fonte cair, o relatório mostra o erro em vez de escondê-lo; se todas caírem, a análise termina em erro.

Avisos de Mau Tempo: página oficial do CHM/Marinha (`NAVY_URL` em `config.py`), coletada no máximo a cada 7 dias (verificação de hora em hora com o servidor aberto, e também ao gerar uma análise com o cache vencido).

## Usar pelo celular (mesma rede Wi-Fi)

1. No computador: `METEOCEAN_HOST=0.0.0.0 python3 run.py` (Windows PowerShell: `$env:METEOCEAN_HOST="0.0.0.0"; python run.py`).
2. O terminal mostra `No celular (mesmo Wi-Fi): http://192.168.x.x:8000`. Abra esse endereço no navegador do celular.
3. Se não abrir, libere a porta 8000 no firewall do computador (permita o Python em rede privada).
4. O mapa no celular precisa de internet para os blocos do OpenStreetMap.

Sem senha: qualquer aparelho na mesma rede consegue abrir e alterar seus dados. Faça isso só em rede de casa, nunca em Wi-Fi público. Nessa configuração o servidor deixa de checar o `Host`, mas continua barrando `Origin` de outros sites. Fora de casa, use a versão em artefato (`artifact/metocean-op.html`, dados colados).

## Segurança (servidor sem senha)

Por padrão escuta apenas em `127.0.0.1`. Rejeita requisições com `Host` ou `Origin` de outros sites e exige `Content-Type: application/json` nas escritas, para que uma página aberta no navegador não consiga alterar seus dados. **Não** defina `METEOCEAN_HOST=0.0.0.0` em rede que você não controla.

## Estrutura

```
run.py                     inicia o servidor
meteocean/
  config.py                portas, fontes, URL da Marinha
  db.py                    SQLite
  limits.py                limites, GO/NO-GO por hora, nascer/pôr do sol
  providers.py             Open-Meteo e fonte de demonstração
  navy.py                  coleta e parser dos avisos da Marinha
  analysis.py              janelas, cenário conservador/otimista, concordância
  report.py                relatório HTML autocontido (SVG embutido)
  service.py               orquestra uma análise
  server.py                API JSON + páginas (http.server)
  static/                  tela (HTML, CSS, JS; mapa com Leaflet via unpkg.com)
tests/                     unittest
```

## Limites conhecidos

- A tela do mapa carrega o Leaflet e os blocos do OpenStreetMap pela internet; sem rede, o app avisa e continua usável digitando as coordenadas.
- O parser dos avisos foi escrito a partir do formato publicado na página (`AVISO NR n/AAAA … EMITIDO ÀS … A PARTIR DE … VÁLIDO ATÉ …`). Se o layout mudar, o status vira `formato_nao_reconhecido` e o relatório alerta.
- Os avisos não são filtrados por polígono: informe a(s) área(s) no local para destacar os relevantes; os demais aparecem como METAREA V.
- Maré e corrente ainda não entram na análise.
- Apoio à decisão: não substitui julgamento, boletins oficiais nem observação local.
