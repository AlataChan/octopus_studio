class PublishGateError extends Error {
  constructor(code, path, status = 409) {
    super("workflow draft is not publishable");
    this.name = "PublishGateError";
    this.code = code;
    this.path = path;
    this.status = status;
  }
}

function missingBindings(value) {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : ["invalid"];
  } catch {
    return ["invalid"];
  }
}

function assertPublishable({ draft, actor, workspace } = {}) {
  if (!draft || !workspace || Number(draft.workspaceId) !== Number(workspace.id)) {
    throw new PublishGateError("STUDIO_DRAFT_NOT_FOUND", "draft", 404);
  }
  if (!actor?.access?.ok) {
    throw new PublishGateError("STUDIO_PUBLISH_FORBIDDEN", "workspace", 403);
  }
  if (missingBindings(draft.missingBindingsJson).length) {
    throw new PublishGateError("STUDIO_BINDING_MISSING", "bindings");
  }
  if (
    draft.reviewStatus !== "approved" ||
    !draft.reviewedSubjectDigest ||
    draft.reviewedSubjectDigest !== draft.reviewSubjectDigest
  ) {
    throw new PublishGateError("STUDIO_REVIEW_REQUIRED", "review");
  }
  if (!draft.diffJson) {
    throw new PublishGateError("STUDIO_PUBLISH_DIFF_REQUIRED", "diff");
  }
  return { ok: true };
}

module.exports = { PublishGateError, assertPublishable };
