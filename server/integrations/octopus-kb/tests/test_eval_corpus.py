from pathlib import Path


def _corpus_root() -> Path:
    return Path(__file__).resolve().parent.parent / "eval" / "corpora" / "small-vault"


def test_eval_corpus_exists_and_contains_required_entry_files():
    root = _corpus_root()
    assert root.is_dir()
    assert (root / "AGENTS.md").exists()
    assert (root / "wiki" / "INDEX.md").exists()
    assert (root / "wiki" / "LOG.md").exists()


def test_eval_corpus_has_at_least_one_page_per_primary_type():
    root = _corpus_root()
    expected = {"concept", "entity", "comparison", "timeline", "raw_source"}
    found = set()
    for md in root.rglob("*.md"):
        text = md.read_text(encoding="utf-8")
        if "\ntype: concept" in text:
            found.add("concept")
        if "\ntype: entity" in text:
            found.add("entity")
        if "\ntype: comparison" in text:
            found.add("comparison")
        if "\ntype: timeline" in text:
            found.add("timeline")
        if "\ntype: raw_source" in text:
            found.add("raw_source")
    assert expected <= found, f"missing types: {expected - found}"


def test_eval_corpus_lint_clean():
    from octopus_kb_compound.frontmatter import FrontmatterError, parse_document
    from octopus_kb_compound.lint import lint_pages
    from octopus_kb_compound.profile import load_vault_profile
    from octopus_kb_compound.vault import scan_markdown_files

    root = _corpus_root()

    parse_failures = []
    for md in sorted(root.rglob("*.md")):
        rel = md.relative_to(root)
        if any(part.startswith(".") for part in rel.parts):
            continue
        try:
            parse_document(md.read_text(encoding="utf-8", errors="replace"), strict=True)
        except FrontmatterError as exc:
            parse_failures.append((str(rel), str(exc)))
    assert parse_failures == [], f"malformed frontmatter in eval corpus: {parse_failures}"

    profile = load_vault_profile(root)
    pages = scan_markdown_files(root, profile)
    findings = lint_pages(pages)
    high = [
        f
        for f in findings
        if f.code
        in {
            "DUPLICATE_CANONICAL_PAGE",
            "CANONICAL_ALIAS_COLLISION",
            "SCHEMA_INVALID_FIELD",
            "SCHEMA_MISSING_FIELD",
            "SCHEMA_INVALID_CONDITIONAL",
            "BROKEN_LINK",
            "ALIAS_COLLISION",
            "UNRESOLVED_ALIAS",
        }
    ]
    assert high == [], f"eval corpus has high-severity lint findings: {high}"


def test_eval_corpus_has_detectable_drift_case():
    import hashlib
    import json

    root = _corpus_root()
    audit_dir = root / ".octopus-kb" / "audit"
    assert audit_dir.is_dir(), "corpus must ship pre-seeded audit entries"
    any_audit = list(audit_dir.glob("*.json"))
    assert any_audit, "at least one audit entry must exist"

    drift_count = 0
    for entry_path in any_audit:
        entry = json.loads(entry_path.read_text(encoding="utf-8"))
        source = entry.get("source") or {}
        raw = root / source.get("path", "")
        if not raw.exists():
            continue
        current = hashlib.sha256(raw.read_bytes()).hexdigest()
        if current != source.get("sha256"):
            drift_count += 1
    assert drift_count >= 1, (
        "corpus must include at least one audit entry whose raw source SHA differs from "
        "the recorded audit SHA, to exercise drift_detection"
    )
