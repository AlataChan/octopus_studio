const MCPCompatibilityLayer = require("../../../utils/MCP");

describe("MCPCompatibilityLayer descriptor conversion", () => {
  afterEach(() => {
    MCPCompatibilityLayer._instance = null;
  });

  test("convertServerToolsToDescriptors wraps MCP tools as ToolDescriptor instances", async () => {
    const layer = new MCPCompatibilityLayer();
    layer.mcps = {
      demo: {
        listTools: jest.fn(async () => ({
          tools: [
            {
              name: "fetch-data",
              description: "Fetch remote data",
              inputSchema: {
                type: "object",
                properties: { id: { type: "string" } },
              },
              annotations: {
                readOnlyHint: true,
                destructiveHint: false,
              },
            },
          ],
        })),
        callTool: jest.fn(async ({ name, arguments: args }) => ({
          name,
          args,
          ok: true,
        })),
      },
    };

    const descriptors = await layer.convertServerToolsToDescriptors("demo");

    expect(descriptors).toHaveLength(1);
    expect(descriptors[0]).toMatchObject({
      name: "demo-fetch-data",
      source: "mcp",
      isConcurrencySafe: false,
      isReadOnly: true,
      isDestructive: false,
      mcpInfo: {
        serverName: "demo",
        toolName: "fetch-data",
      },
    });
    await expect(descriptors[0].handler({ id: "123" })).resolves.toContain(
      '"ok":true'
    );
  });
});
