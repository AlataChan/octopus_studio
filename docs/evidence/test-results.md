# Verification results

Final close-out commands and verbatim counts are recorded below.

| Scope                      | Working directory           | Command                                                                                                               | Result                                                                                                    |
| -------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| FDE Studio compiler        | `$FDE_WORKTREE`             | `.venv/bin/pytest tests/runtimes/studio/v1 tests/cli/test_compile_studio.py -q`                                       | `53 passed, 1 xfailed in 0.57s`; expected failure is the intentionally unsupported legacy curated fixture |
| Studio e-commerce contract | `$STUDIO_WORKTREE/server`   | `npx jest --runInBand __tests__/utils/fde/ecommerceFaqE2E.test.js`                                                    | See the current CI run for the latest result                                                              |
| Full Studio server         | `$STUDIO_WORKTREE/server`   | `npx jest --runInBand`                                                                                                | `346 passed, 1 skipped` suites; `2755 passed, 1 skipped` tests; `72.937 s`                                |
| Full Studio frontend       | `$STUDIO_WORKTREE/frontend` | `npm test`                                                                                                            | `79 passed` files; `436 passed` tests; `18.95 s`                                                          |
| Full FDE                   | `$FDE_WORKTREE`             | `.venv/bin/pytest -q`                                                                                                 | `612 passed, 4 skipped, 3 xfailed, 1 warning in 41.09s`                                                   |
| FDE static checks          | `$FDE_WORKTREE`             | `.venv/bin/ruff check loom tests && .venv/bin/mypy loom`                                                              | `All checks passed`; `Success: no issues found in 110 source files`                                       |
| Prisma SQLite              | `$STUDIO_WORKTREE/server`   | `npx prisma validate --schema prisma/schema.prisma`                                                                   | schema valid; Prisma 7 config deprecation warning only                                                    |
| Prisma PostgreSQL          | `$STUDIO_WORKTREE/server`   | `DATABASE_URL=postgresql://user:pass@localhost:5432/check npx prisma validate --schema prisma/postgres/schema.prisma` | schema valid; URL is parsed only; no connection is made                                                   |

All tests are local or deterministic. A real-provider commercial canary is an
owner G4 action because it requires credentials, cost authorization, and an
approved data set.
