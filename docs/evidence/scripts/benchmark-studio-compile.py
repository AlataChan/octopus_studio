#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import platform
import statistics
import time
from pathlib import Path
from typing import Any

from loom.ir.models import IRDocument
from loom.runtimes.studio.v1.compiler import compile_ir


def percentile(samples: list[float], fraction: float) -> float:
    ordered = sorted(samples)
    index = max(0, min(len(ordered) - 1, int(len(ordered) * fraction) - 1))
    return ordered[index]


def benchmark(fixture: Path, iterations: int) -> dict[str, Any]:
    raw = json.loads(fixture.read_text(encoding="utf-8"))
    ir = IRDocument.model_validate(raw)
    for _ in range(50):
        compile_ir(ir, source_document=raw)

    samples: list[float] = []
    for _ in range(iterations):
        started = time.perf_counter_ns()
        compile_ir(ir, source_document=raw)
        samples.append((time.perf_counter_ns() - started) / 1_000_000)

    return {
        "python": platform.python_version(),
        "iterations": iterations,
        "mean_ms": round(statistics.fmean(samples), 6),
        "p50_ms": round(statistics.median(samples), 6),
        "p95_ms": round(percentile(samples, 0.95), 6),
        "max_ms": round(max(samples), 6),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("fixture", type=Path)
    parser.add_argument("--iterations", type=int, default=1000)
    args = parser.parse_args()
    if args.iterations <= 0:
        parser.error("--iterations must be positive")
    print(json.dumps(benchmark(args.fixture, args.iterations), sort_keys=True))


if __name__ == "__main__":
    main()

