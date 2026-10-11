import time
import unittest
from unittest import mock

from meteocean import analysis, navy, providers, report
from tests.helpers import TempData

NOW = int(time.time())
START = (NOW // 3600) * 3600


def fake_get_json(url, params, attempts=2):
    """Imita Open-Meteo: modelo único => chaves sem sufixo; vários => com sufixo."""
    n = 48
    times = [START + i * 3600 for i in range(n)]
    suffix = "_gfs_seamless" if params.get("models") == "multi" else ""
    if "marine" in url:
        return {"latitude": -22.9, "longitude": -43.0, "hourly": {
            "time": times, f"wave_height{suffix}": [1.0 + (i % 5) * 0.2 for i in range(n)],
            f"wave_period{suffix}": [8.0] * n, f"wave_direction{suffix}": [150] * n}}
    assert params["wind_speed_unit"] == "kn"
    return {"latitude": -22.9, "longitude": -43.2, "hourly": {
        "time": times, f"wind_speed_10m{suffix}": [10.0] * n,
        f"wind_gusts_10m{suffix}": [14.0] * n, f"wind_direction_10m{suffix}": [100] * n}}


class ProviderTests(unittest.TestCase):
    def test_open_meteo_normalizes(self):
        with mock.patch.object(providers, "_get_json", fake_get_json):
            r = providers.OpenMeteoSource("x", "X").fetch(-22.9, -43.2, START, START + 24 * 3600)
        s = r["series"]
        self.assertTrue(24 <= len(s) <= 26)
        self.assertEqual(set(s[0]), {"ts", "hs", "tp", "wave_dir", "wind_kn", "gust_kn", "wind_dir"})
        self.assertEqual(s[0]["wind_kn"], 10.0)
        self.assertAlmostEqual(s[0]["hs"], 1.0)
        self.assertIsNone(r["note"])

    def test_suffixed_keys_from_multi_model(self):
        src = providers.OpenMeteoSource("x", "X", wind_model="multi", wave_model="multi")
        with mock.patch.object(providers, "_get_json", fake_get_json):
            r = src.fetch(-22.9, -43.2, START, START + 12 * 3600)
        self.assertEqual(r["series"][0]["wind_kn"], 10.0)
        self.assertIsNotNone(r["series"][0]["hs"])

    def test_null_waves_gives_note_not_crash(self):
        def nulls(url, params, attempts=2):
            d = fake_get_json(url, params)
            if "marine" in url:
                d["hourly"]["wave_height"] = [None] * len(d["hourly"]["time"])
            return d
        with mock.patch.object(providers, "_get_json", nulls):
            r = providers.OpenMeteoSource("x", "X").fetch(-22.9, -43.2, START, START + 12 * 3600)
        self.assertIn("sem dados de onda", r["note"])
        self.assertIsNone(r["series"][0]["hs"])

    def test_http_error_is_provider_error(self):
        def boom(url, params, attempts=2):
            raise providers.ProviderError("HTTP 400 em marine-api: modelo inválido")
        with mock.patch.object(providers, "_get_json", boom):
            with self.assertRaises(providers.ProviderError):
                providers.OpenMeteoSource("x", "X").fetch(0, 0, START, START + 3600)

    def test_demo_sources_are_deterministic(self):
        a = providers.DemoSource("a", "A").fetch(0, 0, START, START + 5 * 3600)["series"]
        b = providers.DemoSource("a", "A").fetch(0, 0, START, START + 5 * 3600)["series"]
        self.assertEqual(a, b)
        self.assertEqual(len(a), 5)


def make_ctx(name="Ponto <b>X</b>", warn_text="aviso <script>alert(1)</script>"):
    srcs = [dict(id=s.id, label=s.label, fetched_at=START, **s.fetch(-22.9, -43.2, START, START + 72 * 3600))
            for s in providers.build_sources(True)]
    res = analysis.analyze(srcs, {"hs_max": 1.8, "wind_max": 20, "gust_max": 26, "min_window_h": 4,
                                  "daylight_only": True}, -22.9, -43.2, START, START + 72 * 3600)
    warnings = [{"number": "1/2026", "kind": "AVISO DE VENTO FORTE", "areas": ["GOLF"], "text": warn_text,
                 "valid_from_ts": START, "valid_to_ts": START + 86400, "issued_ts": START}]
    return {"result": res, "errors": [{"label": "ECMWF", "error": "HTTP 400 <x>"}],
            "location": {"name": name, "lat": -22.9, "lon": -43.2, "tz_offset": -3.0, "areas": "GOLF"},
            "profile_name": "Perfil <i>", "tags": ["a<b", "teste"], "navy_warnings": warnings,
            "navy_info": {"last_fetch": None, "status": "erro: sem rede", "url": "https://x.test/"},
            "navy_stale": True, "generated_ts": NOW}


class ReportTests(unittest.TestCase):
    def test_report_contains_sections_and_alerts(self):
        with TempData():
            html = report.build_html(make_ctx())
        for needle in ("Janelas — cenário conservador", "Linha do tempo por fonte", "Hs", "Vento a 10 m",
                       "Comparação entre fontes", "Avisos de Mau Tempo da Marinha", "Limites aplicados",
                       "DADOS DE DEMONSTRAÇÃO", "Fonte indisponível", "na sua área", "<svg"):
            self.assertIn(needle, html)

    def test_user_text_is_escaped(self):
        with TempData():
            html = report.build_html(make_ctx())
        self.assertNotIn("<script>alert(1)</script>", html)
        self.assertNotIn("Ponto <b>X</b>", html)
        self.assertIn("Ponto &lt;b&gt;X&lt;/b&gt;", html)
        self.assertIn("a&lt;b", html)

    def test_report_is_self_contained(self):
        with TempData():
            html = report.build_html(make_ctx())
        self.assertNotIn("<script", html.lower())
        self.assertNotIn('src="http', html)
        self.assertNotIn("href=\"http://", html)

    def test_no_window_message(self):
        with TempData():
            ctx = make_ctx()
            ctx["result"] = analysis.analyze(
                [dict(id="a", label="A", fetched_at=START, series=[{"ts": START + i * 3600, "hs": 4.0, "tp": 8, "wave_dir": 0,
                      "wind_kn": 30, "gust_kn": 40, "wind_dir": 0} for i in range(24)])],
                {"hs_max": 1.0, "wind_max": 10, "min_window_h": 4}, 0, 0, START, START + 24 * 3600)
            html = report.build_html(ctx)
        self.assertIn("Nenhuma janela de 4 h seguidas", html)


if __name__ == "__main__":
    unittest.main()
