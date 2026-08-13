from __future__ import annotations

import json
import os
import time
import uuid
from pathlib import Path
from typing import Any

from .config import RUNS_DIR


def make_run_dir(prefix: str = "job") -> Path:
    stamp = time.strftime("%Y%m%d-%H%M%S")
    run_dir = RUNS_DIR / f"{stamp}-{prefix}-{uuid.uuid4().hex[:6]}"
    run_dir.mkdir(parents=True, exist_ok=False)
    return run_dir


def write_json(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with tmp.open("w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, indent=2)
    os.replace(tmp, path)


def read_json(path: Path) -> dict[str, Any]:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        time.sleep(0.05)
        return json.loads(path.read_text(encoding="utf-8"))

