from __future__ import annotations

import tomllib
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


ACTIVE_PUBLIC_FILES = [
    "README.md",
    "CONTRIBUTING.md",
    "docs/architecture.md",
    "docs/production-vault.md",
    "examples/expanded-vault/AGENTS.md",
    "schemas/README.md",
    "schemas/page-meta.json",
    "schemas/cli/lint.json",
    "schemas/cli/neighbors.json",
    "scripts/bootstrap_vault.py",
    "src/octopus_kb_compound/__init__.py",
    "src/octopus_kb_compound/_schemas/page-meta.json",
    "src/octopus_kb_compound/ingest.py",
]


def test_distribution_name_is_octopus_kb_with_stable_cli_entrypoint() -> None:
    pyproject = tomllib.loads((ROOT / "pyproject.toml").read_text(encoding="utf-8"))

    assert pyproject["project"]["name"] == "octopus-kb"
    assert pyproject["project"]["scripts"]["octopus-kb"] == "octopus_kb_compound.cli:main"
    assert "octopus_kb_compound" in pyproject["tool"]["setuptools"]["package-data"]


def test_active_public_files_use_octopus_kb_name() -> None:
    stale_paths = [
        path
        for path in ACTIVE_PUBLIC_FILES
        if "octopus-kb-compound" in (ROOT / path).read_text(encoding="utf-8")
    ]

    assert stale_paths == []


def test_schema_ids_follow_renamed_repository() -> None:
    schema_paths = [
        "schemas/page-meta.json",
        "src/octopus_kb_compound/_schemas/page-meta.json",
        "schemas/cli/lint.json",
        "schemas/cli/neighbors.json",
    ]

    for path in schema_paths:
        text = (ROOT / path).read_text(encoding="utf-8")
        assert "github.com/AlataChan/octopus-kb/" in text
