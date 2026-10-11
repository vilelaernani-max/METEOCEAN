"""Banco SQLite (stdlib). Uma conexão curta por operação; seguro para threads."""
import json
import sqlite3
import time
from contextlib import contextmanager

from . import config

SCHEMA = """
CREATE TABLE IF NOT EXISTS locations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    lat REAL NOT NULL,
    lon REAL NOT NULL,
    tz_offset REAL NOT NULL DEFAULT -3,
    areas TEXT NOT NULL DEFAULT '',
    tags TEXT NOT NULL DEFAULT '[]',
    created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    limits TEXT NOT NULL,
    created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS analyses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    location_id INTEGER NOT NULL,
    profile_id INTEGER NOT NULL,
    location_name TEXT NOT NULL,
    profile_name TEXT NOT NULL,
    lat REAL NOT NULL,
    lon REAL NOT NULL,
    start_ts INTEGER NOT NULL,
    end_ts INTEGER NOT NULL,
    tags TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'queued',
    error TEXT,
    summary TEXT,
    created_at INTEGER NOT NULL,
    finished_at INTEGER
);
CREATE TABLE IF NOT EXISTS navy_warnings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hash TEXT NOT NULL UNIQUE,
    number TEXT,
    kind TEXT,
    areas TEXT NOT NULL DEFAULT '[]',
    issued_ts INTEGER,
    valid_from_ts INTEGER,
    valid_to_ts INTEGER,
    text TEXT NOT NULL,
    fetched_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT
);
"""

DEFAULT_PROFILES = [
    # Valores de EXEMPLO — ajuste aos limites reais de cada operação.
    ("Levantamento multibeam (exemplo)", {"hs_max": 1.5, "tp_min": None, "wind_max": 20, "gust_max": 25, "daylight_only": False, "min_window_h": 6}),
    ("Mergulho (exemplo)", {"hs_max": 1.0, "tp_min": None, "wind_max": 15, "gust_max": 20, "daylight_only": True, "min_window_h": 4}),
    ("Lançamento de equipamento (exemplo)", {"hs_max": 2.0, "tp_min": None, "wind_max": 25, "gust_max": 30, "daylight_only": False, "min_window_h": 3}),
]


@contextmanager
def connect():
    config.DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(config.DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init():
    config.REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    config.SNAPSHOTS_DIR.mkdir(parents=True, exist_ok=True)
    with connect() as c:
        c.executescript(SCHEMA)
        n = c.execute("SELECT COUNT(*) FROM profiles").fetchone()[0]
        if n == 0:
            for name, limits in DEFAULT_PROFILES:
                c.execute(
                    "INSERT INTO profiles (name, limits, created_at) VALUES (?,?,?)",
                    (name, json.dumps(limits), int(time.time())),
                )


def row_to_dict(row, json_fields=()):
    d = dict(row)
    for f in json_fields:
        if f in d and isinstance(d[f], str):
            try:
                d[f] = json.loads(d[f])
            except ValueError:
                d[f] = None
    return d


def get_meta(key, default=None):
    with connect() as c:
        r = c.execute("SELECT value FROM meta WHERE key=?", (key,)).fetchone()
    return r["value"] if r else default


def set_meta(key, value):
    with connect() as c:
        c.execute(
            "INSERT INTO meta (key, value) VALUES (?,?) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            (key, str(value)),
        )
