"""Orquestra uma análise: coleta -> avisos -> limites/janelas -> relatório HTML."""
import json
import time
import traceback
from concurrent.futures import ThreadPoolExecutor

from . import analysis, config, db, limits as lim, navy, providers, report

HOUR = 3600


def normalize_tags(tags):
    if isinstance(tags, str):
        tags = [t for t in tags.replace(";", ",").split(",")]
    out, seen = [], set()
    for t in tags or []:
        t = str(t).strip()[:30]
        if t and t.lower() not in seen:
            seen.add(t.lower())
            out.append(t)
    return out[:20]


def create_analysis(location_id, profile_id, days, tags):
    days = int(days)
    if not 1 <= days <= config.MAX_DAYS:
        raise ValueError(f"days deve estar entre 1 e {config.MAX_DAYS}")
    now = int(time.time())
    start = (now // HOUR) * HOUR
    end = start + days * 86400
    with db.connect() as c:
        loc = c.execute("SELECT * FROM locations WHERE id=?", (location_id,)).fetchone()
        prof = c.execute("SELECT * FROM profiles WHERE id=?", (profile_id,)).fetchone()
        if not loc:
            raise ValueError("local não encontrado")
        if not prof:
            raise ValueError("perfil de limites não encontrado")
        cur = c.execute(
            "INSERT INTO analyses (location_id, profile_id, location_name, profile_name, lat, lon, "
            "start_ts, end_ts, tags, status, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            (loc["id"], prof["id"], loc["name"], prof["name"], loc["lat"], loc["lon"],
             start, end, json.dumps(normalize_tags(tags)), "queued", now))
        return cur.lastrowid


def _set(analysis_id, **fields):
    cols = ", ".join(f"{k}=?" for k in fields)
    with db.connect() as c:
        c.execute(f"UPDATE analyses SET {cols} WHERE id=?", (*fields.values(), analysis_id))


def run_analysis(analysis_id, demo=None):
    """Roda de forma síncrona (o servidor chama numa thread). Nunca levanta."""
    try:
        with db.connect() as c:
            a = c.execute("SELECT * FROM analyses WHERE id=?", (analysis_id,)).fetchone()
            loc = c.execute("SELECT * FROM locations WHERE id=?", (a["location_id"],)).fetchone()
            prof = c.execute("SELECT * FROM profiles WHERE id=?", (a["profile_id"],)).fetchone()
        a = db.row_to_dict(a, ("tags",))
        location = {"name": a["location_name"], "lat": a["lat"], "lon": a["lon"],
                    "tz_offset": loc["tz_offset"] if loc else -3.0,
                    "areas": loc["areas"] if loc else ""}
        limits = lim.normalize(json.loads(prof["limits"]) if prof else {})

        _set(analysis_id, status="collecting")
        sources = providers.build_sources(demo)

        def fetch(src):
            try:
                r = src.fetch(a["lat"], a["lon"], a["start_ts"], a["end_ts"])
                r.update(id=src.id, label=src.label, fetched_at=int(time.time()))
                return ("ok", r)
            except Exception as e:  # uma fonte ruim não derruba as outras
                return ("err", {"id": src.id, "label": src.label, "error": str(e) or e.__class__.__name__})

        with ThreadPoolExecutor(max_workers=len(sources)) as ex:
            outcomes = list(ex.map(fetch, sources))
        ok = [o[1] for o in outcomes if o[0] == "ok"]
        errors = [o[1] for o in outcomes if o[0] == "err"]
        if not ok:
            msg = "; ".join(f"{e['label']}: {e['error']}" for e in errors)
            _set(analysis_id, status="error", error=f"Nenhuma fonte respondeu. {msg}"[:900],
                 finished_at=int(time.time()))
            return

        if not demo and not config.DEMO and navy.is_stale():
            navy.refresh()          # não fatal: o relatório mostra a situação do cache

        _set(analysis_id, status="analyzing")
        result = analysis.analyze(ok, limits, a["lat"], a["lon"], a["start_ts"], a["end_ts"])
        summary = analysis.summarize(result, errors)
        warnings = navy.warnings_for(a["start_ts"], a["end_ts"])

        ctx = {"result": result, "errors": errors, "location": location, "profile_name": a["profile_name"],
               "tags": a["tags"], "navy_warnings": warnings, "navy_info": navy.last_info(),
               "navy_stale": navy.is_stale(), "generated_ts": int(time.time())}
        html_doc = report.build_html(ctx)
        config.REPORTS_DIR.mkdir(parents=True, exist_ok=True)
        config.SNAPSHOTS_DIR.mkdir(parents=True, exist_ok=True)
        (config.REPORTS_DIR / f"{analysis_id}.html").write_text(html_doc, encoding="utf-8")
        (config.SNAPSHOTS_DIR / f"{analysis_id}.json").write_text(json.dumps({
            "analysis": a, "limits": limits, "location": location,
            "sources": [{k: v for k, v in s.items()} for s in ok], "errors": errors,
            "navy_warnings": warnings}, ensure_ascii=False), encoding="utf-8")
        _set(analysis_id, status="done", summary=json.dumps(summary), error=None,
             finished_at=int(time.time()))
    except Exception as e:
        traceback.print_exc()
        _set(analysis_id, status="error", error=f"Erro interno: {e}"[:900], finished_at=int(time.time()))
