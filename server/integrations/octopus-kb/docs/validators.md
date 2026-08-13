# Declarative Validators

Phase A-min validators are YAML-only. Rule files are data, not code: the
loader accepts only the v1 JSON Schema in `schemas/rules/v1.json`, rejects
unknown check primitives, and never executes Python, regexes, or arbitrary
expressions from user configuration.

## Evaluation Order

`schema.proposal_invalid` runs first, before `applies_to` filtering. This is a
safety boundary: a proposal containing only an unsupported operation such as
`delete_page` is rejected by `schemas/llm/proposal.json` even though no later
rule applies to that operation type.

After schema validation, rules are filtered by `applies_to`. All check fields
inside a rule are AND-composed, so every primitive in the rule must fire before
the rule emits a verdict.

## Verdicts

All applicable rules are evaluated. The worst verdict wins:

`reject > defer > downgrade > pass`

Each non-pass result records a `rule_id`, `verdict`, and rendered `reason`.
Human override mode may demote rules marked `human_overridable: true` when their
verdict is `defer` or `downgrade`; `reject` verdicts are never demoted.

## Supported Primitives

| Primitive | Fires when |
| --- | --- |
| `op_count: {gt: N}` | The proposal has more than `N` operations. |
| `any_op_confidence_below: X` | Any operation has `confidence < X`. |
| `vault_has_canonical_key_for_new_page: true` | A `create_page` operation proposes a `canonical_name` or `title` whose normalized key already exists in the vault canonical index. |
| `proposal_schema_invalid: true` | The proposal fails `schemas/llm/proposal.json`. |
| `new_frontmatter_schema_invalid: true` | Any `create_page.frontmatter` fails `page-meta.json`. |
| `op_target_outside_vault: true` | Any operation target is absolute, contains `..`, or uses hidden path segments. |
| `op_target_in_forbidden_area: true` | Any operation target is under `.octopus-kb/`, `.git/`, or `.venv/`. |

Adding an eighth primitive is a code change. If a user rule file contains an
unknown primitive, `load_rules()` raises `RuleSchemaError` and no rules are run.
