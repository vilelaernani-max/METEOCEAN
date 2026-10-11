"""Provedores de previsão. Cada fonte devolve uma série horária normalizada:

    {"ts": epoch_utc, "hs": m, "tp": s, "wave_dir": °, "wind_kn": kn, "gust_kn": kn, "wind_dir": °}

Valores ausentes são None. Tudo em UTC e unidades náuticas (m, s, nós).
"""
import json
import math
import time
import urllib.error
import urllib.parse
import urllib.request

from . import config

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
MARINE_URL = "https://marine-api.open-meteo.com/v1/marine"


class ProviderError(Exception):
    pass


def _get_json(url, params, attempts=2):
    full = f"{url}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(full, headers={"User-Agent": config.USER_AGENT})
    last = None
    for i in range(attempts):
        try:
            with urllib.request.urlopen(req, timeout=config.HTTP_TIMEOUT) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            body = ""
            try:
                body = e.read().decode("utf-8", "replace")[:300]
            except Exception:
                pass
            last = ProviderError(f"HTTP {e.code} em {url.split('//')[1].split('/')[0]}: {body}")
            if e.code < 500:      # erro do pedido (ex.: modelo inexistente): não adianta repetir
                break
        except (urllib.error.URLError, TimeoutError, ValueError, OSError) as e:
            last = ProviderError(f"falha de rede em {url.split('//')[1].split('/')[0]}: {e}")
        time.sleep(1 + i)
    raise last


def _pick(hourly, base):
    """Com um modelo só a chave é `base`; com vários vem `base_modelo`."""
    if base in hourly:
        return hourly[base]
    for k, v in hourly.items():
        if k.startswith(base + "_"):
            return v
    return None


def _num(v):
    if v is None:
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return None if math.isnan(f) else f


class OpenMeteoSource:
    def __init__(self, source_id, label, wind_model=None, wave_model=None):
        self.id = source_id
        self.label = label
        self.wind_model = wind_model
        self.wave_model = wave_model

    def fetch(self, lat, lon, start_ts, end_ts):
        days = max(1, min(config.MAX_DAYS, math.ceil((end_ts - time.time()) / 86400) + 1))
        common = {"latitude": f"{lat:.4f}", "longitude": f"{lon:.4f}", "timezone": "UTC",
                  "timeformat": "unixtime", "forecast_days": days}

        wp = dict(common, hourly="wind_speed_10m,wind_gusts_10m,wind_direction_10m", wind_speed_unit="kn")
        if self.wind_model:
            wp["models"] = self.wind_model
        wind = _get_json(FORECAST_URL, wp)

        mp = dict(common, hourly="wave_height,wave_period,wave_direction")
        if self.wave_model:
            mp["models"] = self.wave_model
        wave = _get_json(MARINE_URL, mp)

        wh, mh = wind.get("hourly"), wave.get("hourly")
        if not wh or "time" not in wh:
            raise ProviderError("resposta de vento sem dados horários")
        if not mh or "time" not in mh:
            raise ProviderError("resposta de ondas sem dados horários")

        by_ts = {}
        w_speed, w_gust, w_dir = (_pick(wh, "wind_speed_10m"), _pick(wh, "wind_gusts_10m"),
                                  _pick(wh, "wind_direction_10m"))
        for i, t in enumerate(wh["time"]):
            by_ts[int(t)] = {"ts": int(t), "hs": None, "tp": None, "wave_dir": None,
                             "wind_kn": _num(w_speed[i]) if w_speed else None,
                             "gust_kn": _num(w_gust[i]) if w_gust else None,
                             "wind_dir": _num(w_dir[i]) if w_dir else None}
        hs, tp, wd = (_pick(mh, "wave_height"), _pick(mh, "wave_period"), _pick(mh, "wave_direction"))
        for i, t in enumerate(mh["time"]):
            row = by_ts.setdefault(int(t), {"ts": int(t), "hs": None, "tp": None, "wave_dir": None,
                                            "wind_kn": None, "gust_kn": None, "wind_dir": None})
            row["hs"] = _num(hs[i]) if hs else None
            row["tp"] = _num(tp[i]) if tp else None
            row["wave_dir"] = _num(wd[i]) if wd else None

        series = [by_ts[k] for k in sorted(by_ts) if start_ts - 3600 < k < end_ts + 3600]
        if not series:
            raise ProviderError("a fonte não devolveu horas dentro do período pedido")
        if all(r["hs"] is None for r in series):
            # Comum quando o ponto está em terra ou muito perto da costa.
            meta_note = "sem dados de onda neste ponto (terra ou costa muito próxima?)"
        else:
            meta_note = None
        return {"series": series, "note": meta_note,
                "meta": {"wind_model": self.wind_model or "best_match",
                         "wave_model": self.wave_model or "best_match",
                         "grid_lat_lon_wind": [wind.get("latitude"), wind.get("longitude")],
                         "grid_lat_lon_wave": [wave.get("latitude"), wave.get("longitude")]}}


class DemoSource:
    """Dados sintéticos e determinísticos para testar tudo sem internet."""

    def __init__(self, source_id, label, phase=0.0, scale=1.0):
        self.id = source_id
        self.label = label + " (DEMO)"
        self.phase = phase
        self.scale = scale

    def fetch(self, lat, lon, start_ts, end_ts):
        first = (start_ts // 3600) * 3600
        series = []
        t = first
        while t < end_ts:
            h = (t - first) / 3600.0
            hs = max(0.2, (1.3 + 0.9 * math.sin(h / 11 + self.phase) + 0.25 * math.sin(h / 3.1)) * self.scale)
            wind = max(2.0, (12 + 9 * math.sin(h / 14 + 1 + self.phase) + 2 * math.sin(h / 2.3)) * self.scale)
            series.append({"ts": t, "hs": round(hs, 2), "tp": round(7 + 2 * math.sin(h / 20), 1),
                           "wave_dir": 150 + 20 * math.sin(h / 30), "wind_kn": round(wind, 1),
                           "gust_kn": round(wind * 1.3, 1), "wind_dir": 110 + 30 * math.sin(h / 25)})
            t += 3600
        return {"series": series, "note": "dados sintéticos de demonstração", "meta": {"demo": True}}


def build_sources(demo=None):
    demo = config.DEMO if demo is None else demo
    if demo:
        return [DemoSource("demo_a", "Fonte A", 0.0, 1.0),
                DemoSource("demo_b", "Fonte B", 0.8, 1.1),
                DemoSource("demo_c", "Fonte C", 1.7, 0.9)]
    return [OpenMeteoSource(s["id"], s["label"], s.get("wind_model"), s.get("wave_model"))
            for s in config.SOURCES]
