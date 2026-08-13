from pathlib import Path

import pytest


def _fake_proposal(ops_count=1, confidence=0.9):
    return {
        "id": "x",
        "created_at": "2026-04-18T00:00:00+00:00",
        "source": {"kind": "raw_file", "path": "raw/x.md", "sha256": "a" * 64},
        "produced_by": {"provider_profile": "p", "model": "m", "prompt_version": "p@x"},
        "operations": [
            {
                "op": "append_log",
                "path": "wiki/LOG.md",
                "entry": "x",
                "rationale": "r",
                "confidence": confidence,
            }
            for _ in range(ops_count)
        ],
        "status": "pending",
    }


def _dummy_vault_state():
    from octopus_kb_compound.validators.declarative import VaultState

    return VaultState(canonical_keys=set(), page_titles=set())


def test_validator_chain_rejects_oversized_diff(tmp_path):
    from octopus_kb_compound.validators.declarative import evaluate_chain, load_rules

    rules = load_rules(Path("src/octopus_kb_compound/validators/builtins.yaml"))
    verdict = evaluate_chain(_fake_proposal(ops_count=25), _dummy_vault_state(), rules)
    assert verdict.final == "reject"
    assert any(v.rule_id == "safety.diff_size" for v in verdict.rule_results)


def test_validator_chain_downgrades_medium_diff():
    from octopus_kb_compound.validators.declarative import evaluate_chain, load_rules

    rules = load_rules(Path("src/octopus_kb_compound/validators/builtins.yaml"))
    verdict = evaluate_chain(_fake_proposal(ops_count=10), _dummy_vault_state(), rules)
    assert verdict.final == "downgrade"


def test_validator_chain_defers_medium_confidence():
    from octopus_kb_compound.validators.declarative import evaluate_chain, load_rules

    rules = load_rules(Path("src/octopus_kb_compound/validators/builtins.yaml"))
    verdict = evaluate_chain(_fake_proposal(confidence=0.5), _dummy_vault_state(), rules)
    assert verdict.final == "defer"


def test_validator_chain_passes_good_proposal():
    from octopus_kb_compound.validators.declarative import evaluate_chain, load_rules

    rules = load_rules(Path("src/octopus_kb_compound/validators/builtins.yaml"))
    verdict = evaluate_chain(
        _fake_proposal(ops_count=1, confidence=0.9), _dummy_vault_state(), rules
    )
    assert verdict.final == "pass"


def test_rule_loader_rejects_unknown_primitive(tmp_path):
    path = tmp_path / "bad.yaml"
    path.write_text(
        """
version: 1
rules:
  - id: bad
    applies_to: [create_page]
    check:
      nonexistent_primitive: true
    verdict: reject
    reason_template: "x"
""",
        encoding="utf-8",
    )
    from octopus_kb_compound.validators.declarative import RuleSchemaError, load_rules

    with pytest.raises(RuleSchemaError):
        load_rules(path)


def test_user_rules_file_is_loaded_additively(tmp_path):
    user = tmp_path / "rules.yaml"
    user.write_text(
        """
version: 1
rules:
  - id: user.my_rule
    applies_to: [append_log]
    check:
      op_count:
        gt: 0
    verdict: reject
    reason_template: "no logs allowed"
""",
        encoding="utf-8",
    )
    from octopus_kb_compound.validators.declarative import evaluate_chain, load_rules

    rules = load_rules(
        Path("src/octopus_kb_compound/validators/builtins.yaml"),
        user_rules_path=user,
    )
    verdict = evaluate_chain(
        _fake_proposal(ops_count=1, confidence=0.9), _dummy_vault_state(), rules
    )
    assert verdict.final == "reject"
    assert any(r.rule_id == "user.my_rule" for r in verdict.rule_results)


def test_primitive_vault_has_canonical_key_for_new_page():
    from octopus_kb_compound.validators.declarative import (
        VaultState,
        evaluate_chain,
        load_rules,
    )

    rules = load_rules(Path("src/octopus_kb_compound/validators/builtins.yaml"))
    vault_state = VaultState(canonical_keys={"topic"}, page_titles={"Topic"})
    proposal = {
        "id": "x",
        "created_at": "2026-04-18T00:00:00+00:00",
        "source": {"kind": "raw_file", "path": "raw/x.md", "sha256": "a" * 64},
        "produced_by": {"provider_profile": "p", "model": "m", "prompt_version": "p@x"},
        "operations": [
            {
                "op": "create_page",
                "path": "wiki/concepts/topic-new.md",
                "frontmatter": {
                    "title": "Topic",
                    "type": "concept",
                    "lang": "en",
                    "role": "concept",
                    "layer": "wiki",
                    "source_of_truth": "canonical",
                    "tags": [],
                    "summary": "s",
                },
                "body": "#\n",
                "rationale": "r",
                "confidence": 0.95,
                "source_span": {"path": "raw/x.md", "start_line": 1, "end_line": 1},
            }
        ],
        "status": "pending",
    }
    verdict = evaluate_chain(proposal, vault_state, rules)
    assert verdict.final == "reject"
    assert any(r.rule_id == "conflict.canonical_overlap" for r in verdict.rule_results)


