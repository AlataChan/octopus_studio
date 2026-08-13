const crypto = require("crypto");
const {
  validateStudioWorkflowSpec,
  StudioWorkflowSpecError,
} = require("./studioWorkflowSpec");
const {
  RESERVED_DATASET_HANDLE,
  resolveBindings,
} = require("./studioWorkflowBindings");
const {
  FdeWorkflowDraft,
  STUDIO_REVIEW_POLICY_VERSION,
} = require("../../models/fdeWorkflowDraft");
const { redactFdeValue } = require("./redaction");

const CONTRACT = "studio-v1";
const ENGINE = "mastra";
const COMPILER_VERSION =
  "fde-studio-v1@e87b6c75674900e4a750925e83ab1cf03bcbb999";

const STUDIO_REVIEW_POLICY = Object.freeze({
  publishRequiresReview: true,
  source: "studio-default",
});

function importStudioWorkflowSpec({ spec, tenantId, bindings = {} } = {}) {
  if (!tenantId || typeof tenantId !== "string") {
    throw new StudioWorkflowSpecError(
      "STUDIO_IMPORT_TENANT_REQUIRED",
      "tenantId is required to import a Studio workflow spec"
    );
  }

  const validated = validateStudioWorkflowSpec(spec);

  const resolvedBindings = { model: {}, dataset: {} };
  const missingBindings = [];

  for (const binding of validated.workflow.required_bindings) {
    const available = bindings[binding.kind] || {};
    const resolved = available[binding.handle];
    if (resolved) {
      resolvedBindings[binding.kind][binding.handle] = resolved;
    } else if (binding.required) {
      missingBindings.push({ kind: binding.kind, handle: binding.handle });
    }
  }

  missingBindings.sort(
    (a, b) => a.kind.localeCompare(b.kind) || a.handle.localeCompare(b.handle)
  );

  return {
    status: missingBindings.length === 0 ? "ready" : "draft",
    contract: CONTRACT,
    engine: ENGINE,
    tenantId,
    sourceIrHash: validated.source_ir_hash,
    reviewPolicy: STUDIO_REVIEW_POLICY,
    resolvedBindings,
    missingBindings,
    spec: validated,
  };
}

function isUuid(value) {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    )
  );
}

function lineageKeyFor(lineageKey) {
  if (lineageKey === undefined || lineageKey === null) {
    return crypto.randomUUID();
  }
  if (!isUuid(lineageKey)) {
    throw new StudioWorkflowSpecError(
      "STUDIO_LINEAGE_REFERENCE_INVALID",
      "lineage references must be UUIDs",
      "/lineageKey"
    );
  }
  return lineageKey;
}

function assertBindingManifest(spec) {
  const expected = new Set();
  for (const node of spec.workflow.nodes) {
    if (node.type === "retrieval") expected.add(`dataset\u0000${node.dataset}`);
    if (node.type === "llm") expected.add(`model\u0000${node.model}`);
  }
  const declared = new Set();
  for (const binding of spec.workflow.required_bindings) {
    const key = `${binding.kind}\u0000${binding.handle}`;
    if (binding.required !== true || declared.has(key)) {
      throw new StudioWorkflowSpecError(
        "STUDIO_BINDING_MANIFEST_MISMATCH",
        "required bindings do not exactly match workflow node references",
        "/workflow/required_bindings"
      );
    }
    declared.add(key);
  }
  if (
    expected.size !== declared.size ||
    [...expected].some((key) => !declared.has(key))
  ) {
    throw new StudioWorkflowSpecError(
      "STUDIO_BINDING_MANIFEST_MISMATCH",
      "required bindings do not exactly match workflow node references",
      "/workflow/required_bindings"
    );
  }
}

async function persistStudioWorkflowSpec({
  spec,
  workspaceId,
  actorUserId,
  lineageKey,
  parentDraftId,
  fdeSessionId,
  fdeFromTurnId,
  fdeToTurnId,
  diffJson,
} = {}) {
  const assignedLineageKey = lineageKeyFor(lineageKey);
  if (parentDraftId != null && !isUuid(parentDraftId)) {
    throw new StudioWorkflowSpecError(
      "STUDIO_LINEAGE_REFERENCE_INVALID",
      "lineage references must be UUIDs",
      "/parentDraftId"
    );
  }
  const validated = validateStudioWorkflowSpec(spec);
  assertBindingManifest(validated);
  if (
    JSON.stringify(redactFdeValue(validated, { maxDepth: 32 })) !==
    JSON.stringify(validated)
  ) {
    throw new StudioWorkflowSpecError(
      "STUDIO_SPEC_SECRET_VALUE",
      "workflow specifications cannot contain secret-like values",
      "/"
    );
  }
  const unsupportedDataset = validated.workflow.required_bindings.some(
    (binding) =>
      binding.kind === "dataset" && binding.handle !== RESERVED_DATASET_HANDLE
  );
  if (unsupportedDataset) {
    throw new StudioWorkflowSpecError(
      "STUDIO_BINDING_DATASET_SCOPE_UNSUPPORTED",
      "studio-v1 supports only workspace-scoped knowledge retrieval"
    );
  }

  const { resolved, missing } = await resolveBindings({
    workspaceId,
    requiredBindings: validated.workflow.required_bindings,
  });
  return FdeWorkflowDraft.upsertRevision({
    workspaceId,
    lineageKey: assignedLineageKey,
    parentDraftId: parentDraftId || null,
    fdeSessionId: fdeSessionId || null,
    fdeFromTurnId: fdeFromTurnId || null,
    fdeToTurnId: fdeToTurnId || null,
    diffJson: diffJson || null,
    name: validated.workflow.name,
    contract: CONTRACT,
    targetVersion: validated.target_version,
    schemaVersion: validated.schema_version,
    compilerVersion: COMPILER_VERSION,
    sourceIrVersion: validated.source_ir_version,
    sourceIrHash: validated.source_ir_hash,
    spec: validated,
    engine: ENGINE,
    resolvedBindings: resolved,
    missingBindings: missing,
    studioReviewPolicyVersion: STUDIO_REVIEW_POLICY_VERSION,
    createdByUserId: actorUserId,
  });
}

module.exports = {
  COMPILER_VERSION,
  importStudioWorkflowSpec,
  lineageKeyFor,
  persistStudioWorkflowSpec,
  STUDIO_REVIEW_POLICY,
};
