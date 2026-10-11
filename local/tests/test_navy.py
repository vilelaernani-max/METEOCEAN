import unittest
from datetime import datetime, timezone

from meteocean import navy
from tests.helpers import TempData

SAMPLE = """Avisos de mau tempo - METAREA V
AVISO NR 737/2026 AVISO DE VENTO FORTE EMITIDO ÀS 1500Z - TER - 06/OUT/2026
ÁREA ALFA ÁREA COSTEIRA
VENTOS DE FORÇA 7 A PARTIR DE 061800Z VÁLIDO ATÉ 071800Z
WARNING NR 737/2026 STRONG WIND WARNING ISSUED AT 1500Z - TUE - 06/OCT/2026
AREA ALFA STRONG WINDS FROM 061800Z VALID UNTIL 071800Z
AVISO NR 738/2026 AVISO DE MAR GROSSO EMITIDO ÀS 0900Z - QUA - 07/OUT/2026
ÁREA GOLF
A PARTIR DE 071200Z VÁLIDO ATÉ 090600Z
WARNING NR 738/2026 HEAVY SEA WARNING ISSUED AT 0900Z - WED - 07/OCT/2026
"""


def ts(*a):
    return int(datetime(*a, tzinfo=timezone.utc).timestamp())


class ParseTests(unittest.TestCase):
    def test_parses_portuguese_blocks_and_ignores_english_mirror(self):
        ws, status = navy.parse_text(SAMPLE)
        self.assertEqual([w["number"] for w in ws], ["737/2026", "738/2026"])
        self.assertTrue(status.startswith("ok"))

    def test_fields(self):
        w1, w2 = navy.parse_text(SAMPLE)[0]
        self.assertEqual(w1["kind"], "AVISO DE VENTO FORTE")
        self.assertEqual(w1["issued_ts"], ts(2026, 10, 6, 15, 0))
        self.assertEqual(w1["valid_from_ts"], ts(2026, 10, 6, 18, 0))
        self.assertEqual(w1["valid_to_ts"], ts(2026, 10, 7, 18, 0))
        self.assertEqual(w1["areas"], ["ALFA", "COSTEIRA"])
        self.assertEqual(w2["areas"], ["GOLF"])
        self.assertEqual(w2["valid_to_ts"], ts(2026, 10, 9, 6, 0))
        self.assertNotIn("WARNING NR", w1["text"])

    def test_month_rollover(self):
        txt = "AVISO NR 900/2026 AVISO DE VENTO FORTE EMITIDO ÀS 1200Z - SEX - 30/OUT/2026 A PARTIR DE 301500Z VÁLIDO ATÉ 021200Z"
        w = navy.parse_text(txt)[0][0]
        self.assertEqual(w["valid_from_ts"], ts(2026, 10, 30, 15, 0))
        self.assertEqual(w["valid_to_ts"], ts(2026, 11, 2, 12, 0))

    def test_accented_weekday(self):
        txt = "AVISO NR 1/2026 AVISO DE VENTO FORTE EMITIDO ÀS 1200Z - SÁB - 10/OUT/2026 A PARTIR DE 101200Z VÁLIDO ATÉ 111200Z"
        self.assertEqual(navy.parse_text(txt)[0][0]["issued_ts"], ts(2026, 10, 10, 12, 0))

    def test_no_warnings_page(self):
        ws, status = navy.parse_text("METEOROMARINHA\nNÃO HÁ AVISOS DE MAU TEMPO")
        self.assertEqual(ws, [])
        self.assertIn("não há avisos", status)

    def test_unrecognized_format_is_flagged_not_silent(self):
        ws, status = navy.parse_text("Página totalmente diferente sem nada conhecido")
        self.assertEqual(ws, [])
        self.assertEqual(status, "formato_nao_reconhecido")

    def test_html_to_text_strips_scripts_and_keeps_lines(self):
        html = "<html><script>var x='AVISO NR 1/2026'</script><body><p>AVISO NR 5/2026 AVISO</p><p>ÁREA GOLF</p></body></html>"
        t = navy.html_to_text(html)
        self.assertNotIn("var x", t)
        self.assertIn("AVISO NR 5/2026", t)
        self.assertIn("\n", t)


class StorageTests(unittest.TestCase):
    def test_ingest_dedupes_and_filters_by_period(self):
        with TempData():
            r1 = navy.ingest_text(SAMPLE)
            r2 = navy.ingest_text(SAMPLE)
            self.assertEqual((r1["found"], r1["new"]), (2, 2))
            self.assertEqual((r2["found"], r2["new"]), (2, 0))
            hit = navy.warnings_for(ts(2026, 10, 7, 0), ts(2026, 10, 7, 13))
            self.assertEqual({w["number"] for w in hit}, {"737/2026", "738/2026"})
            only_second = navy.warnings_for(ts(2026, 10, 8, 0), ts(2026, 10, 8, 12))
            self.assertEqual([w["number"] for w in only_second], ["738/2026"])
            self.assertEqual(navy.warnings_for(ts(2026, 10, 20, 0), ts(2026, 10, 21, 0)), [])

    def test_stale_logic(self):
        with TempData():
            self.assertTrue(navy.is_stale())
            navy.ingest_text(SAMPLE)
            self.assertFalse(navy.is_stale())
            import time
            self.assertTrue(navy.is_stale(now=time.time() + 8 * 86400))


if __name__ == "__main__":
    unittest.main()
