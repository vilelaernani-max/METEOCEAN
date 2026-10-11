"""Isola cada teste num diretório temporário (nunca toca nos dados reais)."""
import shutil
import tempfile
from pathlib import Path

from meteocean import config, db


class TempData:
    def __enter__(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="meteocean-test-"))
        self.saved = (config.DATA_DIR, config.REPORTS_DIR, config.SNAPSHOTS_DIR, config.DB_PATH, config.DEMO)
        config.DATA_DIR = self.tmp
        config.REPORTS_DIR = self.tmp / "reports"
        config.SNAPSHOTS_DIR = self.tmp / "snapshots"
        config.DB_PATH = self.tmp / "t.db"
        config.DEMO = True
        db.init()
        return self.tmp

    def __exit__(self, *exc):
        (config.DATA_DIR, config.REPORTS_DIR, config.SNAPSHOTS_DIR, config.DB_PATH, config.DEMO) = self.saved
        shutil.rmtree(self.tmp, ignore_errors=True)


def series(hs, wind, start=1_790_000_400 - 1_790_000_400 % 3600, gust=None, tp=8.0):
    """Série horária simples a partir de listas de valores."""
    return [{"ts": start + i * 3600, "hs": h, "tp": tp, "wave_dir": 150.0, "wind_kn": w,
             "gust_kn": (gust[i] if gust else (w * 1.3 if w is not None else None)), "wind_dir": 100.0}
            for i, (h, w) in enumerate(zip(hs, wind))]
