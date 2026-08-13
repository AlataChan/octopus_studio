import json
from pathlib import Path

import pytest


def _load_schema():
    path = Path(__file__).resolve().parent.parent / "schemas" / "page-meta.json"
    return json.loads(path.read_text(encoding="utf-8"))


def test_schema_file_exists_and_is_valid_json_schema():
    from jsonschema import Draft202012Validator

    schema = _load_schema()
    Draft202012Validator.check_schema(schema)
    assert schema["title"] == "PageMeta"
    assert "title" in schema["required"]
    assert "type" in schema["required"]
    assert "role" in schema["required"]


def test_schema_rejects_unknown_role_value():
    from jsonschema import Draft202012Validator

    schema = _load_schema()
    validator = Draft202012Validator(schema)
    errors = list(
        validator.iter_errors(
            {"title": "t", "type": "concept", "lang": "en", "role": "bogus-role"}
        )
    )
    assert any("bogus-role" in str(e.message) for e in errors)


def test_schema_requires_summary_on_wiki_layer_pages():
    from jsonschema import Draft202012Validator

    schema = _load_schema()
    validator = Draft202012Validator(schema)
    errors = list(
        validator.iter_errors(
            {
                "title": "t",
                "type": "concept",
                "lang": "en",
                "role": "concept",
                "layer": "wiki",
            }
        )
    )
    messages = " ".join(str(e.message) for e in errors)
    assert "summary" in messages


def test_schema_accepts_minimal_raw_source_page():
    from jsonschema import Draft202012Validator

    schema = _load_schema()
    validator = Draft202012Validator(schema)
    errors = list(
        validator.iter_errors(
            {
                "title": "t",
                "type": "raw_source",
                "lang": "en",
                "role": "raw_source",
                "layer": "source",
            }
        )
    )
    assert errors == []


def test_schema_accepts_additional_unknown_keys():
    from jsonschema import Draft202012Validator

    schema = _load_schema()
    validator = Draft202012Validator(schema)
    errors = list(
        validator.iter_errors(
            {
                "title": "t",
                "type": "note",
                "lang": "en",
                "role": "note",
                "custom_user_field": "future-proofing",
            }
        )
    )
    assert errors == []


def test_schema_accepts_memory_kind_enum_and_rejects_unknown_kind():
    from jsonschema import Draft202012Validator

    schema = _load_schema()
    validator = Draft202012Validator(schema)
    valid = {
        "title": "Decision Memory",
        "type": "note",
        "lang": "en",
        "role": "note",
        "layer": "wiki",
        "summary": "Decision summary",
        "kind": "decision",
    }
    invalid = {**valid, "kind": "random"}

    assert list(validator.iter_errors(valid)) == []
    assert any("random" in str(error.message) for error in validator.iter_errors(invalid))


def test_schema_documents_memory_link_fields():
    properties = _load_schema()["properties"]

    assert properties["kind"]["enum"] == [
        "decision",
        "fact",
        "open_question",
        "summary",
        "note",
    ]
    assert properties["created"]["format"] == "date-time"
    assert properties["supersedes"]["type"] == "string"
    assert properties["refines"]["type"] == "string"


def test_schema_declares_uri_and_date_time_formats():
    schema = _load_schema()
    properties = schema["properties"]
    assert properties["source_url"]["format"] == "uri"
    assert properties["fetched_at"]["format"] == "date-time"
    assert properties["converted_at"]["format"] == "date-time"


def test_package_data_schema_matches_dev_copy():
    """The shipped wheel resource and the dev-checkout copy must stay in sync."""
    import importlib.resources as resources

    package_bytes = (
        resources.files("octopus_kb_compound") / "_schemas" / "page-meta.json"
    ).read_bytes()
    dev_path = Path(__file__).resolve().parent.parent / "schemas" / "page-meta.json"
    dev_bytes = dev_path.read_bytes()
    assert package_bytes == dev_bytes, (
        "src/octopus_kb_compound/_schemas/page-meta.json and "
        "schemas/page-meta.json diverged; they must stay byte-identical"
    )
