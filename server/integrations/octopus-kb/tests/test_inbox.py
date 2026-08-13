import io
import json
import sys
from pathlib import Path


def _seed(tmp_path: Path) -> Path:
    vault = tmp_path / "vault"
    (vault / "wiki").mkdir(parents=True)
    (vault / "AGENTS.md").write_text("# Schema\n", encoding="utf-8")
    (vault / "wiki" / "INDEX.md").write_text("# Index\n", encoding="utf-8")
    (vault / "wiki" / "LOG.md").write_text("# Log\n", encoding="utf-8")
    return vault


def _medium_conf_proposal():
    return {
        "id": "pd1",
        "created_at": "2026-04-18T00:00:00+00:00",
        "source": {"kind": "raw_file", "path": "raw/x.md", "sha256": "a" * 64},
        "produced_by": {"provider_profile": "p", "model": "m", "prompt_version": "p@x"},
        "operations": [
            {
                "op": "append_log",
                "path": "wiki/LOG.md",
                "entry": "2026-04-18: medium",
                "rationale": "r",
                "confidence": 0.5,
            }
        ],
        "status": "pending",
    }


def _hard_reject_proposal():
    return {
        "id": "pe1",
        "created_at": "2026-04-18T00:00:00+00:00",
        "source": {"kind": "raw_file", "path": "raw/x.md", "sha256": "a" * 64},
        "produced_by": {"provider_profile": "p", "model": "m", "prompt_version": "p@x"},
        "operations": [
            {
                "op": "append_log",
                "path": "../escape.md",
                "entry": "x",
                "rationale": "r",
                "confidence": 0.95,
            }
        ],
        "status": "pending",
    }


def _write_to_inbox(vault: Path, proposal: dict) -> Path:
    inbox = vault / ".octopus-kb" / "inbox"
    inbox.mkdir(parents=True, exist_ok=True)
    path = inbox / f"{proposal['id']}.json"
    path.write_text(json.dumps(proposal), encoding="utf-8")
    return path


def test_inbox_list_emits_deferred_proposals_json(tmp_path):
    vault = _seed(tmp_path)
    _write_to_inbox(vault, _medium_conf_proposal())
    from octopus_kb_compound.cli import main

    buf = io.StringIO()
    original = sys.stdout
    sys.stdout = buf
    try:
        rc = main(["inbox", "--vault", str(vault), "--list", "--json"])
    finally:
        sys.stdout = original

    assert rc == 0
    data = json.loads(buf.getvalue())
    assert data["count"] == 1
    assert data["deferred"][0]["id"] == "pd1"


def test_inbox_review_shows_validator_verdicts(tmp_path):
    vault = _seed(tmp_path)
    _write_to_inbox(vault, _medium_conf_proposal())
    from octopus_kb_compound.cli import main

    buf = io.StringIO()
    original = sys.stdout
    sys.stdout = buf
    try:
        rc = main(["inbox", "--vault", str(vault), "--review", "pd1", "--json"])
    finally:
        sys.stdout = original

    assert rc == 0
    data = json.loads(buf.getvalue())
    assert data["proposal_id"] == "pd1"
    assert data["current_verdict"] == "defer"
    assert any(r["rule_id"] == "confidence.tier_gate_defer" for r in data["rule_results"])


def test_inbox_accept_applies_when_only_overridable_defers_block(tmp_path):
    vault = _seed(tmp_path)
    _write_to_inbox(vault, _medium_conf_proposal())
    from octopus_kb_compound.cli import main

    rc = main(["inbox", "--vault", str(vault), "--review", "pd1", "--accept"])

    assert rc == 0
    assert "2026-04-18: medium" in (vault / "wiki" / "LOG.md").read_text(encoding="utf-8")
    audit = list((vault / ".octopus-kb" / "audit").glob("*pd1.json"))
    assert audit, "audit entry must be written after override-apply"
    entry = json.loads(audit[0].read_text(encoding="utf-8"))
    assert "confidence.tier_gate_defer" in entry["override"]["overridden_rules"]
    assert not (vault / ".octopus-kb" / "inbox" / "pd1.json").exists()


def test_inbox_accept_still_blocked_by_hard_reject(tmp_path):
    vault = _seed(tmp_path)
    _write_to_inbox(vault, _hard_reject_proposal())
    from octopus_kb_compound.cli import main

    rc = main(["inbox", "--vault", str(vault), "--review", "pe1", "--accept", "--json"])

    assert rc == 0
    rejections = list((vault / ".octopus-kb" / "rejections").glob("*pe1.json"))
    assert rejections
    assert "# Log" == (vault / "wiki" / "LOG.md").read_text(encoding="utf-8").rstrip()
    assert not (vault / ".octopus-kb" / "inbox" / "pe1.json").exists()


def test_inbox_reject_moves_to_rejections_with_reason(tmp_path):
    vault = _seed(tmp_path)
    _write_to_inbox(vault, _medium_conf_proposal())
    from octopus_kb_compound.cli import main

    rc = main(
        [
            "inbox",
            "--vault",
            str(vault),
            "--review",
            "pd1",
            "--reject",
            "--reason",
            "out of scope",
        ]
    )

    assert rc == 0
    rejections = list((vault / ".octopus-kb" / "rejections").glob("*pd1.json"))
    assert rejections
    entry = json.loads(rejections[0].read_text(encoding="utf-8"))
    assert entry["reason"] == "out of scope"
    assert entry["source"] == "human_rejected"
    assert not (vault / ".octopus-kb" / "inbox" / "pd1.json").exists()
