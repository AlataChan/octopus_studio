function loadAdapter() {
  return require("../../../../utils/agents/coding/codingModelAdapter");
}

function streamModel(chunks) {
  return {
    async *stream() {
      for (const chunk of chunks) yield chunk;
    },
  };
}

async function collect(adapter) {
  const events = [];
  for await (const event of adapter.stream({ messages: [] })) {
    events.push(event);
  }
  return events;
}

describe("coding model adapter M1 provider contract", () => {
  test("T-A1 DeepSeek OpenAI-compatible adapter parses tool_calls delta stream and fails closed for unsupported providers", async () => {
    const { CodingModelAdapter } = loadAdapter();
    const adapter = new CodingModelAdapter({
      provider: "deepseek",
      model: streamModel([
        {
          choices: [
            {
              delta: {
                content: "Inspecting.",
                reasoning_content: "Need file context.",
                tool_calls: [
                  {
                    index: 0,
                    id: "call-read",
                    type: "function",
                    function: {
                      name: "code_read",
                      arguments: "{\"pa",
                    },
                  },
                ],
              },
            },
          ],
        },
        {
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    function: {
                      arguments: "th\":\"src/index.js\"}",
                    },
                  },
                ],
              },
            },
          ],
          usage: { prompt_tokens: 3, completion_tokens: 4 },
        },
        { choices: [{ delta: {}, finish_reason: "tool_calls" }] },
      ]),
    });

    await expect(collect(adapter)).resolves.toEqual([
      { type: "text", text: "Inspecting." },
      { type: "thinking", text: "Need file context." },
      { type: "usage", usage: { prompt_tokens: 3, completion_tokens: 4 } },
      {
        type: "tool_use",
        id: "call-read",
        name: "code_read",
        input: { path: "src/index.js" },
      },
      {
        type: "stop_reason",
        stop_reason: "tool_use",
        provider_finish_reason: "tool_calls",
      },
    ]);

    const unsupported = new CodingModelAdapter({
      provider: "gemini",
      model: streamModel([]),
    });
    await expect(collect(unsupported)).rejects.toThrow(/not enabled.*tool calls/i);
  });
});
