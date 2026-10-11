"""Cruza as séries de cada fonte com os limites e calcula janelas operacionais.

Nunca acessa a rede: recebe dados prontos (fácil de testar com fixtures).
Definições:
  * janela por fonte      -> horas seguidas GO naquela fonte (>= min_window_h)
  * janela conservadora   -> GO só se NENHUMA fonte disser NO-GO
  * janela otimista       -> GO se QUALQUER fonte disser GO
  * concordância          -> % das horas (com >= 2 fontes opinando) em que todas decidem igual
"""
from . import limits as lim

HOUR = 3600


def _maxv(vals):
    vals = [v for v in vals if v is not None]
    return max(vals) if vals else None


def _windows(status, min_h, extra):
    """status: lista GO/NO-GO por hora. extra(i0, i1) -> dict de estatísticas da janela."""
    wins, dropped = [], 0
    i, n = 0, len(status)
    while i < n:
        if status[i] != "go":
            i += 1
            continue
        j = i
        while j < n and status[j] == "go":
            j += 1
        if j - i >= min_h:
            w = {"i0": i, "i1": j, "hours": j - i}
            w.update(extra(i, j))
            wins.append(w)
        else:
            dropped += 1
        i = j
    return wins, dropped


def analyze(source_results, limits, lat, lon, start_ts, end_ts):
    limits = lim.normalize(limits)
    first = (start_ts // HOUR) * HOUR
    grid = list(range(first, end_ts, HOUR))
    if not grid:
        raise ValueError("período vazio")
    day = lim.daylight_intervals(lat, lon, first, end_ts) if limits["daylight_only"] else None
    min_h = limits["min_window_h"]

    sources = []
    for sr in source_results:
        idx = {r["ts"]: r for r in sr["series"]}
        st, rs = [], []
        cols = {"hs": [], "tp": [], "wind": [], "gust": []}
        for ts in grid:
            row = idx.get(ts)
            if row is None:
                st.append("nodata")
                rs.append(["sem previsão para esta hora"])
                for k in cols:
                    cols[k].append(None)
                continue
            s, reasons = lim.evaluate_hour(dict(row, ts=ts), limits, day)
            st.append(s)
            rs.append(reasons)
            cols["hs"].append(row.get("hs"))
            cols["tp"].append(row.get("tp"))
            cols["wind"].append(row.get("wind_kn"))
            cols["gust"].append(row.get("gust_kn"))

        def extra(i0, i1, cols=cols):
            return {"max_hs": _maxv(cols["hs"][i0:i1]), "max_wind": _maxv(cols["wind"][i0:i1]),
                    "max_gust": _maxv(cols["gust"][i0:i1])}

        wins, dropped = _windows(st, min_h, extra)
        sources.append({
            "id": sr["id"], "label": sr["label"], "note": sr.get("note"), "meta": sr.get("meta", {}),
            "fetched_at": sr.get("fetched_at"), "status": st, "reasons": rs,
            "hs": cols["hs"], "tp": cols["tp"], "wind": cols["wind"], "gust": cols["gust"],
            "windows": wins, "dropped_short": dropped,
            "n_go": st.count("go"), "n_nogo": st.count("nogo"), "n_nodata": st.count("nodata"),
        })

    # ---- consolidação ----
    cons, opt, nsrc, agree_ok, compared = [], [], [], 0, 0
    for i in range(len(grid)):
        votes = [s["status"][i] for s in sources]
        decided = [v for v in votes if v in ("go", "nogo")]
        nsrc.append(len(decided))
        if not decided:
            cons.append("nodata")
            opt.append("nodata")
            continue
        cons.append("nogo" if "nogo" in decided else "go")
        opt.append("go" if "go" in decided else "nogo")
        if len(decided) >= 2:
            compared += 1
            if len(set(decided)) == 1:
                agree_ok += 1

    def cons_extra(i0, i1):
        def worst(key):
            return _maxv([_maxv(s[key][i0:i1]) for s in sources])
        return {"max_hs": worst("hs"), "max_wind": worst("wind"), "max_gust": worst("gust"),
                "min_sources": min(nsrc[i0:i1])}

    cons_w, cons_drop = _windows(cons, min_h, cons_extra)
    opt_w, _ = _windows(opt, min_h, cons_extra)

    return {
        "grid": grid, "limits": limits, "start_ts": start_ts, "end_ts": end_ts,
        "sources": sources,
        "conservative": {"status": cons, "n_sources": nsrc, "windows": cons_w, "dropped_short": cons_drop},
        "optimistic": {"status": opt, "windows": opt_w},
        "agreement": {"compared": compared, "agree": agree_ok, "disagree": compared - agree_ok,
                      "pct": round(100 * agree_ok / compared, 1) if compared else None},
    }


def summarize(result, errors):
    cw = result["conservative"]["windows"]
    g = result["grid"]
    longest = max(cw, key=lambda w: w["hours"]) if cw else None
    return {
        "sources_ok": len(result["sources"]),
        "sources_failed": len(errors),
        "conservative_windows": len(cw),
        "conservative_go_hours": result["conservative"]["status"].count("go"),
        "total_hours": len(g),
        "first_window_ts": g[cw[0]["i0"]] if cw else None,
        "longest_window_h": longest["hours"] if longest else 0,
        "longest_window_ts": g[longest["i0"]] if longest else None,
        "agreement_pct": result["agreement"]["pct"],
    }
