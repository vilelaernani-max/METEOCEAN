"""Servidor web local (stdlib). API JSON + página única com mapa + relatórios estáticos.

Sem senha, por pedido: por isso escuta apenas em 127.0.0.1 e rejeita requisições
de outros sites (checagem de Host e Origin, e Content-Type JSON obrigatório nas escritas),
para que uma página aberta no navegador não consiga mexer no app.
"""
import json
import os
import re
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

from . import config, db, navy, service

LOOPBACK = {"127.0.0.1", "localhost", "::1"}
_slots = threading.Semaphore(2)
MAX_BODY = 1_000_000

APP_CSP = ("default-src 'self'; script-src 'self' https://unpkg.com; "
           "style-src 'self' 'unsafe-inline' https://unpkg.com https://fonts.googleapis.com; "
           "font-src https://fonts.gstatic.com; "
           "img-src 'self' data: https://*.tile.openstreetmap.org https://unpkg.com; connect-src 'self'")
REPORT_CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data:"
STATIC_FILES = {"app.js": "text/javascript; charset=utf-8", "style.css": "text/css; charset=utf-8"}


class ApiError(Exception):
    def __init__(self, status, msg):
        super().__init__(msg)
        self.status, self.msg = status, msg


def _num(body, key, lo, hi, default=None):
    v = body.get(key, default)
    try:
        f = float(v)
    except (TypeError, ValueError):
        raise ApiError(400, f"{key} inválido")
    if not lo <= f <= hi:
        raise ApiError(400, f"{key} deve estar entre {lo} e {hi}")
    return f


def _location_fields(body):
    name = str(body.get("name", "")).strip()
    if not 1 <= len(name) <= 80:
        raise ApiError(400, "nome é obrigatório (até 80 caracteres)")
    return (name, _num(body, "lat", -90, 90), _num(body, "lon", -180, 180),
            _num(body, "tz_offset", -12, 14, -3), str(body.get("areas", "")).strip()[:100],
            json.dumps(service.normalize_tags(body.get("tags", []))))


def _profile_fields(body):
    name = str(body.get("name", "")).strip()
    if not 1 <= len(name) <= 80:
        raise ApiError(400, "nome é obrigatório (até 80 caracteres)")
    from . import limits as lim
    try:
        limits = lim.normalize(body.get("limits"))
    except ValueError as e:
        raise ApiError(400, str(e))
    return name, json.dumps(limits)


def _analysis_out(row):
    d = db.row_to_dict(row, ("tags", "summary"))
    d["report_url"] = f"/reports/{d['id']}.html" if d["status"] == "done" else None
    return d


