/**
 * MCP Hub broker tool tests (mcp_hub)
 *
 * These tests are written first (TDD) to define expected behavior:
 * - One broker tool for discovery/schema/call
 * - Policy: toolRef required + allowlist prefixes
 * - HITL vs FULL AUTHORIZE switch
 * - Writes audit artifacts bound to runId
 */

// NOTE: This module does not exist yet. This test is written first (TDD).
const { mcpHub } = require("../../../utils/agents/aibitat/plugins/mcp-hub");

describe("mcp_hub broker plugin", () => {
  let pluginInstance;
  let fakeClient;
  let deps;
  let mockAibitat;

  beforeEach(() => {
    pluginInstance = null;
    fakeClient = {
      toolsList: jest.fn(),
      toolsCall: jest.fn(),
      taskStatus: jest.fn(),
      taskResult: jest.fn(),
      fileGet: jest.fn(),
    };

    deps = {
      WorkflowPendingConfirmation: {
        create: jest.fn(),
        get: jest.fn(),
        expire: jest.fn(),
        approve: jest.fn(),
        reject: jest.fn(),
      },
      Run: {
        updateStatus: jest.fn(),
        STATUS: { BLOCKED: "blocked", RUNNING: "running", FAILED: "failed" },
        ERROR_CODE: { HITL_REJECTED: "hitl.rejected", HITL_EXPIRED: "hitl.expired" },
      },
      RunArtifact: {
        create: jest.fn(),
      },
      runEventEmitter: {
        emitForSession: jest.fn(),
      },
      SSE_EVENTS: {
        APPROVAL_REQUESTED: "approval.requested",
        RUN_BLOCKED: "run.blocked",
        RUN_UPDATED: "run.updated",
        RUN_COMPLETED: "run.completed",
        ARTIFACT_CREATED: "artifact.created",
      },
    };

    mockAibitat = {
      introspect: jest.fn(),
      handlerProps: {
        invocation: {
          workspace_id: 1,
          thread_id: 1,
          user_id: 1,
        },
        workspaceId: 1,
        threadSlug: "thread-abc",
        runId: "run-abc",
        authorizationMode: "hitl",
        log: jest.fn(),
      },
      function: jest.fn((config) => {
        pluginInstance = config;
        pluginInstance.super = mockAibitat;
      }),
    };
  });

  test("search returns tool candidates with toolRef", async () => {
    fakeClient.toolsList.mockResolvedValue({
      tools: [
        {
          toolId: "sga_rag.search",
          toolRef: "hubref_v1:sga_rag.search",
          title: "RAG Search",
          description: "semantic search",
          category: "rag",
          riskLevel: "read",
          version: "2026-02-15",
          inputSchema: { type: "object", properties: { query: { type: "string" } } },
        },
        {
          toolId: "yonyou.create_voucher",
          toolRef: "hubref_v1:yonyou.create_voucher",
          title: "Create voucher",
          description: "creates ERP voucher",
          category: "erp",
          riskLevel: "money",
          version: "2026-02-15",
          inputSchema: { type: "object", properties: { amount: { type: "number" } } },
        },
      ],
    });

    const plugin = mcpHub.plugin({
      hubClient: fakeClient,
      allowedToolPrefixes: ["sga_rag.", "yonyou."],
      riskLevelMaxWithoutApproval: "read",
      __deps: deps,
    });
    plugin.setup(mockAibitat);

    const raw = await pluginInstance.handler({ action: "search", query: "rag", limit: 5 });
    const parsed = JSON.parse(raw);
    expect(Array.isArray(parsed.tools)).toBe(true);
    expect(parsed.tools[0].toolRef).toBe("hubref_v1:sga_rag.search");
  });

  test("call requires toolRef", async () => {
    fakeClient.toolsList.mockResolvedValue({ tools: [] });

    const plugin = mcpHub.plugin({
      hubClient: fakeClient,
      allowedToolPrefixes: ["sga_rag."],
      __deps: deps,
    });
    plugin.setup(mockAibitat);

    const raw = await pluginInstance.handler({ action: "call", args: { query: "x" } });
    expect(String(raw)).toContain("toolRef");
  });

  test("call executes read tool without approvals in HITL mode", async () => {
    fakeClient.toolsList.mockResolvedValue({
      tools: [
        {
          toolId: "sga_rag.search",
          toolRef: "hubref_v1:sga_rag.search",
          riskLevel: "read",
          category: "rag",
          version: "2026-02-15",
          inputSchema: { type: "object", properties: { query: { type: "string" } } },
        },
      ],
    });
    fakeClient.toolsCall.mockResolvedValue({ ok: true, result: { hits: 1 } });
    deps.RunArtifact.create.mockResolvedValue({ id: "art-1" });

    const plugin = mcpHub.plugin({
      hubClient: fakeClient,
      allowedToolPrefixes: ["sga_rag."],
      riskLevelMaxWithoutApproval: "read",
      __deps: deps,
    });
    plugin.setup(mockAibitat);

    const raw = await pluginInstance.handler({
      action: "call",
      toolRef: "hubref_v1:sga_rag.search",
      args: { query: "hello" },
      idempotencyKey: "idem-1",
    });
    const parsed = JSON.parse(raw);
    expect(parsed.ok).toBe(true);
    expect(deps.WorkflowPendingConfirmation.create).not.toHaveBeenCalled();
    expect(fakeClient.toolsCall).toHaveBeenCalled();
  });

  test("call requires HITL approval for write tools when authMode=hitl", async () => {
    fakeClient.toolsList.mockResolvedValue({
      tools: [
        {
          toolId: "yonyou.create_voucher",
          toolRef: "hubref_v1:yonyou.create_voucher",
          riskLevel: "money",
          category: "erp",
          version: "2026-02-15",
          inputSchema: { type: "object", properties: { amount: { type: "number" } } },
        },
      ],
    });
    fakeClient.toolsCall.mockResolvedValue({ ok: true, result: { voucherId: "v-1" } });

    deps.WorkflowPendingConfirmation.create.mockResolvedValue({
      id: 123,
      planTitle: "approval",
      expiresAt: new Date().toISOString(),
    });
    deps.WorkflowPendingConfirmation.get.mockResolvedValue({ status: "approved", userResponse: "ok" });
    deps.Run.updateStatus.mockResolvedValue({ id: "run-abc", status: "running", updatedAt: new Date().toISOString() });
    deps.RunArtifact.create.mockResolvedValue({ id: "art-1" });

    const plugin = mcpHub.plugin({
      hubClient: fakeClient,
      allowedToolPrefixes: ["yonyou."],
      riskLevelMaxWithoutApproval: "read",
      __deps: deps,
    });
    plugin.setup(mockAibitat);

    const raw = await pluginInstance.handler({
      action: "call",
      toolRef: "hubref_v1:yonyou.create_voucher",
      args: { amount: 100 },
      idempotencyKey: "idem-2",
    });
    const parsed = JSON.parse(raw);
    expect(parsed.ok).toBe(true);
    expect(deps.WorkflowPendingConfirmation.create).toHaveBeenCalled();
    expect(fakeClient.toolsCall).toHaveBeenCalled();
  });

  test("FULL AUTHORIZE skips HITL even for risky tools", async () => {
    mockAibitat.handlerProps.authorizationMode = "full_authorize";

    fakeClient.toolsList.mockResolvedValue({
      tools: [
        {
          toolId: "yonyou.create_voucher",
          toolRef: "hubref_v1:yonyou.create_voucher",
          riskLevel: "money",
          category: "erp",
          version: "2026-02-15",
          inputSchema: { type: "object", properties: { amount: { type: "number" } } },
        },
      ],
    });
    fakeClient.toolsCall.mockResolvedValue({ ok: true, result: { voucherId: "v-2" } });
    deps.RunArtifact.create.mockResolvedValue({ id: "art-1" });

    const plugin = mcpHub.plugin({
      hubClient: fakeClient,
      allowedToolPrefixes: ["yonyou."],
      riskLevelMaxWithoutApproval: "read",
      __deps: deps,
    });
    plugin.setup(mockAibitat);

    const raw = await pluginInstance.handler({
      action: "call",
      toolRef: "hubref_v1:yonyou.create_voucher",
      args: { amount: 200 },
      idempotencyKey: "idem-3",
    });
    const parsed = JSON.parse(raw);
    expect(parsed.ok).toBe(true);
    expect(deps.WorkflowPendingConfirmation.create).not.toHaveBeenCalled();
    expect(fakeClient.toolsCall).toHaveBeenCalled();
  });
});

