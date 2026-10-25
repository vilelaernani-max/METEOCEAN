"""Teste de paridade: o cálculo do app web (index.html, JavaScript) tem de dar o mesmo resultado
que o do app local (local/meteocean, Python) para os limites que os dois têm em comum:
hs_max, tp_min, wind_max, gust_max, daylight_only, min_window_h.

Rodar na raiz do repositório:  python3 tests/paridade.py
Precisa de Node. Só biblioteca padrão. Cobre: normalização de limites, nascer/pôr do sol,
avaliação hora a hora (inclusive o texto dos motivos) e a análise completa (janelas, cenários, concordância).
"""
import json
import os
import random
import subprocess
import sys
from datetime import datetime, timezone

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(RAIZ, "local"))
from meteocean import analysis, limits as lim  # noqa: E402

COMUNS = ("hs_max", "tp_min", "wind_max", "gust_max", "daylight_only", "min_window_h")
falhas = []


def ts(a, m, d, h=0):
    return int(datetime(a, m, d, h, tzinfo=timezone.utc).timestamp())


def igual(a, b, tol=1e-9):
    if isinstance(a, (int, float)) and isinstance(b, (int, float)) and not isinstance(a, bool) and not isinstance(b, bool):
        return abs(a - b) <= tol
    if isinstance(a, dict) and isinstance(b, dict):
        return a.keys() == b.keys() and all(igual(a[k], b[k], tol) for k in a)
    if isinstance(a, (list, tuple)) and isinstance(b, (list, tuple)):
        return len(a) == len(b) and all(igual(x, y, tol) for x, y in zip(a, b))
    return a == b


def confere(nome, py, js):
    if not igual(py, js):
        falhas.append(nome)
        print("DIVERGE", nome, "\n  python:", json.dumps(py, ensure_ascii=False)[:400], "\n  js:    ", json.dumps(js, ensure_ascii=False)[:400])


def tenta(f):
    try:
        return {"ok": f()}
    except ValueError as e:
        return {"erro": str(e)}


rng = random.Random(20261025)
LIMITES = [
    {}, {"hs_max": 1}, {"hs_max": 2.5, "tp_min": 7, "wind_max": 25, "gust_max": 30, "daylight_only": True, "min_window_h": 6},
    {"hs_max": None, "wind_max": None}, {"hs_max": "", "tp_min": "8"}, {"hs_max": "1.2", "wind_max": "15", "min_window_h": "3"},
    {"min_window_h": 0}, {"min_window_h": 100}, {"min_window_h": 2.9}, {"daylight_only": 0}, {"daylight_only": 1},
    {"hs_max": -1}, {"hs_max": "abc"}, {"wind_max": "Infinity"}, {"gust_max": -0.1}, {"min_window_h": "x"},
]
SOL = [{"lat": la, "lon": lo, "ini": ts(a, m, d), "fim": ts(a, m, d) + n * 86400}
       for (la, lo) in [(-22.95, -43.19), (0, -50), (-33, 151), (51.5, 0), (64, -20), (-75, 0), (78, 15), (-23, -45), (35, 139)]
       for (a, m, d, n) in [(2026, 1, 1, 3), (2026, 3, 20, 2), (2026, 6, 21, 3), (2026, 9, 23, 2), (2026, 12, 21, 4), (2028, 2, 29, 2)]]

HORAS = []
for _ in range(400):
    L = rng.choice(LIMITES[1:3] + LIMITES[5:6] + [{"hs_max": 1.5, "tp_min": 8, "wind_max": 20, "gust_max": 25}])
    L = dict(L, daylight_only=rng.random() < 0.3)
    f = lambda lo, hi: None if rng.random() < 0.12 else round(rng.uniform(lo, hi), rng.choice([1, 2, 3]))
    HORAS.append({"limites": L, "lat": -22.95, "lon": -43.19,
                  "row": {"ts": ts(2026, 10, 25, rng.randrange(24)) + 3600 * rng.randrange(0, 72), "hs": f(0, 4), "tp": f(3, 14), "wind_kn": f(0, 40), "gust_kn": f(0, 55)}})
# empates exatos no limite e valores com meio-ponto (arredondamento do texto dos motivos)
for v in (0.25, 0.75, 1.25, 1.35, 1.45, 1.5, 1.55, 2.25, 2.675, 0.05, 0.15, 0.35):
    HORAS.append({"limites": {"hs_max": 1, "wind_max": 1, "tp_min": 20, "gust_max": 1}, "lat": 0, "lon": 0, "row": {"ts": ts(2026, 6, 1, 12), "hs": v, "tp": v, "wind_kn": v, "gust_kn": v}})

def fonte(i, n, perfil):
    base, serie = rng.uniform(0.5, 2.0), []
    for h in range(n):
        if rng.random() < perfil["buraco"]:
            continue
        g = lambda x, a=0.0: None if rng.random() < perfil["nulo"] else round(max(0.0, x + rng.gauss(0, a)), 2)
        serie.append({"ts": 0 + h, "hs": g(base + 0.8 * __import__("math").sin(h / 9 + i), 0.15), "tp": g(8, 1.5), "wind_kn": g(12 + 8 * __import__("math").sin(h / 7 + 2 * i), 2), "gust_kn": g(17, 3)})
    return serie