class Handler(BaseHTTPRequestHandler):
    server_version = "meteocean-op"

    def log_message(self, fmt, *args):
        if os.environ.get("METEOCEAN_VERBOSE") == "1":
            super().log_message(fmt, *args)

    # ---------- infraestrutura ----------
    def _send(self, status, body, ctype, extra=None):
        data = body if isinstance(body, bytes) else body.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(data)

    def _json(self, status, obj):
        self._send(status, json.dumps(obj, ensure_ascii=False), "application/json; charset=utf-8")

    def _guard(self, mutating):
        host = (self.headers.get("Host") or "").rsplit(":", 1)[0].strip("[]")
        if config.HOST in LOOPBACK and host not in LOOPBACK:
            raise ApiError(403, "Host não permitido")
        if mutating:
            origin = self.headers.get("Origin")
            if origin and urlparse(origin).netloc != self.headers.get("Host"):
                raise ApiError(403, "Origem não permitida")
            if "application/json" not in (self.headers.get("Content-Type") or ""):
                raise ApiError(415, "Content-Type deve ser application/json")

    def _body(self):
        n = int(self.headers.get("Content-Length") or 0)
        if n > MAX_BODY:
            raise ApiError(413, "corpo grande demais")
        if n == 0:
            return {}
        try:
            body = json.loads(self.rfile.read(n).decode("utf-8"))
        except ValueError:
            raise ApiError(400, "JSON inválido")
        if not isinstance(body, dict):
            raise ApiError(400, "esperado um objeto JSON")
        return body

    def _dispatch(self, method):
        try:
            self._guard(method != "GET")
            url = urlparse(self.path)
            self._route(method, url.path, parse_qs(url.query))
        except ApiError as e:
            self._json(e.status, {"error": e.msg})
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception as e:  # noqa
            import traceback
            traceback.print_exc()
            self._json(500, {"error": f"erro interno: {e}"})

    do_GET = lambda self: self._dispatch("GET")
    do_POST = lambda self: self._dispatch("POST")
    do_PUT = lambda self: self._dispatch("PUT")
    do_DELETE = lambda self: self._dispatch("DELETE")

    # ---------- rotas ----------
    def _route(self, method, path, query):
        if method == "GET":
            if path == "/":
                return self._send(200, (config.STATIC_DIR / "index.html").read_bytes(),
                                  "text/html; charset=utf-8", {"Content-Security-Policy": APP_CSP})
            m = re.fullmatch(r"/static/([a-z.]+)", path)
            if m and m.group(1) in STATIC_FILES:
                return self._send(200, (config.STATIC_DIR / m.group(1)).read_bytes(), STATIC_FILES[m.group(1)])
            m = re.fullmatch(r"/reports/(\d+)\.html", path)
            if m:
                f = config.REPORTS_DIR / f"{int(m.group(1))}.html"
                if not f.is_file():
                    raise ApiError(404, "relatório não encontrado")
                return self._send(200, f.read_bytes(), "text/html; charset=utf-8",
                                  {"Content-Security-Policy": REPORT_CSP})

        if path == "/api/state" and method == "GET":
            return self._json(200, {"demo": config.DEMO, "max_days": config.MAX_DAYS, "navy": navy.last_info(),
                                    "navy_stale": navy.is_stale(), "sources": [s["label"] for s in config.SOURCES]})

        # locais
        if path == "/api/locations":
            if method == "GET":
                with db.connect() as c:
                    rows = c.execute("SELECT * FROM locations ORDER BY name COLLATE NOCASE").fetchall()
                return self._json(200, [db.row_to_dict(r, ("tags",)) for r in rows])
            if method == "POST":
                f = _location_fields(self._body())
                with db.connect() as c:
                    cur = c.execute("INSERT INTO locations (name, lat, lon, tz_offset, areas, tags, created_at) "
                                    "VALUES (?,?,?,?,?,?,?)", (*f, int(time.time())))
                    row = c.execute("SELECT * FROM locations WHERE id=?", (cur.lastrowid,)).fetchone()
                return self._json(201, db.row_to_dict(row, ("tags",)))
        m = re.fullmatch(r"/api/locations/(\d+)", path)
        if m:
            lid = int(m.group(1))
            if method == "PUT":
                f = _location_fields(self._body())
                with db.connect() as c:
                    c.execute("UPDATE locations SET name=?, lat=?, lon=?, tz_offset=?, areas=?, tags=? WHERE id=?", (*f, lid))
                    row = c.execute("SELECT * FROM locations WHERE id=?", (lid,)).fetchone()
                if not row:
                    raise ApiError(404, "local não encontrado")
                return self._json(200, db.row_to_dict(row, ("tags",)))
            if method == "DELETE":
                with db.connect() as c:
                    c.execute("DELETE FROM locations WHERE id=?", (lid,))
                return self._json(200, {"ok": True})

        # perfis de limites
        if path == "/api/profiles":
            if method == "GET":
                with db.connect() as c:
                    rows = c.execute("SELECT * FROM profiles ORDER BY name COLLATE NOCASE").fetchall()
                return self._json(200, [db.row_to_dict(r, ("limits",)) for r in rows])
            if method == "POST":
                name, limits = _profile_fields(self._body())
                with db.connect() as c:
                    cur = c.execute("INSERT INTO profiles (name, limits, created_at) VALUES (?,?,?)",
                                    (name, limits, int(time.time())))
                    row = c.execute("SELECT * FROM profiles WHERE id=?", (cur.lastrowid,)).fetchone()
                return self._json(201, db.row_to_dict(row, ("limits",)))
        m = re.fullmatch(r"/api/profiles/(\d+)", path)
        if m:
            pid = int(m.group(1))
            if method == "PUT":
                name, limits = _profile_fields(self._body())
                with db.connect() as c:
                    c.execute("UPDATE profiles SET name=?, limits=? WHERE id=?", (name, limits, pid))
                    row = c.execute("SELECT * FROM profiles WHERE id=?", (pid,)).fetchone()
                if not row:
                    raise ApiError(404, "perfil não encontrado")
                return self._json(200, db.row_to_dict(row, ("limits",)))
            if method == "DELETE":
                with db.connect() as c:
                    c.execute("DELETE FROM profiles WHERE id=?", (pid,))
                return self._json(200, {"ok": True})

        # análises
        if path == "/api/analyses":
            if method == "GET":
                with db.connect() as c:
                    rows = c.execute("SELECT * FROM analyses ORDER BY id DESC LIMIT 300").fetchall()
                out = [_analysis_out(r) for r in rows]
                tag = (query.get("tag") or [""])[0].strip().lower()
                if tag:
                    out = [a for a in out if tag in [t.lower() for t in a["tags"] or []]]
                return self._json(200, out)
            if method == "POST":
                b = self._body()
                try:
                    aid = service.create_analysis(int(b.get("location_id")), int(b.get("profile_id")),
                                                  b.get("days", 5), b.get("tags", []))
                except (TypeError, ValueError) as e:
                    raise ApiError(400, str(e))

                def work():
                    with _slots:
                        service.run_analysis(aid)
                threading.Thread(target=work, daemon=True).start()
                with db.connect() as c:
                    row = c.execute("SELECT * FROM analyses WHERE id=?", (aid,)).fetchone()
                return self._json(202, _analysis_out(row))
        m = re.fullmatch(r"/api/analyses/(\d+)", path)
        if m:
            aid = int(m.group(1))
            if method == "GET":
                with db.connect() as c:
                    row = c.execute("SELECT * FROM analyses WHERE id=?", (aid,)).fetchone()
                if not row:
                    raise ApiError(404, "análise não encontrada")
                return self._json(200, _analysis_out(row))
            if method == "DELETE":
                with db.connect() as c:
                    c.execute("DELETE FROM analyses WHERE id=?", (aid,))
                for d in (config.REPORTS_DIR, config.SNAPSHOTS_DIR):
                    for f in d.glob(f"{aid}.*"):
                        f.unlink(missing_ok=True)
                return self._json(200, {"ok": True})

        # tags
        if path == "/api/tags" and method == "GET":
            tags = {}
            with db.connect() as c:
                for tbl in ("locations", "analyses"):
                    for r in c.execute(f"SELECT tags FROM {tbl}"):
                        for t in json.loads(r["tags"] or "[]"):
                            tags.setdefault(t.lower(), t)
            return self._json(200, sorted(tags.values(), key=str.lower))

        # avisos da Marinha
        if path == "/api/navy" and method == "GET":
            now = int(time.time())
            ws = navy.warnings_for(now - 3 * 86400, now + 10 * 86400)
            for w in ws:
                w["text"] = (w["text"] or "")[:1500]
            return self._json(200, {"info": navy.last_info(), "stale": navy.is_stale(), "warnings": ws})
        if path == "/api/navy/refresh" and method == "POST":
            self._body()
            return self._json(200, navy.refresh())
        if path == "/api/navy/paste" and method == "POST":
            text = str(self._body().get("text", ""))
            if len(text) < 20:
                raise ApiError(400, "cole o texto dos avisos")
            return self._json(200, navy.ingest_text(text))

        raise ApiError(404, "não encontrado")


