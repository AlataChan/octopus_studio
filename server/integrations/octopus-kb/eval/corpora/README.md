# Eval Corpora

This directory contains committed reference vaults used by the eval harness. The
`small-vault/` corpus is intentionally compact but covers the primary PageMeta
types, rule-gated proposal audit records, and source-drift detection.

To regenerate a SHA for a raw source manually:

```bash
sha256sum eval/corpora/small-vault/raw/rag-ops-source.md
```

Or with Python:

```bash
python -c 'import hashlib, pathlib; p=pathlib.Path("eval/corpora/small-vault/raw/rag-ops-source.md"); print(hashlib.sha256(p.read_bytes()).hexdigest())'
```

One audit entry intentionally records an old SHA for `raw/rag-ops-source.md`.
That mismatch is not a corpus error; it is the engineered drift fixture used by
drift-detection tests.
