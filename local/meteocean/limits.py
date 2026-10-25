"""Limites operacionais configuráveis e avaliação hora a hora (GO / NO-GO)."""
import math
from datetime import datetime, timezone, timedelta
from decimal import Decimal, ROUND_HALF_UP

HOUR = 3600

DEFAULT_LIMITS = {
    "hs_max": 1.5,        # altura significativa de onda, m
    "tp_min": None,       # período mínimo de pico, s (None = ignorar)
    "wind_max": 20,       # vento médio a 10 m, nós
    "gust_max": None,     # rajada, nós (None = ignorar)
    "daylight_only": False,
    "min_window_h": 4,    # janela só conta se tiver ao menos N horas seguidas
}


def fmt1(value):
    """Uma casa decimal, empate para cima: igual ao toFixed(1) do app web (o :.1f do Python arredonda empate para par)."""
    return str(Decimal(value).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP))


def normalize(raw):
    """Converte o que veio da API/UI num perfil válido; levanta ValueError se absurdo."""
    out = dict(DEFAULT_LIMITS)
    raw = raw or {}
    for key in ("hs_max", "tp_min", "wind_max", "gust_max"):
        if key in raw:
            v = raw[key]
            if v in (None, ""):
                out[key] = None
            else:
                try:
                    f = float(v)
                except (TypeError, ValueError):
                    raise ValueError(f"Valor inválido para {key}: {v!r}")
                if f < 0 or math.isnan(f) or math.isinf(f):
                    raise ValueError(f"{key} não pode ser negativo")
                out[key] = f
    if "daylight_only" in raw:
        out["daylight_only"] = bool(raw["daylight_only"])
    if "min_window_h" in raw:
        try:
            m = int(float(raw["min_window_h"]))
        except (TypeError, ValueError):
            raise ValueError("min_window_h inválido")
        out["min_window_h"] = max(1, min(m, 72))
    return out


# ---- sol (algoritmo NOAA simplificado, precisão de poucos minutos) ----

def _sun_utc(day_utc, lat, lon):
    """(nascer, pôr) em timestamps UTC para a data civil UTC dada. None se sol polar."""
    n = day_utc.timetuple().tm_yday
    g = 2 * math.pi / 365 * (n - 1)
    eqtime = 229.18 * (0.000075 + 0.001868 * math.cos(g) - 0.032077 * math.sin(g)
                       - 0.014615 * math.cos(2 * g) - 0.040849 * math.sin(2 * g))
    decl = (0.006918 - 0.399912 * math.cos(g) + 0.070257 * math.sin(g)
            - 0.006758 * math.cos(2 * g) + 0.000907 * math.sin(2 * g)
            - 0.002697 * math.cos(3 * g) + 0.00148 * math.sin(3 * g))
    latr = math.radians(lat)
    cosha = (math.cos(math.radians(90.833)) / (math.cos(latr) * math.cos(decl))
             - math.tan(latr) * math.tan(decl))
    if cosha > 1:
        return None  # noite polar
    if cosha < -1:
        return ("polar_day",)
    ha = math.degrees(math.acos(cosha))
    rise_min = 720 - 4 * (lon + ha) - eqtime
    set_min = 720 - 4 * (lon - ha) - eqtime
    base = datetime(day_utc.year, day_utc.month, day_utc.day, tzinfo=timezone.utc)
    return (int((base + timedelta(minutes=rise_min)).timestamp()),
            int((base + timedelta(minutes=set_min)).timestamp()))


def daylight_intervals(lat, lon, start_ts, end_ts):
    """Intervalos [nascer, pôr] cobrindo o período (olha um dia antes e um depois)."""
    out = []
    d = datetime.fromtimestamp(start_ts, tz=timezone.utc).date() - timedelta(days=1)
    last = datetime.fromtimestamp(end_ts, tz=timezone.utc).date() + timedelta(days=1)
    while d <= last:
        res = _sun_utc(d, lat, lon)
        if res and res[0] == "polar_day":
            return [(start_ts - 86400, end_ts + 86400)]
        if res:
            out.append(res)
        d += timedelta(days=1)
    return out


def is_daylight(ts, intervals):
    return any(a <= ts and ts + HOUR <= b for a, b in intervals)


# ---- avaliação ----

def evaluate_hour(row, limits, day_intervals=None):
    """row: dict com hs, tp, wind_kn, gust_kn (None = sem dado).
    Retorna (status, motivos). status: go | nogo | nodata."""
    reasons = []
    missing = []

    def check(value, limit, label, unit, kind):
        if limit is None:
            return
        if value is None:
            missing.append(label)
        elif kind == "max" and value > limit:
            reasons.append(f"{label} {fmt1(value)} > {limit:g} {unit}")
        elif kind == "min" and value < limit:
            reasons.append(f"{label} {fmt1(value)} < {limit:g} {unit}")

    check(row.get("hs"), limits.get("hs_max"), "Hs", "m", "max")
    check(row.get("tp"), limits.get("tp_min"), "Tp", "s", "min")
    check(row.get("wind_kn"), limits.get("wind_max"), "vento", "kn", "max")
    check(row.get("gust_kn"), limits.get("gust_max"), "rajada", "kn", "max")

    if limits.get("daylight_only") and day_intervals is not None:
        if not is_daylight(row["ts"], day_intervals):
            reasons.append("fora do período diurno")

    if reasons:
        return "nogo", reasons
    if missing:
        return "nodata", [f"sem dado de {m}" for m in missing]
    return "go", []
