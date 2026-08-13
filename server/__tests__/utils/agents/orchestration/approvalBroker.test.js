const { createApprovalBroker, idempotencyKeyFor, stableStringify } = require("../../../../utils/agents/orchestration/approvalBroker");

describe("ApprovalBroker", () => {
  let store;
  let broker;

  beforeEach(() => {
    // In-memory store
    const created = [];
    store = {
      created,
      async create(args) {
        const c = {
          id: created.length + 1,
          status: "pending",
          ...args,
          planDetails: args.planDetails,
        };
        created.push(c);
        return c;
      },
      async findByIdempotencyKey(runId, key) {
        return created.find(
          (c) =>
            c.planDetails.idempotencyKey === key &&
            String(c.runId) === String(runId)
        );
      },
    };

    broker = createApprovalBroker({
      orchestrationRunId: "run-123",
      stepId: "step-1",
      workspaceId: "ws-1",
      userId: "user-1",
      threadId: "thread-1",
      store,
    });
  });

  it("should return suspend on first requestApproval and create confirmation", async () => {
    const onEventCapture = jest.fn();
    broker = createApprovalBroker({
      orchestrationRunId: "run-123",
      stepId: "step-1",
      workspaceId: "ws-1",
      userId: "user-1",
      threadId: "thread-1",
      onEvent: onEventCapture,
      store,
    });

    const result = await broker.requestApproval({
      toolName: "send_email",
      toolArgs: { to: "user@example.com", subject: "Test" },
      reason: "High cost operation",
      riskLevel: "high",
      childRunId: "child-run-456",
    });

    expect(result.decision).toBe("suspend");
    expect(result.confirmationId).toBeDefined();
    expect(store.created).toHaveLength(1);

    const created = store.created[0];
    expect(created.planDetails.kind).toBe("team_step");
    expect(created.planDetails.orchestrationRunId).toBe("run-123");
    expect(created.planDetails.stepId).toBe("step-1");
    expect(created.planDetails.childRunId).toBe("child-run-456");
    expect(created.planDetails.toolName).toBe("send_email");
    expect(created.planDetails.reason).toBe("High cost operation");
    expect(created.planDetails.idempotencyKey).toBeDefined();

    expect(onEventCapture).toHaveBeenCalledWith({
      type: "approvalRequested",
      confirmationId: result.confirmationId,
      childRunId: "child-run-456",
      stepId: "step-1",
      toolName: "send_email",
      riskLevel: "high",
    });
  });

  it("should return approved without creating new confirmation when rerun with approved status", async () => {
    const result1 = await broker.requestApproval({
      toolName: "delete_resource",
      toolArgs: { id: "res-123" },
      reason: "Cleanup",
      riskLevel: "high",
    });

    expect(result1.decision).toBe("suspend");
    expect(store.created).toHaveLength(1);

    // Simulate approval by changing status
    store.created[0].status = "approved";
    store.created[0].userResponse = "approved_by_admin";

    const result2 = await broker.requestApproval({
      toolName: "delete_resource",
      toolArgs: { id: "res-123" },
      reason: "Cleanup",
      riskLevel: "high",
    });

    expect(result2.decision).toBe("approved");
    expect(result2.userResponse).toBe("approved_by_admin");
    expect(store.created).toHaveLength(1); // No new confirmation created
  });

  it("should return rejected without creating new confirmation when rerun with rejected status", async () => {
    const result1 = await broker.requestApproval({
      toolName: "transfer_funds",
      toolArgs: { amount: 10000 },
      reason: "Fund transfer",
      riskLevel: "high",
    });

    expect(result1.decision).toBe("suspend");
    expect(store.created).toHaveLength(1);

    // Simulate rejection
    store.created[0].status = "rejected";
    store.created[0].userResponse = "rejected_by_compliance";

    const result2 = await broker.requestApproval({
      toolName: "transfer_funds",
      toolArgs: { amount: 10000 },
      reason: "Fund transfer",
      riskLevel: "high",
    });

    expect(result2.decision).toBe("rejected");
    expect(result2.userResponse).toBe("rejected_by_compliance");
    expect(store.created).toHaveLength(1);
  });

  it("should return suspend with same confirmationId when still pending", async () => {
    const result1 = await broker.requestApproval({
      toolName: "deploy",
      toolArgs: { env: "production" },
      reason: "Deploy to production",
      riskLevel: "high",
    });

    expect(result1.decision).toBe("suspend");
    const confirmationId1 = result1.confirmationId;
    expect(store.created).toHaveLength(1);

    // Rerun with same params while still pending
    const result2 = await broker.requestApproval({
      toolName: "deploy",
      toolArgs: { env: "production" },
      reason: "Deploy to production",
      riskLevel: "high",
    });

    expect(result2.decision).toBe("suspend");
    expect(result2.confirmationId).toBe(confirmationId1);
    expect(store.created).toHaveLength(1); // No new confirmation
  });

  it("should create new confirmation for different toolArgs", async () => {
    const result1 = await broker.requestApproval({
      toolName: "call_api",
      toolArgs: { endpoint: "/api/v1/users" },
      reason: "API call",
    });

    expect(result1.decision).toBe("suspend");
    expect(store.created).toHaveLength(1);

    const result2 = await broker.requestApproval({
      toolName: "call_api",
      toolArgs: { endpoint: "/api/v1/admin" },
      reason: "API call",
    });

    expect(result2.decision).toBe("suspend");
    expect(result2.confirmationId).not.toBe(result1.confirmationId);
    expect(store.created).toHaveLength(2);
  });

  it("stableStringify should produce consistent keys regardless of key order", () => {
    const obj1 = { a: 1, b: 2 };
    const obj2 = { b: 2, a: 1 };

    const key1 = stableStringify(obj1);
    const key2 = stableStringify(obj2);

    expect(key1).toBe(key2);
  });

  it("idempotencyKeyFor should produce consistent keys", () => {
    const params1 = {
      orchestrationRunId: "run-123",
      stepId: "step-1",
      toolName: "test_tool",
      toolArgs: { a: 1, b: 2 },
    };

    const params2 = {
      orchestrationRunId: "run-123",
      stepId: "step-1",
      toolName: "test_tool",
      toolArgs: { b: 2, a: 1 },
    };

    const key1 = idempotencyKeyFor(params1);
    const key2 = idempotencyKeyFor(params2);

    expect(key1).toBe(key2);
  });

  it("should work without onEvent callback", async () => {
    const brokerNoEvent = createApprovalBroker({
      orchestrationRunId: "run-123",
      stepId: "step-1",
      workspaceId: "ws-1",
      store,
    });

    const result = await brokerNoEvent.requestApproval({
      toolName: "test",
      toolArgs: {},
    });

    expect(result.decision).toBe("suspend");
    expect(store.created).toHaveLength(1);
  });

  it("should handle null and undefined userResponse", async () => {
    const result1 = await broker.requestApproval({
      toolName: "action",
      toolArgs: { id: "123" },
    });

    store.created[0].status = "approved";
    // userResponse is not set (undefined)

    const result2 = await broker.requestApproval({
      toolName: "action",
      toolArgs: { id: "123" },
    });

    expect(result2.decision).toBe("approved");
    expect(result2.userResponse).toBeNull();
  });

  it("should handle nested objects in toolArgs for stable key generation", () => {
    const params1 = {
      orchestrationRunId: "run-123",
      stepId: "step-1",
      toolName: "complex",
      toolArgs: {
        nested: { x: 1, y: 2 },
        list: [3, 2, 1],
      },
    };

    const params2 = {
      orchestrationRunId: "run-123",
      stepId: "step-1",
      toolName: "complex",
      toolArgs: {
        list: [3, 2, 1],
        nested: { y: 2, x: 1 },
      },
    };

    const key1 = idempotencyKeyFor(params1);
    const key2 = idempotencyKeyFor(params2);

    expect(key1).toBe(key2);
  });

  it("should pass default timeoutMinutes of 1440 to store.create when not specified", async () => {
    const result = await broker.requestApproval({
      toolName: "default_timeout_tool",
      toolArgs: {},
      reason: "test",
    });

    expect(result.decision).toBe("suspend");
    expect(store.created).toHaveLength(1);
    expect(store.created[0].timeoutMinutes).toBe(1440);
  });

  it("should pass overridden timeoutMinutes to store.create when specified in ctx", async () => {
    const customBroker = createApprovalBroker({
      orchestrationRunId: "run-timeout",
      stepId: "step-t",
      workspaceId: "ws-1",
      timeoutMinutes: 60,
      store,
    });

    const result = await customBroker.requestApproval({
      toolName: "custom_timeout_tool",
      toolArgs: {},
      reason: "test custom timeout",
    });

    expect(result.decision).toBe("suspend");
    expect(store.created).toHaveLength(1);
    expect(store.created[0].timeoutMinutes).toBe(60);
  });
});
