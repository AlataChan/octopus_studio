const {
  FdeRequestError,
  validateFdeBody,
} = require("../../../utils/fde/fdeRequestValidation");

describe("validateFdeBody", () => {
  it("accepts an allowlisted import body", () => {
    expect(
      validateFdeBody(
        { body: { spec: { workflow: { nodes: [] } } } },
        { allowedKeys: ["spec"], maxBytes: 1000, maxDepth: 6, maxNodes: 2 }
      )
    ).toEqual({ spec: { workflow: { nodes: [] } } });
  });

  it.each([
    "workspaceId",
    "status",
    "engine",
    "specDigest",
    "reviewStatus",
    "reviewedByUserId",
    "assignedReviewerId",
    "publishedByUserId",
    "reviewedAt",
    "publishedAt",
  ])("rejects server-owned field %s", (field) => {
    expect(() =>
      validateFdeBody(
        { body: { spec: {}, [field]: "attacker-controlled" } },
        { allowedKeys: ["spec"], maxBytes: 1000 }
      )
    ).toThrow(FdeRequestError);
  });

  it("returns 413 for endpoint-specific bytes without echoing the body", () => {
    try {
      validateFdeBody(
        { body: { spec: { prompt: "sensitive" } }, rawBody: "x".repeat(20) },
        { allowedKeys: ["spec"], maxBytes: 10 }
      );
      throw new Error("expected rejection");
    } catch (error) {
      expect(error).toMatchObject({ status: 413, code: "STUDIO_REQUEST_TOO_LARGE" });
      expect(error.message).not.toContain("sensitive");
    }
  });

  it("rejects excessive depth and node count", () => {
    expect(() =>
      validateFdeBody(
        { body: { spec: { a: { b: { c: true } } } } },
        { allowedKeys: ["spec"], maxDepth: 2 }
      )
    ).toThrow(expect.objectContaining({ code: "STUDIO_REQUEST_TOO_DEEP" }));
    expect(() =>
      validateFdeBody(
        { body: { spec: { workflow: { nodes: [{}, {}] } } } },
        { allowedKeys: ["spec"], maxNodes: 1 }
      )
    ).toThrow(expect.objectContaining({ code: "STUDIO_REQUEST_TOO_MANY_NODES" }));
  });

  it("rejects secret-like values without returning them", () => {
    try {
      validateFdeBody(
        { body: { spec: { description: "Bearer top-secret-token" } } },
        { allowedKeys: ["spec"], rejectSecrets: true }
      );
      throw new Error("expected rejection");
    } catch (error) {
      expect(error.code).toBe("STUDIO_REQUEST_SECRET_REJECTED");
      expect(JSON.stringify(error)).not.toContain("top-secret-token");
    }
  });
});