ANALISES = []
for caso in range(60):
    n_fontes = rng.choice([1, 2, 3, 3, 4])
    ini = ts(2026, rng.choice([1, 4, 7, 10]), rng.randrange(1, 28), rng.randrange(24)) + rng.choice([0, 0, 1800, 2400])
    dias = rng.choice([1, 3, 5, 10])
    fim = ini + dias * 86400
    primeira = (ini // 3600) * 3600
    perfil = rng.choice([{"buraco": 0.0, "nulo": 0.0}, {"buraco": 0.05, "nulo": 0.05}, {"buraco": 0.3, "nulo": 0.2}])
    fontes = []
    for i in range(n_fontes):
        s = fonte(i, dias * 24 + 6, perfil)
        for r in s:
            r["ts"] = primeira + r["ts"] * 3600
        fontes.append({"id": f"f{i}", "label": f"Fonte {i}", "series": s})
    L = dict(rng.choice([LIMITES[1], LIMITES[2], LIMITES[5], {"hs_max": 1.5, "wind_max": 18}, {"hs_max": 1.2, "tp_min": 8, "gust_max": 22, "min_window_h": 2}]),
             daylight_only=rng.random() < 0.4)
    ANALISES.append({"fontes": fontes, "limites": L, "lat": rng.choice([-22.95, -3.7, 41.0, -54.8]), "lon": rng.choice([-43.19, -38.5, 2.1, -68.3]), "ini": ini, "fim": fim})
ANALISES.append({"fontes": [{"id": "x", "label": "x", "series": []}], "limites": {}, "lat": 0, "lon": 0, "ini": ts(2026, 1, 1), "fim": ts(2026, 1, 1)})  # período vazio

ENTRADA = {"limites": LIMITES, "sol": SOL, "horas": HORAS, "analises": ANALISES}
r = subprocess.run(["node", os.path.join(RAIZ, "tests", "paridade_js.js")], input=json.dumps(ENTRADA), capture_output=True, text=True)
if r.returncode:
    sys.exit("Falha no lado JavaScript:\n" + r.stderr)
JS = json.loads(r.stdout)

# 1) normalização de limites
for i, (raw, js) in enumerate(zip(LIMITES, JS["limites"])):
    py = tenta(lambda: {k: v for k, v in lim.normalize(raw).items() if k in COMUNS})
    if "ok" in js:
        js = {"ok": {k: v for k, v in js["ok"].items() if k in COMUNS}}
    else:
        js = {"erro": "erro"}
    if "erro" in py:
        py = {"erro": "erro"}
    confere(f"limites[{i}] {raw}", py, js)

# 2) nascer/pôr do sol
for i, (c, js) in enumerate(zip(SOL, JS["sol"])):
    py = {"ok": [list(x) for x in lim.daylight_intervals(c["lat"], c["lon"], c["ini"], c["fim"])]}
    confere(f"sol[{i}] lat={c['lat']} ini={c['ini']}", py, js)

# 3) hora a hora, com o texto dos motivos
for i, (c, js) in enumerate(zip(HORAS, JS["horas"])):
    L = lim.normalize(c["limites"])
    dia = lim.daylight_intervals(c["lat"], c["lon"], c["row"]["ts"], c["row"]["ts"] + 3600) if L["daylight_only"] else None
    st, motivos = lim.evaluate_hour(c["row"], L, dia)
    confere(f"hora[{i}] {c['row']}", {"ok": [st, motivos]}, js)

# 4) análise completa
def reduz_janelas(ws):
    return [{k: w[k] for k in ("i0", "i1", "hours", "max_hs", "max_wind", "max_gust") + (("min_sources",) if "min_sources" in w else ())} for w in ws]

for i, (c, js) in enumerate(zip(ANALISES, JS["analises"])):
    py = tenta(lambda: analysis.analyze(c["fontes"], c["limites"], c["lat"], c["lon"], c["ini"], c["fim"]))
    if "erro" in py or "erro" in js:
        confere(f"análise[{i}] erro", {"erro": "erro" in py}, {"erro": "erro" in js})
        continue
    p, j = py["ok"], js["ok"]
    confere(f"análise[{i}] grade", p["grid"], j["grid"])
    confere(f"análise[{i}] limites", {k: p["limits"][k] for k in COMUNS}, {k: j["limits"][k] for k in COMUNS})
    for s, (ps, jsrc) in enumerate(zip(p["sources"], j["sources"])):
        confere(f"análise[{i}] fonte {s} status", ps["status"], jsrc["status"])
        confere(f"análise[{i}] fonte {s} janelas", reduz_janelas(ps["windows"]), reduz_janelas(jsrc["windows"]))
        confere(f"análise[{i}] fonte {s} contagens", [ps["n_go"], ps["n_nogo"], ps["n_nodata"], ps["dropped_short"]], [jsrc["n_go"], jsrc["n_nogo"], jsrc["n_nodata"], jsrc["dropped_short"]])
    confere(f"análise[{i}] conservador", [p["conservative"]["status"], p["conservative"]["n_sources"], reduz_janelas(p["conservative"]["windows"]), p["conservative"]["dropped_short"]],
            [j["conservative"]["status"], j["conservative"]["n_sources"], reduz_janelas(j["conservative"]["windows"]), j["conservative"]["dropped_short"]])
    confere(f"análise[{i}] otimista", [p["optimistic"]["status"], reduz_janelas(p["optimistic"]["windows"])], [j["optimistic"]["status"], reduz_janelas(j["optimistic"]["windows"])])
    confere(f"análise[{i}] concordância", p["agreement"], j["agreement"])

total = len(LIMITES) + len(SOL) + len(HORAS) + len(ANALISES)
print(f"{len(falhas)} divergência(s) em {total} casos" if falhas else f"ok: Python e JavaScript concordam em {total} casos")
sys.exit(1 if falhas else 0)
