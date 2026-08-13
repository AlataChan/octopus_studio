function loadResponsesAdapter() {
  return require("../../../../utils/agents/coding/responsesAdapter");
}

describe("coding responses adapter M3 mapping", () => {
  test("T-RS1 maps coding events to Responses-compatible output items using ResponsesShell vocabulary", async () => {
    const { toResponsesStream } = loadResponsesAdapter();
    const events = [
      { sequence: 1, type: "coding.model.delta", payload: { text: "hello" } },
      {
        sequence: 2,
        type: "coding.tool.requested",
        payload: { id: "tool-1", name: "code_read", input: { path: "a.js" } },
      },
      {
        sequence: 3,
        type: "coding.tool.completed",
        payload: { id: "tool-1", output: { ok: true } },
      },
      {
        sequence: 4,
        type: "coding.tool.approval_required",
        payload: { approvalId: "approval-1", toolName: "code_shell" },
      },
      {
        sequence: 5,
        type: "coding.run.completed",
        payload: { finalAnswer: "done" },
      },
    ];

    const output = Array.from(toResponsesStream(events, { responseId: "resp_1" }));

    expect(output).toEqual([
      expect.objectContaining({ type: "response.output_text.delta", delta: "hello" }),
      expect.objectContaining({
        type: "response.output_item.added",
        item: expect.objectContaining({ type: "tool_call", name: "code_read" }),
      }),
      expect.objectContaining({
        type: "response.output_item.done",
        item: expect.objectContaining({ id: "tool-1", status: "completed" }),
      }),
      expect.objectContaining({
        type: "response.output_item.added",
        item: expect.objectContaining({ type: "approval_required", approval_id: "approval-1" }),
      }),
      expect.objectContaining({ type: "response.completed" }),
    ]);
  });

  test("T-RS2 adapter reuses the existing event log and does not construct a second loop", () => {
    const { toResponsesStream } = loadResponsesAdapter();
    const run = {
      session: { id: "existing-session" },
      events: [{ sequence: 1, type: "coding.run.completed", payload: { finalAnswer: "done" } }],
    };
    const LoopConstructor = jest.fn();

    const output = Array.from(
      toResponsesStream(run.events, {
        session: run.session,
        loopConstructor: LoopConstructor,
      })
    );

    expect(output).toEqual([expect.objectContaining({ type: "response.completed" })]);
    expect(LoopConstructor).not.toHaveBeenCalled();
  });
});
