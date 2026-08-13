/**
 * TDD: ToolResult.approvalSuspended — HITL 非阻塞挂起 marker
 * Task: M1.B Task 6a-1
 */
const ToolResult = require("../../../../utils/agents/aibitat/toolResult");

describe("ToolResult.approvalSuspended", () => {
  const toolUseId = "tu-abc123";
  const toolName = "bash";
  const confirmationId = "conf-xyz";

  test("type is approvalSuspended", () => {
    const result = ToolResult.approvalSuspended(
      toolUseId,
      toolName,
      confirmationId
    );
    expect(result.type).toBe("approvalSuspended");
  });

  test("isError is false (not treated as failure by streamingToolExecutor)", () => {
    const result = ToolResult.approvalSuspended(
      toolUseId,
      toolName,
      confirmationId
    );
    expect(result.isError).toBe(false);
  });

  test("meta.confirmationId matches the passed confirmationId", () => {
    const result = ToolResult.approvalSuspended(
      toolUseId,
      toolName,
      confirmationId
    );
    expect(result.meta.confirmationId).toBe(confirmationId);
  });

  test("meta.suspended is true", () => {
    const result = ToolResult.approvalSuspended(
      toolUseId,
      toolName,
      confirmationId
    );
    expect(result.meta.suspended).toBe(true);
  });

  test("content contains confirmationId by default", () => {
    const result = ToolResult.approvalSuspended(
      toolUseId,
      toolName,
      confirmationId
    );
    expect(result.content).toContain(confirmationId);
  });

  test("toolUseId and toolName are set correctly", () => {
    const result = ToolResult.approvalSuspended(
      toolUseId,
      toolName,
      confirmationId
    );
    expect(result.toolUseId).toBe(toolUseId);
    expect(result.toolName).toBe(toolName);
  });

  test("custom message via options.message overrides default content", () => {
    const customMessage = "Custom suspension message";
    const result = ToolResult.approvalSuspended(
      toolUseId,
      toolName,
      confirmationId,
      { message: customMessage }
    );
    expect(result.content).toBe(customMessage);
  });

  test("options.originalFunctionCall is set when provided", () => {
    const ofc = { name: "bash", arguments: '{"cmd":"ls"}' };
    const result = ToolResult.approvalSuspended(
      toolUseId,
      toolName,
      confirmationId,
      { originalFunctionCall: ofc }
    );
    expect(result.originalFunctionCall).toEqual(ofc);
  });

  test("originalFunctionCall defaults to null when not provided", () => {
    const result = ToolResult.approvalSuspended(
      toolUseId,
      toolName,
      confirmationId
    );
    expect(result.originalFunctionCall).toBeNull();
  });

  test("toFunctionMessage() does not throw", () => {
    const result = ToolResult.approvalSuspended(
      toolUseId,
      toolName,
      confirmationId
    );
    expect(() => result.toFunctionMessage()).not.toThrow();
    const msg = result.toFunctionMessage();
    expect(msg.role).toBe("function");
    expect(msg.name).toBe(toolName);
  });

  test("serialize() does not throw and contains type and meta", () => {
    const result = ToolResult.approvalSuspended(
      toolUseId,
      toolName,
      confirmationId
    );
    expect(() => result.serialize()).not.toThrow();
    const serialized = result.serialize();
    expect(serialized).toContain('"type":"approvalSuspended"');
    expect(serialized).toContain(confirmationId);
  });
});
