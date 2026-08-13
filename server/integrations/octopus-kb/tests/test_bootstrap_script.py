from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]


def test_bootstrap_vault_script_creates_entry_files(tmp_path: Path):
    script_path = REPO_ROOT / "scripts" / "bootstrap_vault.py"
    spec = spec_from_file_location("bootstrap_vault", script_path)
    module = module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)

    exit_code = module.main([str(tmp_path)])

    assert exit_code == 0
    assert (tmp_path / "AGENTS.md").exists()
    assert (tmp_path / ".octopus-kb.yml").exists()
    assert (tmp_path / "wiki" / "LOG.md").exists()
