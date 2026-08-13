from pathlib import Path


def test_validate_frontmatter_returns_empty_for_valid_concept():
    from octopus_kb_compound.schema import validate_frontmatter

    findings = validate_frontmatter(
        {
            "title": "RAG Operations",
            "type": "concept",
            "lang": "en",
            "role": "concept",
            "layer": "wiki",
            "summary": "Ops wrapper around a retrieval-augmented generation stack.",
        }
    )
    assert findings == []


def test_validate_frontmatter_reports_missing_required_field():
    from octopus_kb_compound.schema import SchemaFinding, validate_frontmatter

    findings = validate_frontmatter({"type": "concept", "lang": "en", "role": "concept"})
    codes = {f.code for f in findings}
    fields = {f.field for f in findings}
    assert "SCHEMA_MISSING_FIELD" in codes
    assert "title" in fields


def test_validate_frontmatter_reports_invalid_enum_value():
    from octopus_kb_compound.schema import validate_frontmatter

    findings = validate_frontmatter(
        {
            "title": "x",
            "type": "concept",
            "lang": "en",
            "role": "not-a-real-role",
        }
    )
    codes = {f.code for f in findings}
    assert "SCHEMA_INVALID_FIELD" in codes
    assert any(f.field == "role" for f in findings)


def test_validate_frontmatter_reports_wiki_summary_conditional():
    from octopus_kb_compound.schema import validate_frontmatter

    findings = validate_frontmatter(
        {
            "title": "x",
            "type": "concept",
            "lang": "en",
            "role": "concept",
            "layer": "wiki",
        }
    )
    assert any(
        f.code in {"SCHEMA_MISSING_FIELD", "SCHEMA_INVALID_CONDITIONAL"}
        and f.field == "summary"
        for f in findings
    )


def test_validate_frontmatter_accepts_additional_unknown_keys():
    from octopus_kb_compound.schema import validate_frontmatter

    findings = validate_frontmatter(
        {
            "title": "x",
            "type": "note",
            "lang": "en",
            "role": "note",
            "custom_user_field": "future-proofing",
        }
    )
    assert findings == []


def test_validate_frontmatter_enforces_uri_format_on_source_url():
    from octopus_kb_compound.schema import validate_frontmatter

    findings = validate_frontmatter(
        {
            "title": "x",
            "type": "raw_source",
            "lang": "en",
            "role": "raw_source",
            "layer": "source",
            "source_url": "not-a-valid-uri-because-no-scheme",
        }
    )
    assert any(
        f.field == "source_url" and f.code == "SCHEMA_INVALID_FIELD"
        for f in findings
    )


def test_validate_frontmatter_enforces_date_time_format_on_fetched_at():
    from octopus_kb_compound.schema import validate_frontmatter

    findings = validate_frontmatter(
        {
            "title": "x",
            "type": "raw_source",
            "lang": "en",
            "role": "raw_source",
            "layer": "source",
            "fetched_at": "yesterday afternoon",
        }
    )
    assert any(
        f.field == "fetched_at" and f.code == "SCHEMA_INVALID_FIELD"
        for f in findings
    )
