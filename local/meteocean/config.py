"""Configuração central. Tudo pode ser sobrescrito por variáveis de ambiente."""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.environ.get("METEOCEAN_DATA", BASE_DIR / "data"))
REPORTS_DIR = DATA_DIR / "reports"
SNAPSHOTS_DIR = DATA_DIR / "snapshots"
DB_PATH = DATA_DIR / "meteocean.db"
STATIC_DIR = Path(__file__).resolve().parent / "static"

# Uso pessoal, sem senha: por isso o servidor escuta SÓ neste computador.
# Só mude METEOCEAN_HOST para 0.0.0.0 se souber que a rede é confiável.
HOST = os.environ.get("METEOCEAN_HOST", "127.0.0.1")
PORT = int(os.environ.get("METEOCEAN_PORT", "8000"))

# Modo demonstração: dados sintéticos, sem internet.
DEMO = os.environ.get("METEOCEAN_DEMO", "0") == "1"

USER_AGENT = "meteocean-op/0.1 (uso pessoal)"
HTTP_TIMEOUT = 30

# Fontes de previsão. Todas vêm da API gratuita Open-Meteo (sem chave),
# uma requisição por modelo. Edite à vontade: wind_model alimenta o vento
# (api.open-meteo.com) e wave_model alimenta as ondas (marine-api.open-meteo.com).
# None = "melhor modelo" automático da Open-Meteo.
# Os nomes dos modelos devem ser conferidos na documentação da Open-Meteo;
# se um nome estiver errado, a fonte falha e o relatório avisa em vez de esconder.
SOURCES = [
    {"id": "om_best", "label": "Open-Meteo (melhor modelo)", "wind_model": None, "wave_model": None},
    {"id": "gfs", "label": "NOAA GFS / GFS-Wave", "wind_model": "gfs_seamless", "wave_model": "ncep_gfswave025"},
    {"id": "ecmwf", "label": "ECMWF IFS / WAM", "wind_model": "ecmwf_ifs025", "wave_model": "ecmwf_wam025"},
]

# Avisos de Mau Tempo da Marinha (METAREA V) — Centro de Hidrografia da Marinha.
NAVY_URL = os.environ.get(
    "METEOCEAN_NAVY_URL",
    "https://www.marinha.mil.br/chm/dados-do-smm-avisos-de-mau-tempo/avisos-de-mau-tempo",
)
NAVY_REFRESH_DAYS = 7

MAX_DAYS = 10
