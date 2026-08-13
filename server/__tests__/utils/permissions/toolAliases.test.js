const { evaluateToolCall, getToolRiskLevel } = require("../../../utils/permissions/toolGateway");
const { PermissionMode, RiskLevel } = require("../../../utils/permissions/constants");

describe("toolAliases integration", () => {
  test("allowedTools supports abstract alias names for runtime tools", () => {
    const result = evaluateToolCall({
      toolName: "web-browsing",
      permissionMode: PermissionMode.DEFAULT,
      allowedTools: ["http-request"],
      autoApprovedTools: [],
    });

    expect(result.decision).toBe("require_confirmation");
  });

  test("risk level resolves via abstract alias when runtime tool name is unknown", () => {
    expect(getToolRiskLevel("read-document-file")).toBe(RiskLevel.SAFE_READ);
  });
});