def test_primitive_op_target_outside_vault():
    from octopus_kb_compound.validators.declarative import (
        VaultState,
        evaluate_chain,
        load_rules,
    )

    rules = load_rules(Path("src/octopus_kb_compound/validators/builtins.yaml"))
    proposal = {
        "id": "x",
        "created_at": "2026-04-18T00:00:00+00:00",
        "source": {"kind": "raw_file", "path": "raw/x.md", "sha256": "a" * 64},
        "produced_by": {"provider_profile": "p", "model": "m", "prompt_version": "p@x"},
        "operations": [
            {
                "op": "append_log",
                "path": "../escape/LOG.md",
                "entry": "x",
                "rationale": "r",
                "confidence": 1.0,
            }
        ],
        "status": "pending",
    }
    verdict = evaluate_chain(
        proposal, VaultState(canonical_keys=set(), page_titles=set()), rules
    )
    assert verdict.final == "reject"
    assert any(r.rule_id == "safety.path_escape" for r in verdict.rule_results)


def test_primitive_op_target_in_forbidden_area():
    from octopus_kb_compound.validators.declarative import (
        VaultState,
        evaluate_chain,
        load_rules,
    )

    rules = load_rules(Path("src/octopus_kb_compound/validators/builtins.yaml"))
    proposal = {
        "id": "x",
        "created_at": "2026-04-18T00:00:00+00:00",
        "source": {"kind": "raw_file", "path": "raw/x.md", "sha256": "a" * 64},
        "produced_by": {"provider_profile": "p", "model": "m", "prompt_version": "p@x"},
        "operations": [
            {
                "op": "append_log",
                "path": ".octopus-kb/proposals/injected.md",
                "entry": "x",
                "rationale": "r",
                "confidence": 1.0,
            }
        ],
        "status": "pending",
    }
    verdict = evaluate_chain(
        proposal, VaultState(canonical_keys=set(), page_titles=set()), rules
    )
    assert verdict.final == "reject"
    assert any(r.rule_id == "safety.forbidden_area" for r in verdict.rule_results)


def test_evaluate_chain_human_override_demotes_overridable_defer():
    from octopus_kb_compound.validators.declarative import (
        VaultState,
        evaluate_chain,
        load_rules,
    )

    rules = load_rules(Path("src/octopus_kb_compound/validators/builtins.yaml"))
    state = VaultState(canonical_keys=set(), page_titles=set())
    proposal = _fake_proposal(confidence=0.5)

    v_default = evaluate_chain(proposal, state, rules)
    assert v_default.final == "defer"

    v_override = evaluate_chain(proposal, state, rules, human_override=True)
    assert v_override.final == "pass"
    assert "confidence.tier_gate_defer" in v_override.overridden_rules


def test_evaluate_chain_human_override_cannot_demote_hard_reject():
    from octopus_kb_compound.validators.declarative import (
        VaultState,
        evaluate_chain,
        load_rules,
    )

    rules = load_rules(Path("src/octopus_kb_compound/validators/builtins.yaml"))
    state = VaultState(canonical_keys=set(), page_titles=set())
    proposal = {
        "id": "x",
        "created_at": "2026-04-18T00:00:00+00:00",
        "source": {"kind": "raw_file", "path": "raw/x.md", "sha256": "a" * 64},
        "produced_by": {"provider_profile": "p", "model": "m", "prompt_version": "p@x"},
        "operations": [
            {
                "op": "append_log",
                "path": "../outside/LOG.md",
                "entry": "x",
                "rationale": "r",
                "confidence": 0.95,
            }
        ],
        "status": "pending",
    }
    v = evaluate_chain(proposal, state, rules, human_override=True)
    assert v.final == "reject"
    assert any(r.rule_id == "safety.path_escape" for r in v.rule_results)
