from pathlib import Path

import pytest


def test_load_config_returns_defaults_when_file_missing(tmp_path):
    from octopus_kb_compound.config import load_config

    cfg = load_config(tmp_path)
    profile = cfg.resolve_profile()
    assert profile.base_url == "http://localhost:11434/v1"
    assert profile.model == "qwen2.5:7b-instruct"
    assert profile.api_key is None


def test_load_config_reads_toml_with_profiles(tmp_path, monkeypatch):
    cfg_dir = tmp_path / ".octopus-kb"
    cfg_dir.mkdir()
    (cfg_dir / "config.toml").write_text(
        """
version = 1
[llm]
default_profile = "cloud-cheap"
[llm.profiles.cloud-cheap]
base_url = "https://api.deepseek.com/v1"
model = "deepseek-chat"
api_key_env = "MY_KEY"
""",
        encoding="utf-8",
    )
    monkeypatch.setenv("MY_KEY", "sk-xyz")

    from octopus_kb_compound.config import load_config

    cfg = load_config(tmp_path)
    profile = cfg.resolve_profile()
    assert profile.base_url == "https://api.deepseek.com/v1"
    assert profile.model == "deepseek-chat"
    assert profile.api_key == "sk-xyz"


def test_load_config_raises_on_unknown_version(tmp_path):
    cfg_dir = tmp_path / ".octopus-kb"
    cfg_dir.mkdir()
    (cfg_dir / "config.toml").write_text("version = 999\n", encoding="utf-8")

    from octopus_kb_compound.config import ConfigError, load_config

    with pytest.raises(ConfigError):
        load_config(tmp_path)


def test_config_toml_validates_against_v1_json_schema(tmp_path):
    import json
    import tomllib

    import jsonschema

    schema_path = Path("schemas/config/v1.json")
    schema = json.loads(schema_path.read_text(encoding="utf-8"))

    sample = tmp_path / "config.toml"
    sample.write_text(
        """
version = 1
[llm]
default_profile = "cloud-cheap"
[llm.profiles.cloud-cheap]
base_url = "https://api.deepseek.com/v1"
model = "deepseek-chat"
api_key_env = "MY_KEY"
""",
        encoding="utf-8",
    )
    data = tomllib.loads(sample.read_text(encoding="utf-8"))
    jsonschema.validate(data, schema)

    bad = {"version": 999}
    import pytest as _pytest

    with _pytest.raises(jsonschema.ValidationError):
        jsonschema.validate(bad, schema)


def test_resolve_profile_by_name(tmp_path):
    cfg_dir = tmp_path / ".octopus-kb"
    cfg_dir.mkdir()
    (cfg_dir / "config.toml").write_text(
        """
version = 1
[llm]
default_profile = "a"
[llm.profiles.a]
base_url = "http://a/v1"
model = "a-model"
[llm.profiles.b]
base_url = "http://b/v1"
model = "b-model"
""",
        encoding="utf-8",
    )
    from octopus_kb_compound.config import load_config

    cfg = load_config(tmp_path)
    assert cfg.resolve_profile().model == "a-model"
    assert cfg.resolve_profile("b").model == "b-model"
