"""Coleta a página de Avisos de Mau Tempo da Marinha e grava avisos.json.

Usado pela GitHub Action (.github/workflows/avisos.yml). A página web lê o
avisos.json e faz a interpretação (parse) no navegador. Só biblioteca padrão.
"""
import json
import sys
import time
import urllib.request
from html.parser import HTMLParser
import re

URL = "https://www.marinha.mil.br/chm/dados-do-smm-avisos-de-mau-tempo/avisos-de-mau-tempo"
OUT = sys.argv[1] if len(sys.argv) > 1 else "avisos.json"


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


def main():
    req = urllib.request.Request(URL, headers={"User-Agent": "Mozilla/5.0 (MetOcean OP coletor)"})
    with urllib.request.urlopen(req, timeout=60) as r:
        html = r.read().decode(r.headers.get_content_charset() or "utf-8", "replace")
    p = Texto()
    p.feed(html)
    linhas = [re.sub(r"[ \t]+", " ", ln).strip() for ln in "".join(p.out).replace("\xa0", " ").splitlines()]
    texto = "\n".join(ln for ln in linhas if ln)
    if len(texto) < 50:
        sys.exit("página sem conteúdo útil; avisos.json não foi alterado")
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump({"fetched_at": int(time.time()), "source": URL, "text": texto}, f, ensure_ascii=False)
    print(f"ok: {len(texto)} caracteres")


if __name__ == "__main__":
    main()
