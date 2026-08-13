# FDE contract provenance

Source repository: octopus_FDE
Source path: schemas/runtime/studio-workflow-spec-v1.json
Phase 0 FDE commit: 81e2c0b3626b1eef030c902db32676889f75b02b
Current compiler commit: e87b6c75674900e4a750925e83ab1cf03bcbb999
Schema-introducing commit: 31c66f958f9225c5e8fd14654b7e5ef6251857fd
Contract version: 1.1

## Additive v1.1 capability and archetype gaps

The contract remains at the proven manual
`trigger -> retrieval -> llm -> output` subset. Every other node type and every
non-manual trigger remains fail-closed. Version 1.1 adds optional JSON-Schema
structured output to LLM nodes; version 1.0 remains valid for unstructured
specs.

Zero of FDE's five curated IRs compile to `studio-v1` without reducing their
semantics:

- `01-ecommerce-customer-faq` declares `product_kb`, while Studio v1 permits
  only the reserved workspace-scoped `workspace_kb` handle. Its legacy
  `${node.field}` structured references and prompt interpolation of
  `${retrieve.chunks}` also require a future IR migration before execution
  under the v1.1 `${node.data}` / string-only prompt grammar.
- `02-tcm-intake-triage` needs code and condition.
- `03-clinic-ops-summary` needs a scheduled trigger, two HTTP nodes, code, and
  their runtime mappings.
- `04-tcm-followup` needs agent, code, and loop.
- `05-ecommerce-order-exception` needs a webhook trigger, parallel, code,
  and condition.

Update rule: change the FDE source first, then copy both the schema and the
.sha256 file byte-for-byte and update the source commit above. Never edit the
Studio copy independently — studioWorkflowSpecSchema.test.js asserts the digest
unconditionally and will fail on any local edit.
