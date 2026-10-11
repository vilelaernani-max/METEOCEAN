"""Avisos de Mau Tempo da Marinha (METAREA V, Centro de Hidrografia da Marinha).

A página publica blocos em português e espelho em inglês, no formato:
    AVISO NR 737/2026 AVISO DE VENTO FORTE EMITIDO ÀS 1500Z - TER - 06/OUT/2026
    ... ÁREA ... A PARTIR DE ddhhmmZ ... VÁLIDO ATÉ ddhhmmZ
O parser é heurístico: o texto original de cada aviso é sempre guardado e
exibido no relatório, e uma mudança de layout vira alerta (não silêncio).
"""
import hashlib
import json
import re
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone, timedelta
from html.parser import HTMLParser

from . import config, db

MONTHS = {"JAN": 1, "FEV": 2, "MAR": 3, "ABR": 4, "MAI": 5, "JUN": 6,
          "JUL": 7, "AGO": 8, "SET": 9, "OUT": 10, "NOV": 11, "DEZ": 12}
KNOWN_AREAS = ["ALFA", "BRAVO", "CHARLIE", "DELTA", "ECHO", "FOXTROT", "GOLF", "HOTEL",
               "NOVEMBER", "SIERRA", "COSTEIRA", "OCEÂNICA", "OCEANICA"]

_BLOCK_START = re.compile(r"(?:AVISO|WARNING)\s+(?:NR|N[ºO°]?)\s*\d+\s*/\s*\d{4}", re.I)
_PT_START = re.compile(r"AVISO\s+(?:NR|N[ºO°]?)\s*(\d+)\s*/\s*(\d{4})", re.I)
_ISSUED = re.compile(r"EMITIDO\s+[ÀA]S\s+(\d{2})(\d{2})Z\s*-\s*[A-ZÇÁÉÍÓÚÃÕ]{3}\s*-\s*(\d{1,2})/([A-Z]{3})/(\d{4})", re.I)
_FROM = re.compile(r"A\s+PARTIR\s+DE\s+(\d{2})(\d{2})(\d{2})Z", re.I)
_TO = re.compile(r"V[ÁA]LIDO\s+AT[ÉE]\s+(\d{2})(\d{2})(\d{2})Z", re.I)
_NONE = re.compile(r"N[ÃA]O\s+H[ÁA]\s+AVISO|SEM\s+AVISO|\bNIL\b", re.I)


class _Text(HTMLParser):
    BLOCKS = {"p", "div", "br", "li", "tr", "h1", "h2", "h3", "h4", "h5", "table", "section", "article"}

    def __init__(self):
        super().__init__()
        self.out = []
        self._skip = 0

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "noscript"):
            self._skip += 1
        if tag in self.BLOCKS:
            self.out.append("\n")

    def handle_endtag(self, tag):
        if tag in ("script", "style", "noscript") and self._skip:
            self._skip -= 1
        if tag in self.BLOCKS:
            self.out.append("\n")

    def handle_data(self, data):
        if not self._skip:
            self.out.append(data)


def html_to_text(html):
    p = _Text()
    p.feed(html)
    text = "".join(p.out).replace("\xa0", " ")
    lines = [re.sub(r"[ \t]+", " ", ln).strip() for ln in text.splitlines()]
    return "\n".join(ln for ln in lines if ln)


def _dt(y, mo, d, h=0, mi=0):
    return datetime(y, mo, d, h, mi, tzinfo=timezone.utc)


def _resolve_ddhhmm(dd, hh, mm, ref, not_before):
    """Resolve ddhhmmZ usando mês/ano de `ref`; avança 1 mês se ficaria antes de not_before."""
    y, mo = ref.year, ref.month
    for _ in range(3):
        try:
            cand = _dt(y, mo, dd, hh, mm)
            if cand >= not_before:
                return cand
        except ValueError:
            pass
        mo += 1
        if mo > 12:
            mo, y = 1, y + 1
    return None


