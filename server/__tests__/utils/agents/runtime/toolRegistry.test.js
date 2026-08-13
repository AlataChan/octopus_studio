const ToolDescriptor = require("../../../../utils/agents/runtime/toolDescriptor");
const ToolRegistry = require("../../../../utils/agents/runtime/toolRegistry");

describe("ToolRegistry", () => {
  test("registers descriptors and syncs them to AIbitat", () => {
    const registry = new ToolRegistry();
    const handler = jest.fn(async () => "ok");
    const descriptor = new ToolDescriptor({
      name: "memory",
      description: "Memory lookup",
      parameters: {},
      handler,
      isReadOnly: true,
    });
    const aibitat = {
      function: jest.fn(),
      functions: new Map(),
    };

    registry.register(descriptor).syncToAibitat(aibitat);

    expect(registry.has("memory")).toBe(true);
    expect(registry.get("memory")).toBe(descriptor);
    expect(aibitat.function).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "memory",
        handler,
        isReadOnly: true,
      })
    );
  });

  test("imports existing AIbitat functions into the registry", () => {
    const registry = new ToolRegistry();
    const aibitat = {
      functions: new Map([
        [
          "web-search",
          {
            name: "web-search",
            description: "Search the web",
            parameters: { type: "object" },
            handler: jest.fn(),
            isConcurrencySafe: true,
            isReadOnly: true,
          },
        ],
      ]),
    };

    registry.importFromAibitat(aibitat);

    expect(registry.has("web-search")).toBe(true);
    expect(registry.get("web-search")).toMatchObject({
      name: "web-search",
      source: "builtin",
      isConcurrencySafe: true,
      isReadOnly: true,
    });
  });
});
