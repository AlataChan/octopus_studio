const UnTooled = require("../../../../../../utils/agents/aibitat/providers/helpers/untooled");

describe("UnTooled: validFuncCall", () => {
  const untooled = new UnTooled();
  const validFunc = {
    "name": "brave-search-brave_web_search",
    "description": "Example function",
    "parameters": {
      "$schema": "http://json-schema.org/draft-07/schema#",
      "type": "object",
      "properties": {
        "query": {
          "type": "string",
          "description": "Search query (max 400 chars, 50 words)"
        },
        "count": {
          "type": "number",
          "description": "Number of results (1-20, default 10)",
          "default": 10
        },
        "offset": {
          "type": "number",
          "description": "Pagination offset (max 9, default 0)",
          "default": 0
        }
      },
      "required": [
        "query"
      ]
    }
  };

  it("Be truthy if the function call is valid and has all required arguments", () => {
    const result = untooled.validFuncCall(
      {
        name: validFunc.name,
        arguments: { query: "test" },
      }, [validFunc]);
    expect(result.valid).toBe(true);
    expect(result.reason).toBe(null);
  });

  it("Be falsey if the function call has no name or arguments", () => {
    const result = untooled.validFuncCall(
      { arguments: {} }, [validFunc]);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("Missing name or arguments in function call.");

    const result2 = untooled.validFuncCall(
      { name: validFunc.name }, [validFunc]);
    expect(result2.valid).toBe(false);
    expect(result2.reason).toBe("Missing name or arguments in function call.");
  });

  it("Be falsey if the function call references an unknown function definition", () => {
    const result = untooled.validFuncCall(
      {
        name: "unknown-function",
        arguments: {},
      }, [validFunc]);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("Function name does not exist.");
  });

  it("Be falsey if the function call is valid but missing any required arguments", () => {
    const result = untooled.validFuncCall(
      {
        name: validFunc.name,
        arguments: {},
      }, [validFunc]);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("Missing required argument: query");
  });

  it("Be falsey if the function call is valid but has an unknown argument defined (required or not)", () => {
    const result = untooled.validFuncCall(
      {
        name: validFunc.name,
        arguments: {
          query: "test",
          unknown: "unknown",
        },
      }, [validFunc]);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("Unknown argument: unknown provided but not in schema.");
  });

  it("includes prior function results when selecting the next function call", async () => {
    const messagesSeen = [];
    const result = await untooled.functionCall(
      [
        {
          role: "user",
          content:
            "Create deepseek-aibitat.txt with content hello-aibitat, then read it back.",
        },
        {
          role: "function",
          name: "code_write",
          content:
            '{"success":true,"path":"deepseek-aibitat.txt","sizeBytes":13}',
        },
      ],
      [
        {
          name: "code_read",
          description: "Read a file.",
          parameters: {
            type: "object",
            properties: {
              path: { type: "string" },
            },
            required: ["path"],
          },
        },
      ],
      async ({ messages }) => {
        messagesSeen.push(...messages);
        return JSON.stringify({
          name: "code_read",
          arguments: { path: "deepseek-aibitat.txt" },
        });
      }
    );

    expect(result.toolCall).toEqual({
      name: "code_read",
      arguments: { path: "deepseek-aibitat.txt" },
    });
    expect(messagesSeen.map((message) => message.content).join("\n")).toContain(
      '"path":"deepseek-aibitat.txt"'
    );
  });

  it("rebuilds thinking tool-call history with reasoning_content before function results", () => {
    const result = untooled.cleanMsgs([
      {
        role: "user",
        content: "Create a file.",
      },
      {
        role: "function",
        name: "code_write",
        content: '{"success":true}',
        originalFunctionCall: {
          name: "code_write",
          arguments: { path: "demo.txt" },
          reasoning_content: "I should write the requested file.",
        },
      },
    ]);

    expect(result).toEqual([
      {
        role: "user",
        content: "Create a file.",
      },
      expect.objectContaining({
        role: "assistant",
        reasoning_content: "I should write the requested file.",
      }),
      expect.objectContaining({
        role: "user",
        content: expect.stringContaining('{"success":true}'),
      }),
    ]);
    expect(result[1].content).toContain('"name":"code_write"');
    expect(result[1].content).not.toContain('{"success":true}');
  });
});
