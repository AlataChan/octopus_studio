const { parseApprovalCommand } = require("../../src/security/approvalCommands");

describe("parseApprovalCommand", () => {
  test("returns null for non-commands", () => {
    expect(parseApprovalCommand("hello")).toBeNull();
    expect(parseApprovalCommand("")).toBeNull();
  });

  test("parses /approve with id and reason", () => {
    const cmd = parseApprovalCommand("/approve 123 ok to proceed");
    expect(cmd.action).toBe("approve");
    expect(cmd.confirmationId).toBe(123);
    expect(cmd.reason).toBe("ok to proceed");
  });

  test("parses /reject with id and empty reason", () => {
    const cmd = parseApprovalCommand("/reject 9");
    expect(cmd.action).toBe("reject");
    expect(cmd.confirmationId).toBe(9);
    expect(cmd.reason).toBe("");
  });

  test("returns error when id is missing or invalid", () => {
    expect(parseApprovalCommand("/approve")).toEqual({ error: "INVALID_ID", cmd: "/approve" });
    expect(parseApprovalCommand("/reject abc")).toEqual({ error: "INVALID_ID", cmd: "/reject" });
  });
});

