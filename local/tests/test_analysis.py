import unittest

from meteocean import analysis
from tests.helpers import series

START = 1_790_000_400 - 1_790_000_400 % 3600


def src(sid, hs, wind):
    return {"id": sid, "label": sid.upper(), "series": series(hs, wind), "fetched_at": START}


def run(sources, n, **limits):
    base = {"hs_max": 1.5, "wind_max": 20, "gust_max": None, "min_window_h": 3, "daylight_only": False}
    base.update(limits)
    return analysis.analyze(sources, base, -22.9, -43.2, START, START + n * 3600)


class WindowTests(unittest.TestCase):
    def test_single_source_windows_and_min_length(self):
        hs = [1, 1, 1, 2, 1, 1, 1, 1, 2, 1]        # GO: h0-2 (3h), h4-7 (4h), h9 (1h, curta)
        wind = [10] * 10
        r = run([src("a", hs, wind)], 10)
        w = r["sources"][0]["windows"]
        self.assertEqual([(x["i0"], x["i1"], x["hours"]) for x in w], [(0, 3, 3), (4, 8, 4)])
        self.assertEqual(r["sources"][0]["dropped_short"], 1)

    def test_window_stats(self):
        r = run([src("a", [1.0, 1.4, 1.2], [8, 12, 10])], 3)
        w = r["sources"][0]["windows"][0]
        self.assertEqual(w["max_hs"], 1.4)
        self.assertEqual(w["max_wind"], 12)

    def test_conservative_is_intersection_optimistic_is_union(self):
        a = src("a", [1, 1, 1, 1, 2, 2], [10] * 6)       # GO h0-3
        b = src("b", [2, 2, 1, 1, 1, 1], [10] * 6)       # GO h2-5
        r = run([a, b], 6, min_window_h=2)
        self.assertEqual(r["conservative"]["status"], ["nogo", "nogo", "go", "go", "nogo", "nogo"])
        self.assertEqual(r["optimistic"]["status"], ["go"] * 6)
        self.assertEqual([(w["i0"], w["i1"]) for w in r["conservative"]["windows"]], [(2, 4)])
        self.assertEqual([(w["i0"], w["i1"]) for w in r["optimistic"]["windows"]], [(0, 6)])

    def test_agreement(self):
        a = src("a", [1, 1, 1, 1], [10] * 4)
        b = src("b", [1, 1, 2, 2], [10] * 4)              # concorda em 2 de 4 horas
        r = run([a, b], 4)
        self.assertEqual(r["agreement"]["compared"], 4)
        self.assertEqual(r["agreement"]["agree"], 2)
        self.assertEqual(r["agreement"]["pct"], 50.0)

    def test_agreement_none_with_single_source(self):
        r = run([src("a", [1, 1], [10, 10])], 2)
        self.assertIsNone(r["agreement"]["pct"])

    def test_nodata_hours_are_not_go_and_never_form_windows(self):
        r = run([src("a", [1, None, 1, 1, 1], [10] * 5)], 5)
        self.assertEqual(r["sources"][0]["status"], ["go", "nodata", "go", "go", "go"])
        self.assertEqual([(w["i0"], w["i1"]) for w in r["sources"][0]["windows"]], [(2, 5)])

    def test_missing_hours_from_one_source_are_ignored_in_consolidation(self):
        a = src("a", [1, 1, 1, 1], [10] * 4)
        b = src("b", [1, 1], [10, 10])                   # só cobre 2 horas
        r = run([a, b], 4, min_window_h=2)
        self.assertEqual(r["conservative"]["n_sources"], [2, 2, 1, 1])
        self.assertEqual(r["conservative"]["windows"][0]["min_sources"], 1)

    def test_all_sources_nodata_gives_nodata(self):
        r = run([src("a", [None, None], [10, 10])], 2)
        self.assertEqual(r["conservative"]["status"], ["nodata", "nodata"])

    def test_empty_period_raises(self):
        with self.assertRaises(ValueError):
            analysis.analyze([src("a", [1], [1])], {}, 0, 0, START, START)

    def test_summary(self):
        r = run([src("a", [1, 1, 1, 2, 1, 1, 1, 1], [10] * 8)], 8)
        s = analysis.summarize(r, errors=[{"label": "x", "error": "y"}])
        self.assertEqual(s["conservative_windows"], 2)
        self.assertEqual(s["longest_window_h"], 4)
        self.assertEqual(s["sources_failed"], 1)
        self.assertEqual(s["first_window_ts"], START)


if __name__ == "__main__":
    unittest.main()