def _navy_loop():
    """Busca semanal dos avisos (verifica de hora em hora se o cache venceu)."""
    while True:
        try:
            if not config.DEMO and navy.is_stale():
                navy.refresh()
        except Exception:
            pass
        time.sleep(3600)


def _fail_interrupted():
    with db.connect() as c:
        c.execute("UPDATE analyses SET status='error', error='Interrompida (o servidor foi reiniciado).', "
                  "finished_at=? WHERE status IN ('queued','collecting','analyzing')", (int(time.time()),))


def make_server(host=None, port=None):
    db.init()
    _fail_interrupted()
    return ThreadingHTTPServer((host or config.HOST, config.PORT if port is None else port), Handler)


def _lan_ip():
    import socket
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("10.255.255.255", 1))  # não envia nada; só descobre a interface de saída
        return s.getsockname()[0]
    except OSError:
        return "IP-DO-COMPUTADOR"
    finally:
        s.close()


def serve():
    srv = make_server()
    threading.Thread(target=_navy_loop, daemon=True).start()
    url = f"http://{'localhost' if config.HOST in LOOPBACK else config.HOST}:{srv.server_address[1]}"
    print(f"MetOcean OP rodando em {url}  (Ctrl+C para parar)" + ("  [MODO DEMONSTRAÇÃO]" if config.DEMO else ""))
    if config.HOST not in LOOPBACK:
        ip = _lan_ip() if config.HOST in ("0.0.0.0", "") else config.HOST
        print(f"No celular (mesmo Wi-Fi): http://{ip}:{srv.server_address[1]}")
        print("ATENÇÃO: sem senha. Qualquer aparelho nesta rede consegue abrir. Use só em rede de casa.")
    srv.daemon_threads = True
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\nencerrado")
    finally:
        srv.server_close()
