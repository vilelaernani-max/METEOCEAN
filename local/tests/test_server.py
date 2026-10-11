import http.client
import json
import threading
import time
import unittest

from meteocean import config, server
from tests.helpers import TempData


class ApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.td = TempData()
        cls.td.__enter__()
        cls.srv = server.make_server("127.0.0.1", 0)
        cls.srv.daemon_threads = True
        cls.port = cls.srv.server_address[1]
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown()
        cls.srv.server_close()
        cls.td.__exit__()

    def call(self, method, path, body=None, headers=None, raw=None):
        c = http.client.HTTPConnection("127.0.0.1", self.port, timeout=15)
        h = {"Host": f"localhost:{self.port}"}
        if body is not None or method in ("POST", "PUT", "DELETE"):
            h["Content-Type"] = "application/json"
        h.update(headers or {})
        data = raw if raw is not None else (json.dumps(body) if body is not None else None)
        c.request(method, path, body=data, headers=h)
        r = c.getresponse()
        payload = r.read()
        c.close()
        ctype = r.getheader("Content-Type", "")
        return r.status, (json.loads(payload) if "json" in ctype else payload.decode("utf-8")), r

    # ---- páginas ----
    def test_index_and_static(self):
        s, body, r = self.call("GET", "/")
        self.assertEqual(s, 200)
        self.assertIn("MetOcean OP", body)
        self.assertIn("script-src 'self' https://unpkg.com", r.getheader("Content-Security-Policy"))
        self.assertEqual(self.call("GET", "/static/app.js")[0], 200)
        self.assertEqual(self.call("GET", "/static/style.css")[0], 200)

    def test_state_reports_demo(self):
        s, d, _ = self.call("GET", "/api/state")
        self.assertTrue(d["demo"])

    # ---- locais ----
    def test_location_crud_and_validation(self):
        s, loc, _ = self.call("POST", "/api/locations", {"name": "Baía", "lat": "-22.95", "lon": -43.1,
                                                         "tz_offset": -3, "areas": "GOLF", "tags": "Rio, rio , mbes"})
        self.assertEqual(s, 201)
        self.assertEqual(loc["tags"], ["Rio", "mbes"])           # dedupe sem diferenciar maiúsculas
        s, upd, _ = self.call("PUT", f"/api/locations/{loc['id']}", {"name": "Baía 2", "lat": -23, "lon": -43})
        self.assertEqual((s, upd["name"], upd["tz_offset"]), (200, "Baía 2", -3.0))
        for bad in ({"name": "", "lat": 0, "lon": 0}, {"name": "x", "lat": 91, "lon": 0},
                    {"name": "x", "lat": 0, "lon": 181}, {"name": "x", "lat": "abc", "lon": 0}):
            self.assertEqual(self.call("POST", "/api/locations", bad)[0], 400, bad)
        self.assertEqual(self.call("DELETE", f"/api/locations/{loc['id']}", {})[0], 200)

    # ---- perfis ----
    def test_profiles_seeded_and_validated(self):
        s, lst, _ = self.call("GET", "/api/profiles")
        self.assertGreaterEqual(len(lst), 3)
        s, p, _ = self.call("POST", "/api/profiles", {"name": "Teste", "limits": {"hs_max": 2, "wind_max": ""}})
        self.assertEqual(s, 201)
        self.assertIsNone(p["limits"]["wind_max"])
        self.assertEqual(self.call("POST", "/api/profiles", {"name": "ruim", "limits": {"hs_max": -3}})[0], 400)

    # ---- fluxo completo ----
    def test_full_analysis_flow(self):
        _, loc, _ = self.call("POST", "/api/locations", {"name": "Ponto <img src=x>", "lat": -22.9, "lon": -43.2,
                                                         "areas": "GOLF", "tags": ["fluxo"]})
        _, profs, _ = self.call("GET", "/api/profiles")
        s, a, _ = self.call("POST", "/api/analyses", {"location_id": loc["id"], "profile_id": profs[0]["id"],
                                                      "days": 3, "tags": ["fluxo", "campanha-1"]})
        self.assertEqual(s, 202)
        for _ in range(100):
            _, cur, _ = self.call("GET", f"/api/analyses/{a['id']}")
            if cur["status"] in ("done", "error"):
                break
            time.sleep(0.1)
        self.assertEqual(cur["status"], "done", cur.get("error"))
        self.assertEqual(cur["summary"]["sources_ok"], 3)
        s, html, r = self.call("GET", cur["report_url"])
        self.assertEqual(s, 200)
        self.assertIn("default-src 'none'", r.getheader("Content-Security-Policy"))
        self.assertIn("&lt;img src=x&gt;", html)
        self.assertNotIn("<img src=x>", html)
        self.assertTrue((config.SNAPSHOTS_DIR / f"{a['id']}.json").is_file())

        _, hist, _ = self.call("GET", "/api/analyses?tag=campanha-1")
        self.assertIn(a["id"], [x["id"] for x in hist])
        _, none, _ = self.call("GET", "/api/analyses?tag=inexistente")
        self.assertEqual(none, [])
        _, tags, _ = self.call("GET", "/api/tags")
        self.assertIn("campanha-1", tags)

        self.assertEqual(self.call("DELETE", f"/api/analyses/{a['id']}", {})[0], 200)
        self.assertEqual(self.call("GET", cur["report_url"])[0], 404)

    def test_analysis_validation(self):
        self.assertEqual(self.call("POST", "/api/analyses", {"location_id": 999, "profile_id": 1, "days": 3})[0], 400)
        _, loc, _ = self.call("POST", "/api/locations", {"name": "v", "lat": 0, "lon": 0})
        _, profs, _ = self.call("GET", "/api/profiles")
        for days in (0, 11, "x"):
            s, _, _ = self.call("POST", "/api/analyses", {"location_id": loc["id"], "profile_id": profs[0]["id"], "days": days})
            self.assertEqual(s, 400, days)

    # ---- Marinha ----
    def test_navy_paste(self):
        s, d, _ = self.call("POST", "/api/navy/paste", {"text": "AVISO NR 9/2026 AVISO DE VENTO FORTE EMITIDO ÀS 1200Z - SEX - 09/OUT/2026 "
                                                                "A PARTIR DE 091200Z VÁLIDO ATÉ 101200Z ÁREA GOLF"})
        self.assertEqual((s, d["found"]), (200, 1))
        self.assertEqual(self.call("POST", "/api/navy/paste", {"text": "curto"})[0], 400)
        s, d, _ = self.call("GET", "/api/navy")
        self.assertEqual(s, 200)
        self.assertIn("info", d)

    # ---- segurança (servidor sem senha) ----
    def test_rejects_foreign_host(self):
        self.assertEqual(self.call("GET", "/api/state", headers={"Host": "evil.example"})[0], 403)

    def test_rejects_foreign_origin_on_writes(self):
        s, _, _ = self.call("POST", "/api/locations", {"name": "x", "lat": 0, "lon": 0},
                            headers={"Origin": "http://evil.example"})
        self.assertEqual(s, 403)

    def test_rejects_non_json_content_type_on_writes(self):
        s, _, _ = self.call("POST", "/api/locations", raw='{"name":"x","lat":0,"lon":0}',
                            headers={"Content-Type": "text/plain"})
        self.assertEqual(s, 415)

    def test_same_origin_write_allowed(self):
        s, _, _ = self.call("POST", "/api/locations", {"name": "ok", "lat": 0, "lon": 0},
                            headers={"Origin": f"http://localhost:{self.port}"})
        self.assertEqual(s, 201)

    def test_no_path_traversal(self):
        for p in ("/static/../config.py", "/static/..%2fconfig.py", "/reports/../../etc/passwd",
                  "/reports/1.html/../../x", "/static/app.js/../../db.py"):
            self.assertIn(self.call("GET", p)[0], (404,), p)

    def test_bad_json_and_unknown_route(self):
        self.assertEqual(self.call("POST", "/api/locations", raw="{nao json")[0], 400)
        self.assertEqual(self.call("POST", "/api/locations", raw="[1,2]")[0], 400)
        self.assertEqual(self.call("GET", "/api/nada")[0], 404)


if __name__ == "__main__":
    unittest.main()
