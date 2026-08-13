from pathlib import Path

from octopus_kb_compound.profile import load_vault_profile


def test_load_vault_profile_reads_flat_yaml_lists(tmp_path: Path):
    (tmp_path / ".octopus-kb.yml").write_text(
        "\n".join(
            [
                "schema: wiki/LLM_wiki.md",
                "index: wiki/INDEX.md",
                "exclude_globs:",
                "  - output/**",
                "  - octopus-kb/**",
            ]
        ),
        encoding="utf-8",
    )

    profile = load_vault_profile(tmp_path)

    assert profile.schema == "wiki/LLM_wiki.md"
    assert profile.index == "wiki/INDEX.md"
    assert profile.exclude_globs == ["output/**", "octopus-kb/**"]
