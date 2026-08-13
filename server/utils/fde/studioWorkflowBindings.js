const prisma = require("../prisma");

const RESERVED_DATASET_HANDLE = "workspace_kb";

class StudioWorkflowBindingError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = "StudioWorkflowBindingError";
    this.code = code;
    this.status = status;
  }
}

function nonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function missingEntry(binding) {
  return { kind: binding.kind, handle: binding.handle };
}

async function resolveBindings({
  workspaceId,
  requiredBindings,
  prismaClient = prisma,
} = {}) {
  const numericWorkspaceId = Number(workspaceId);
  if (!Number.isInteger(numericWorkspaceId) || numericWorkspaceId <= 0) {
    throw new StudioWorkflowBindingError(
      "STUDIO_BINDING_WORKSPACE_REQUIRED",
      "a valid workspace is required to resolve bindings"
    );
  }
  if (!Array.isArray(requiredBindings)) {
    throw new StudioWorkflowBindingError(
      "STUDIO_BINDING_LIST_INVALID",
      "workflow bindings must be an array"
    );
  }
  for (const binding of requiredBindings) {
    if (!binding || !["model", "dataset"].includes(binding.kind)) {
      throw new StudioWorkflowBindingError(
        "STUDIO_BINDING_UNKNOWN_KIND",
        "workflow contains an unsupported binding kind"
      );
    }
  }

  const workspace = await prismaClient.workspaces.findUnique({
    where: { id: numericWorkspaceId },
    select: {
      id: true,
      slug: true,
      chatProvider: true,
      chatModel: true,
    },
  });
  const resolved = { model: {}, dataset: {} };
  const missing = [];

  for (const binding of requiredBindings) {
    let value = null;
    if (binding.kind === "model") {
      if (
        binding.handle === "default-chat-model" &&
        workspace &&
        nonEmpty(workspace.chatProvider) &&
        nonEmpty(workspace.chatModel)
      ) {
        value = {
          provider: workspace.chatProvider,
          model: workspace.chatModel,
        };
      }
    } else if (
      binding.handle === RESERVED_DATASET_HANDLE &&
      workspace &&
      nonEmpty(workspace.slug)
    ) {
      const document = await prismaClient.workspace_documents.findFirst({
        where: {
          workspaceId: numericWorkspaceId,
          docpath: RESERVED_DATASET_HANDLE,
        },
        select: { docId: true, docpath: true },
      });
      if (document) {
        value = {
          docId: document.docId,
          vectorNamespace: workspace.slug,
        };
      }
    }

    if (value) resolved[binding.kind][binding.handle] = value;
    else if (binding.required !== false) missing.push(missingEntry(binding));
  }

  missing.sort(
    (left, right) =>
      left.kind.localeCompare(right.kind) ||
      left.handle.localeCompare(right.handle)
  );
  return { resolved, missing };
}

module.exports = {
  RESERVED_DATASET_HANDLE,
  StudioWorkflowBindingError,
  resolveBindings,
};