def parse_text(text):
    """Texto puro da página -> (lista de avisos, status)."""
    text = text.replace("\r", "")
    starts = [m.start() for m in _BLOCK_START.finditer(text)]
    warnings = []
    for i, s in enumerate(starts):
        chunk = text[s:starts[i + 1] if i + 1 < len(starts) else len(text)].strip()
        m = _PT_START.match(chunk)
        if not m:
            continue                      # espelho em inglês: ignorado
        number = f"{m.group(1)}/{m.group(2)}"
        flat = re.sub(r"\s+", " ", chunk)
        after = flat[m.end():]
        k = re.search(r"EMITIDO|A PARTIR DE|V[ÁA]LIDO", after, re.I)
        kind = (after[:k.start()] if k else after[:60]).strip(" -:") or None

        issued = None
        im = _ISSUED.search(flat)
        if im:
            mon = MONTHS.get(im.group(4).upper())
            if mon:
                try:
                    issued = _dt(int(im.group(5)), mon, int(im.group(3)), int(im.group(1)), int(im.group(2)))
                except ValueError:
                    issued = None
        ref = issued or datetime.now(timezone.utc)
        v_from = v_to = None
        fm = _FROM.search(flat)
        if fm:
            v_from = _resolve_ddhhmm(int(fm.group(1)), int(fm.group(2)), int(fm.group(3)),
                                     ref, ref - timedelta(days=3))
        tm = _TO.search(flat)
        if tm:
            v_to = _resolve_ddhhmm(int(tm.group(1)), int(tm.group(2)), int(tm.group(3)),
                                   v_from or ref, v_from or ref - timedelta(days=3))

        upper = flat.upper()
        areas = sorted({a for a in KNOWN_AREAS if re.search(rf"\b{a}\b", upper)})
        areas = ["OCEÂNICA" if a == "OCEANICA" else a for a in areas]
        areas = sorted(set(areas))
        warnings.append({
            "number": number, "kind": kind, "areas": areas,
            "issued_ts": int(issued.timestamp()) if issued else None,
            "valid_from_ts": int(v_from.timestamp()) if v_from else None,
            "valid_to_ts": int(v_to.timestamp()) if v_to else None,
            "text": chunk,
            "hash": hashlib.sha1(flat.upper().encode("utf-8")).hexdigest(),
        })

    if warnings:
        return warnings, f"ok: {len(warnings)} aviso(s) identificado(s)"
    if _NONE.search(text):
        return [], "ok: página informa que não há avisos"
    return [], "formato_nao_reconhecido"


def _store(warnings):
    now = int(time.time())
    new = 0
    with db.connect() as c:
        for w in warnings:
            cur = c.execute(
                "INSERT OR IGNORE INTO navy_warnings "
                "(hash, number, kind, areas, issued_ts, valid_from_ts, valid_to_ts, text, fetched_at) "
                "VALUES (?,?,?,?,?,?,?,?,?)",
                (w["hash"], w["number"], w["kind"], json.dumps(w["areas"]), w["issued_ts"],
                 w["valid_from_ts"], w["valid_to_ts"], w["text"], now))
            new += cur.rowcount
        c.execute("DELETE FROM navy_warnings WHERE fetched_at < ?", (now - 90 * 86400,))
    return new


def _record(status):
    db.set_meta("navy_last_fetch", int(time.time()))
    db.set_meta("navy_last_status", status)


def ingest_text(text):
    """Usado tanto pelo fetch quanto pelo 'colar texto' manual."""
    warnings, status = parse_text(text)
    new = _store(warnings)
    _record(status)
    return {"status": status, "found": len(warnings), "new": new}


def refresh():
    """Busca a página oficial. Nunca levanta: devolve o status (e registra erro)."""
    req = urllib.request.Request(config.NAVY_URL, headers={"User-Agent": config.USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=config.HTTP_TIMEOUT) as r:
            html = r.read().decode("utf-8", "replace")
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        status = f"erro: {e}"
        db.set_meta("navy_last_status", status)       # não atualiza last_fetch: continua 'velho'
        return {"status": status, "found": 0, "new": 0}
    return ingest_text(html_to_text(html))


def last_info():
    ts = db.get_meta("navy_last_fetch")
    return {"last_fetch": int(ts) if ts else None,
            "status": db.get_meta("navy_last_status", "nunca buscado"),
            "url": config.NAVY_URL}


def is_stale(now=None):
    ts = db.get_meta("navy_last_fetch")
    if not ts:
        return True
    return (now or time.time()) - int(ts) > config.NAVY_REFRESH_DAYS * 86400


def warnings_for(start_ts, end_ts):
    """Avisos cuja vigência toca o período. Sem vigência conhecida: emissão + 72 h."""
    out = []
    with db.connect() as c:
        rows = c.execute("SELECT * FROM navy_warnings ORDER BY issued_ts DESC, id DESC").fetchall()
    for r in rows:
        d = db.row_to_dict(r, ("areas",))
        a = d["valid_from_ts"] or d["issued_ts"]
        b = d["valid_to_ts"] or ((d["issued_ts"] or d["fetched_at"]) + 72 * 3600)
        if a is None:
            a = d["fetched_at"]
        if a < end_ts and b > start_ts:
            d["validity_known"] = d["valid_to_ts"] is not None
            out.append(d)
    return out
