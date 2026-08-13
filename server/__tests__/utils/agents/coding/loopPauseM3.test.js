function loadFakeModel() {
  return require("../../../../utils/agents/coding/__fixtures__/fakeModel");
}

function loadAdapter() {
  return require("../../../../utils/agents/coding/codingModelAdapter");
}

function loadLoop() {
  return require("../../../../utils/agents/coding/codingAgentLoop");
}

function createCountingModel(turns) {
  const { createFakeModel } = loadFakeModel();
  const model = createFakeModel(turns);
  let calls = 0;
  return {
    get calls() {
      return calls;
    },
    async *stream(params) {
      calls += 1;
      yield* model.stream(params);
    },
  };
}

function makeLoop({ toolRuntime, model }) {
  const { CodingModelAdapter } = loadAdapter();
  const { CodingAgentLoop } = loadLoop();
  return new CodingAgentLoop({
    modelAdapter: new CodingModelAdapter({ model }),
    toolRuntime,
    maxTurns: 5,
  });
}

describe("coding agent loop M3 pause and resume", () => {
  test("T-LP1 pauses on approval_required, resumes approved or denied, and cancels while awaiting", async () => {
    const turns = [
      [
        {
          type: "tool_use",
          id: "shell-1",
          name: "code_shell",
          input: { command: "npm install" },
        },
        { type: "stop_reason", stop_reason: "tool_use" },
      ],
      [
        { type: "text", text: "continued after approval" },
        { type: "stop_reason", stop_reason: "end_turn" },
      ],
    ];

    const approvedModel = createCountingModel(turns);
    const approvedLoop = makeLoop({
      model: approvedModel,
      toolRuntime: {
        executeToolUse: async () => ({
          type: "tool_result",
          tool_use_id: "shell-1",
          content: JSON.stringify({
            status: "approval_required",
            approvalId: "approval-1",
          }),
          is_error: true,
          reason: "approval_required",
        }),
        resumeApprovedToolUse: async (approvalId, approval) => ({
          type: "tool_result",
          tool_use_id: "shell-1",
          content: JSON.stringify({ approvalId, approved: approval.approved }),
          is_error: false,
        }),
      },
    });

    const paused = await approvedLoop.run("fix");
    expect(paused.status).toBe("awaiting_approval");
    expect(paused.pendingApproval).toMatchObject({ approvalId: "approval-1" });
    expect(paused.messages.filter((message) => message.type === "tool_result")).toHaveLength(0);
    expect(approvedModel.calls).toBe(1);

    const completed = await approvedLoop.resume({
      approvalId: "approval-1",
      approved: true,
    });
    expect(completed.status).toBe("completed");
    expect(completed.finalText).toContain("continued after approval");
    expect(approvedModel.calls).toBe(2);
    expect(completed.messages.filter((message) => message.type === "tool_result")).toHaveLength(1);

    const deniedModel = createCountingModel(turns);
    const deniedLoop = makeLoop({
      model: deniedModel,
      toolRuntime: {
        executeToolUse: async () => ({
          type: "tool_result",
          tool_use_id: "shell-1",
          content: JSON.stringify({
            status: "approval_required",
            approvalId: "approval-denied",
          }),
          is_error: true,
          reason: "approval_required",
        }),
        resumeApprovedToolUse: async () => ({
          type: "tool_result",
          tool_use_id: "shell-1",
          content: JSON.stringify({ status: "approval_denied" }),
          is_error: true,
          reason: "approval_denied",
        }),
      },
    });
    await deniedLoop.run("fix");
    const denied = await deniedLoop.resume({
      approvalId: "approval-denied",
      approved: false,
    });
    expect(denied.status).toBe("completed");
    expect(denied.messages.find((message) => message.tool_use_id === "shell-1")).toMatchObject({
      is_error: true,
      reason: "approval_denied",
    });

    const cancelledModel = createCountingModel(turns);
    const cancelledLoop = makeLoop({
      model: cancelledModel,
      toolRuntime: {
        executeToolUse: async () => ({
          type: "tool_result",
          tool_use_id: "shell-1",
          content: JSON.stringify({
            status: "approval_required",
            approvalId: "approval-cancel",
          }),
          is_error: true,
          reason: "approval_required",
        }),
      },
    });
    await cancelledLoop.run("fix");
    const cancelled = cancelledLoop.cancelAwaiting();
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.messages.filter((message) => message.type === "tool_result")).toEqual([
      expect.objectContaining({
        tool_use_id: "shell-1",
        is_error: true,
        reason: "cancelled",
      }),
    ]);
    expect(cancelledModel.calls).toBe(1);
  });
});
