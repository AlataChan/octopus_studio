const ToolResult = require("../../../../utils/agents/aibitat/toolResult");

describe("ToolResult", () => {
  test("builds function messages without changing the existing wire format", () => {
    const result = ToolResult.success("tool-1", "web-search", "done", {
      originalFunctionCall: {
        name: "web-search",
        arguments: '{"query":"hello"}',
      },
    });

    expect(result.type).toBe("success");
    expect(result.isError).toBe(false);
    expect(result.toFunctionMessage()).toEqual({
      name: "web-search",
      role: "function",
      content: "done",
      originalFunctionCall: {
        name: "web-search",
        arguments: '{"query":"hello"}',
      },
    });
  });

  test("serializes permission and timeout failures as structured tool results", () => {
    const denied = ToolResult.permissionDenied(
      "tool-2",
      "write-file",
      "policy denied"
    );
    const timedOut = ToolResult.timeout("tool-3", "bash", 1200);

    expect(denied.isError).toBe(true);
    expect(denied.serialize()).toContain('"type":"permissionDenied"');
    expect(timedOut.serialize()).toContain('"type":"timeout"');
    expect(timedOut.content).toContain("1200");
  });
});
