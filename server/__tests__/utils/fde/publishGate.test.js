const {
  PublishGateError,
  assertPublishable,
} = require("../../../utils/fde/publishGate");

function input(overrides = {}) {
  return {
    draft: {
      workspaceId: 7,
      reviewStatus: "approved",
      reviewedSubjectDigest: "digest",
      reviewSubjectDigest: "digest",
      missingBindingsJson: "[]",
      diffJson: "{}",
      ...overrides.draft,
    },
    workspace: { id: 7, ...overrides.workspace },
    actor: { user: { id: 12 }, access: { ok: true }, ...overrides.actor },
  };
}

describe("assertPublishable", () => {
  it("accepts an authorized, current, diff-backed approval", () => {
    expect(assertPublishable(input())).toEqual({ ok: true });
  });

  it.each([
    ["foreign workspace", { workspace: { id: 8 } }, "STUDIO_DRAFT_NOT_FOUND"],
    ["missing permission", { actor: { access: { ok: false } } }, "STUDIO_PUBLISH_FORBIDDEN"],
    ["missing diff", { draft: { diffJson: null } }, "STUDIO_PUBLISH_DIFF_REQUIRED"],
    ["stale approval", { draft: { reviewedSubjectDigest: "old" } }, "STUDIO_REVIEW_REQUIRED"],
    ["missing binding", { draft: { missingBindingsJson: '["workspace_kb"]' } }, "STUDIO_BINDING_MISSING"],
  ])("fails closed for %s", (_name, overrides, code) => {
    expect(() => assertPublishable(input(overrides))).toThrow(
      expect.objectContaining({ code })
    );
  });

  it("uses stable errors", () => {
    expect(() => assertPublishable(input({ draft: { diffJson: null } }))).toThrow(
      PublishGateError
    );
  });
});
