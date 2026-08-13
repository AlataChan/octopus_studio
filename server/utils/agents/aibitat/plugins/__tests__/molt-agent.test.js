const { moltAgent } = require("../molt-agent");

jest.mock("../../../../molt/broker", () => ({
  getMoltBroker: () => ({
    status: async () => ({ success: true, state: "CONNECTED" }),
    listArchetypes: async () => ({
      success: true,
      archetypes: [{ id: "reviewer", label: "Reviewer" }],
    }),
    askAgent: async ({ message }) => ({
      success: true,
      answer: `reply:${message}`,
      conversationId: "conv-1",
    }),
  }),
}));

describe("molt-agent plugin", () => {
  function install() {
    const registered = {};
    const aibitat = {
      function: jest.fn((definition) => {
        registered.definition = definition;
      }),
      handlerProps: { log: jest.fn() },
    };

    moltAgent.plugin().setup(aibitat);
    return registered.definition;
  }

  test("registers a callable molt_agent function", () => {
    const definition = install();

    expect(definition.name).toBe("molt_agent");
    expect(definition.parameters.properties.action.enum).toEqual([
      "status",
      "list_archetypes",
      "ask_agent",
    ]);
  });

  test("ask_agent returns the broker answer", async () => {
    const definition = install();

    await expect(
      definition.handler({ action: "ask_agent", message: "hello" })
    ).resolves.toContain("reply:hello");
  });
});
