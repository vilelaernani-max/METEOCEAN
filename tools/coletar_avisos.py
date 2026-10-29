"""Coleta páginas oficiais da Marinha (CHM) e grava JSON para a página web ler.

Usado pela GitHub Action (.github/workflows/avisos.yml). Só biblioteca padrão.
  avisos.json   texto da página de Avisos de Mau Tempo (METAREA V)
  boletim.json  texto bruto do boletim Meteoromarinha (previsão de 24 h e de 48 h)

Cada página é coletada separadamente: se uma falhar, as outras ainda são gravadas.
O interpretador (parse) fica no navegador; o texto bruto é guardado para conferência.

Uso: python3 tools/coletar_avisos.py [pasta-de-saida]
"""
import json
import os
import re
import sys
import time
import urllib.request
from html.parser import HTMLParser

BASE = "https://www.marinha.mil.br/chm"
AVISOS = {"id": "avisos", "url": f"{BASE}/dados-do-smm-avisos-de-mau-tempo/avisos-de-mau-tempo"}
BOLETIM = [
    {"id": "24h", "url": f"{BASE}/dados-do-smm-meteoromarinha/previsao-24-horas"},
    {"id": "48h", "url": f"{BASE}/dados-do-smm-meteoromarinha/previsao-48-horas"},
]
SAIDA = sys.argv[1] if len(sys.argv) > 1 else "."


class Texto(HTMLParser):
    BLOCOS = {"p", "div", "br", "li", "tr", "h1", "h2", "h3", "h4", "h5", "table", "section", "article"}

    def __init__(self):
        super().__init__()
        self.out, self.skip = [], 0

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "noscript"):
            self.skip += 1
        if tag in self.BLOCOS:
            self.out.append("\n")

    def handle_endtag(self, tag):
        if tag in ("script", "style", "noscript") and self.skip:
            self.skip -= 1
        if tag in self.BLOCOS:
            self.out.append("\n")

    def handle_data(self, data):
        if not self.skip:
            self.out.append(data)


def baixa_texto(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (MetOcean OP coletor)"})
    with urllib.request.urlopen(req, timeout=60) as r:
        html = r.read().decode(r.headers.get_content_charset() or "utf-8", "replace")
    p = Texto()
    p.feed(html)
    linhas = [re.sub(r"[ \t]+", " ", ln).strip() for ln in "".join(p.out).replace("\xa0", " ").splitlines()]
    texto = "\n".join(ln for ln in linhas if ln)
    if len(texto) < 50:
        raise ValueError("página sem conteúdo útil")
    return texto


def grava(nome, dados):
    caminho = os.path.join(SAIDA, nome)
    with open(caminho, "w", encoding="utf-8") as f:
        json.dump(dados, f, ensure_ascii=False)


def main():
    agora, ok, falhas = int(time.time()), 0, []
    try:
        t = baixa_texto(AVISOS["url"])
        grava("avisos.json", {"fetched_at": agora, "source": AVISOS["url"], "text": t})
        ok += 1
        print(f"avisos: ok, {len(t)} caracteres")
    except Exception as e:  # noqa: BLE001 - uma página fora do ar não derruba as outras
        falhas.append(f"avisos: {e}")
    itens = []
    for b in BOLETIM:
        try:
            t = baixa_texto(b["url"])
            itens.append({"id": b["id"], "source": b["url"], "text": t})
            print(f"boletim {b['id']}: ok, {len(t)} caracteres")
        except Exception as e:  # noqa: BLE001
            falhas.append(f"boletim {b['id']}: {e}")
    if itens:
        grava("boletim.json", {"fetched_at": agora, "items": itens})
        ok += 1
    for f in falhas:
        print("FALHA", f, file=sys.stderr)
    if not ok:
        sys.exit("nenhuma página pôde ser coletada")


if __name__ == "__main__":
    main()
