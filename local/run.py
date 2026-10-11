#!/usr/bin/env python3
"""Inicia o MetOcean OP.

  python3 run.py            abre o app (e o navegador) em http://localhost:8000
  python3 run.py --check    testa se as fontes de previsão respondem (precisa de internet)
  METEOCEAN_DEMO=1 python3 run.py   demonstração offline
"""
import sys

from meteocean import config


def check():
    import time
    from meteocean.providers import build_sources
    now = int(time.time())
    ok_all = True
    for s in build_sources():
        try:
            r = s.fetch(-22.95, -43.19, now, now + 2 * 86400)
            n = len(r["series"])
            hs = sum(1 for x in r["series"] if x.get("hs") is not None)
            print(f"OK    {s.label}: {n} horas ({hs} com onda)")
        except Exception as e:  # noqa: BLE001
            ok_all = False
            print(f"FALHA {s.label}: {e}")
    return 0 if ok_all else 1


if __name__ == "__main__":
    if "--check" in sys.argv:
        sys.exit(check())
    if "--no-browser" not in sys.argv and not config.DEMO:
        import threading, webbrowser
        threading.Timer(1.2, lambda: webbrowser.open(f"http://localhost:{config.PORT}")).start()
    from meteocean.server import serve
    serve()
