# Performance and cost evidence

This file reports measured engineering data, not a production SLA. Commands
ran on the 2026-08-09 local close-out worktrees; the demonstrations are
reproducible from [`demo.md`](./demo.md).

## Current measured data

| Measurement                      | Result                                                                                      | Scope / interpretation                                                                                       |
| -------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| FDE in-process compile benchmark | 1,000 compiles: mean `0.104391 ms`, p50 `0.088771 ms`, p95 `0.179791 ms`, max `1.049708 ms` | Python 3.12.8, warm process, parsed IR reused; deterministic compiler only, excluding HTTP/provider/database |
| E-commerce SIGKILL E2E           | Jest `1.055 s`; wall `1.98 s`, user `1.18 s`, sys `0.35 s`                                  | One temporary-SQLite run, deterministic provider fixture, two child processes and actual `SIGKILL`           |
| Full Studio server suite         | `72.937 s`: 346 suites passed, 1 skipped; 2,755 tests passed, 1 skipped                     | Regression signal, not request throughput                                                                    |
| Full Studio frontend suite       | `18.95 s`: 79 files / 436 tests passed                                                      | Vitest reported duration; transform/collection overhead included                                             |
| Full FDE suite                   | `41.09 s`: 612 passed, 4 skipped, 3 expected failures                                       | Regression signal, not request throughput                                                                    |

The compiler measurement is produced by the committed script and raw record:

```bash
cd "$FDE_WORKTREE"
.venv/bin/python \
  "$STUDIO_WORKTREE/docs/evidence/scripts/benchmark-studio-compile.py" \
  tests/fixtures/studio/v1/ecommerce-faq.ir.json --iterations 1000
```

See
[`benchmark-studio-compile-2026-08-09.txt`](./benchmark-studio-compile-2026-08-09.txt).
The E2E wall measurement used:

```bash
cd "$STUDIO_WORKTREE/server"
/usr/bin/time -p npx jest --runInBand \
  __tests__/utils/fde/ecommerceFaqE2E.test.js
```

## Cost boundary

The deterministic e-commerce fixture records 15 synthetic tokens and a test
pricing source. It makes zero external paid-provider calls, but does not store
`costUsd`; provider cost is therefore **unknown**, not zero. No production cost
claim can be inferred. Production evidence
must report provider/model, prompt/completion tokens, pricing source, actual
`costUsd`, p50/p95 latency, retries, and sample size. Missing pricing fails
closed to “unknown”; it must never be represented as free.

No customer payload or API key is required to reproduce this evidence.
