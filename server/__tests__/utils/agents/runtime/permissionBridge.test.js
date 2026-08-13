const PermissionBridge = require("../../../../utils/agents/runtime/permissionBridge");
const { PermissionMode, RiskLevel } = require("../../../../utils/permissions/constants");

describe("PermissionBridge", () => {
  test("delegates tool permission evaluation through the shared gateway", () => {
    const bridge = new PermissionBridge({
      permissionMode: PermissionMode.DEFAULT,
      allowedTools: ["memory", "write-file"],
      autoApprovedTools: [],
    });

    const safeResult = bridge.evaluate({
      name: "memory",
      riskLevel: RiskLevel.SAFE_READ,
    });
    const writeResult = bridge.evaluate({
      name: "write-file",
      riskLevel: RiskLevel.WRITE,
    });

    expect(safeResult.decision).toBe("allow");
    expect(writeResult.decision).toBe("require_confirmation");
  });
});
