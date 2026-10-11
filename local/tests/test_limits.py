import unittest
from datetime import datetime, timezone

from meteocean import limits as lim


class NormalizeTests(unittest.TestCase):
    def test_defaults_and_none(self):
        n = lim.normalize({"hs_max": "", "tp_min": "6", "wind_max": 18})
        self.assertIsNone(n["hs_max"])
        self.assertEqual(n["tp_min"], 6.0)
        self.assertEqual(n["wind_max"], 18.0)

    def test_rejects_negative_and_garbage(self):
        with self.assertRaises(ValueError):
            lim.normalize({"hs_max": -1})
        with self.assertRaises(ValueError):
            lim.normalize({"wind_max": "abc"})
        with self.assertRaises(ValueError):
            lim.normalize({"hs_max": float("nan")})

    def test_min_window_clamped(self):
        self.assertEqual(lim.normalize({"min_window_h": 0})["min_window_h"], 1)
        self.assertEqual(lim.normalize({"min_window_h": 500})["min_window_h"], 72)


class EvaluateTests(unittest.TestCase):
    L = lim.normalize({"hs_max": 1.5, "wind_max": 20, "gust_max": 25, "tp_min": 6})

    def row(self, **kw):
        base = {"ts": 0, "hs": 1.0, "tp": 8.0, "wind_kn": 10.0, "gust_kn": 14.0}
        base.update(kw)
        return base

    def test_go(self):
        self.assertEqual(lim.evaluate_hour(self.row(), self.L), ("go", []))

    def test_boundary_is_go(self):
        self.assertEqual(lim.evaluate_hour(self.row(hs=1.5, wind_kn=20.0, gust_kn=25.0, tp=6.0), self.L)[0], "go")

    def test_each_limit_triggers_nogo(self):
        for kw in ({"hs": 1.6}, {"wind_kn": 20.1}, {"gust_kn": 26}, {"tp": 5.9}):
            s, reasons = lim.evaluate_hour(self.row(**kw), self.L)
            self.assertEqual(s, "nogo", kw)
            self.assertEqual(len(reasons), 1)

    def test_missing_limited_param_is_nodata_not_go(self):
        self.assertEqual(lim.evaluate_hour(self.row(hs=None), self.L)[0], "nodata")

    def test_missing_unlimited_param_is_ignored(self):
        l2 = lim.normalize({"hs_max": 1.5, "wind_max": None, "gust_max": None, "tp_min": None})
        self.assertEqual(lim.evaluate_hour(self.row(wind_kn=None, gust_kn=None, tp=None), l2)[0], "go")

    def test_nogo_wins_over_nodata(self):
        self.assertEqual(lim.evaluate_hour(self.row(hs=None, wind_kn=30.0), self.L)[0], "nogo")


class DaylightTests(unittest.TestCase):
    LAT, LON = -22.9, -43.2   # Rio de Janeiro

    def test_rio_sun_times_october(self):
        start = int(datetime(2026, 10, 9, 0, tzinfo=timezone.utc).timestamp())
        iv = lim.daylight_intervals(self.LAT, self.LON, start, start + 86400)
        day = [i for i in iv if datetime.fromtimestamp(i[0], tz=timezone.utc).day == 9][0]
        rise = datetime.fromtimestamp(day[0], tz=timezone.utc)
        sset = datetime.fromtimestamp(day[1], tz=timezone.utc)
        # Rio, início de outubro: nascer ~05:30 e pôr ~18:00 locais (UTC-3) => 08:30 e 21:00 UTC
        self.assertTrue(8.0 <= rise.hour + rise.minute / 60 <= 9.0, rise)
        self.assertTrue(20.5 <= sset.hour + sset.minute / 60 <= 21.5, sset)

    def test_noon_is_day_midnight_is_not(self):
        start = int(datetime(2026, 10, 9, 0, tzinfo=timezone.utc).timestamp())
        iv = lim.daylight_intervals(self.LAT, self.LON, start, start + 86400)
        noon_local = int(datetime(2026, 10, 9, 15, tzinfo=timezone.utc).timestamp())      # 12h locais
        night_local = int(datetime(2026, 10, 9, 3, tzinfo=timezone.utc).timestamp())      # 00h locais
        self.assertTrue(lim.is_daylight(noon_local, iv))
        self.assertFalse(lim.is_daylight(night_local, iv))

    def test_daylight_only_flag_in_evaluate(self):
        start = int(datetime(2026, 10, 9, 0, tzinfo=timezone.utc).timestamp())
        l = lim.normalize({"hs_max": 5, "wind_max": 50, "daylight_only": True})
        iv = lim.daylight_intervals(self.LAT, self.LON, start, start + 86400)
        night = {"ts": int(datetime(2026, 10, 9, 3, tzinfo=timezone.utc).timestamp()), "hs": 1, "wind_kn": 5}
        s, reasons = lim.evaluate_hour(night, l, iv)
        self.assertEqual(s, "nogo")
        self.assertIn("fora do período diurno", reasons)


if __name__ == "__main__":
    unittest.main()
