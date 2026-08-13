import os
import stat
import subprocess
from pathlib import Path


def test_hook_script_exists_and_is_executable():
    path = Path(__file__).resolve().parent.parent / "examples" / "hooks" / "kb-grep-guard.sh"
    assert path.exists(), "kb-grep-guard.sh missing"
    mode = path.stat().st_mode
    assert mode & stat.S_IXUSR, "kb-grep-guard.sh must be executable"


def _pretool_payload(tool_name, path):
    import json as _json

    return _json.dumps({"tool_name": tool_name, "tool_input": {"path": path}})


def test_hook_warns_when_marker_missing_and_path_is_vault(tmp_path):
    path = Path(__file__).resolve().parent.parent / "examples" / "hooks" / "kb-grep-guard.sh"
    env = os.environ.copy()
    env["OCTOPUS_KB_MARKER"] = str(tmp_path / ".octopus-kb" / ".retrieve-bundle-marker")
    result = subprocess.run(
        [str(path)],
        env=env,
        capture_output=True,
        text=True,
        input=_pretool_payload("Grep", "wiki/concepts/foo.md"),
    )
    assert result.returncode == 0
    assert "retrieve-bundle" in result.stderr


def test_hook_stays_silent_when_marker_present(tmp_path):
    path = Path(__file__).resolve().parent.parent / "examples" / "hooks" / "kb-grep-guard.sh"
    marker = tmp_path / ".octopus-kb" / ".retrieve-bundle-marker"
    marker.parent.mkdir(parents=True, exist_ok=True)
    marker.write_text("", encoding="utf-8")
    env = os.environ.copy()
    env["OCTOPUS_KB_MARKER"] = str(marker)
    result = subprocess.run(
        [str(path)],
        env=env,
        capture_output=True,
        text=True,
        input=_pretool_payload("Grep", "wiki/x.md"),
    )
    assert result.returncode == 0
    assert result.stderr == ""


def test_hook_ignores_non_vault_paths(tmp_path):
    path = Path(__file__).resolve().parent.parent / "examples" / "hooks" / "kb-grep-guard.sh"
    env = os.environ.copy()
    env["OCTOPUS_KB_MARKER"] = str(tmp_path / "no-marker")
    result = subprocess.run(
        [str(path)],
        env=env,
        capture_output=True,
        text=True,
        input=_pretool_payload("Grep", "src/file.py"),
    )
    assert result.returncode == 0
    assert result.stderr == ""


def test_hook_ignores_non_grep_tools(tmp_path):
    path = Path(__file__).resolve().parent.parent / "examples" / "hooks" / "kb-grep-guard.sh"
    env = os.environ.copy()
    env["OCTOPUS_KB_MARKER"] = str(tmp_path / "no-marker")
    result = subprocess.run(
        [str(path)],
        env=env,
        capture_output=True,
        text=True,
        input=_pretool_payload("Read", "wiki/x.md"),
    )
    assert result.returncode == 0
    assert result.stderr == ""
