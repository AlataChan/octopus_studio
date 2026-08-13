const ToolDescriptor = require("../../../../utils/agents/runtime/toolDescriptor");

describe("ToolDescriptor", () => {
  test("normalizes descriptor metadata and produces an AIbitat function config", () => {
    const handler = jest.fn(async () => "ok");
    const descriptor = new ToolDescriptor({
      name: "memory",
      description: "Look up memory",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
        },
      },
      handler,
      isConcurrencySafe: true,
      isReadOnly: true,
      source: "builtin",
      examples: [{ query: "hello" }],
    });

    const aibitat = { function: jest.fn() };
    const functionConfig = descriptor.toFunctionConfig(aibitat);

    expect(descriptor.name).toBe("memory");
    expect(descriptor.isReadOnly).toBe(true);
    expect(descriptor.isConcurrencySafe).toBe(true);
    expect(functionConfig).toMatchObject({
      name: "memory",
      description: "Look up memory",
      parameters: descriptor.parameters,
      handler,
      isConcurrencySafe: true,
      isReadOnly: true,
      isDestructive: false,
      examples: [{ query: "hello" }],
      super: aibitat,
    });
    expect(functionConfig.controller).toBeInstanceOf(AbortController);
  });
});
