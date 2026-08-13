const express = require("express");
const request = require("supertest");

let mockUser = { id: 42, role: "admin", username: "admin" };
let mockMultiUserMode = false;
const mockLogEvent = jest.fn(async () => true);
const mockManualReconnect = jest.fn(async () => ({ state: "CONNECTED" }));
const mockChat = jest.fn(async () => ({ success: false, error: "boom" }));
const mockMatrixInit = jest.fn(async () => ({ ok: true }));
const mockAssertWorkspaceAccess = jest.fn(async () => ({ ok: true }));
const mockRequireWorkspaceAdmin = jest.fn(async () => ({ ok: true }));
const mockRequireSystemAdmin = jest.fn(async () => ({ ok: true }));
const mockGetSettingValue = jest.fn();
const mockWorkspaceGet = jest.fn();
const mockAttachmentGet = jest.fn();
const mockAttachmentWhere = jest.fn();
const mockAttach = jest.fn(async (args) => ({
  id: 1,
  workspace_id: args.workspaceId,
  molt_agent_id: args.moltAgentId,
  enabled: true,
}));
const mockRemove = jest.fn(async () => true);

jest.mock("../../utils/middleware/validatedRequest", () => ({
  validatedRequest: (request, response, next) => {
    if (!mockUser) return response.status(401).json({ success: false });
    request.user = mockUser;
    response.locals.user = mockUser;
    response.locals.multiUserMode = mockMultiUserMode;
    next();
  },
}));

jest.mock("../../models/eventLogs", () => ({
  EventLogs: { logEvent: (...args) => mockLogEvent(...args) },
}));

jest.mock("../../models/systemSettings", () => ({
  SystemSettings: {
    getValueOrFallback: (...args) => mockGetSettingValue(...args),
  },
}));

jest.mock("../../models/workspace", () => ({
  Workspace: {
    get: (...args) => mockWorkspaceGet(...args),
  },
}));

jest.mock("../../utils/access/assertWorkspaceResourceAccess", () => ({
  assertWorkspaceResourceAccess: (...args) => mockAssertWorkspaceAccess(...args),
}));

jest.mock("../../utils/access/requireWorkspaceAdmin", () => ({
  requireWorkspaceAdmin: (...args) => mockRequireWorkspaceAdmin(...args),
}));

jest.mock("../../utils/access/requireSystemAdmin", () => ({
  requireSystemAdmin: (...args) => mockRequireSystemAdmin(...args),
}));

jest.mock("../../models/workspaceMoltAgent", () => ({
  WorkspaceMoltAgent: {
    attach: (...args) => mockAttach(...args),
    remove: (...args) => mockRemove(...args),
    get: (...args) => mockAttachmentGet(...args),
    where: (...args) => mockAttachmentWhere(...args),
  },
}));

jest.mock("../../models/workspaceMoltChat", () => ({
  WorkspaceMoltChat: {
    getActive: jest.fn(async () => null),
    upsert: jest.fn(),
    bumpLastUserMessage: jest.fn(),
    markStale: jest.fn(),
  },
}));

jest.mock("../../utils/molt/healthMonitor", () => ({
  MoltHealthMonitor: {
    getInstance: () => ({
      isAvailable: () => true,
      status: () => ({ state: "CONNECTED" }),
      manualReconnect: mockManualReconnect,
      client: {
        matrixInit: mockMatrixInit,
        getToken: jest.fn(async () => "main-token-secret"),
      },
    }),
  },
}));

jest.mock("../../utils/molt/broker", () => ({
  getMoltBroker: () => ({
    listAgents: jest.fn(async () => ({ success: true, agents: [{ id: "agent-1" }] })),
    chat: (...args) => mockChat(...args),
    askAgent: jest.fn(),
    streamChat: jest.fn(),
  }),
}));

jest.mock("../../utils/molt/kmBridge", () => ({
  createKmBridge: () => ({ status: jest.fn(async () => ({ success: true })) }),
}));

jest.mock("../../utils/molt/filesBridge", () => ({
  uploadTextFileToMolt: jest.fn(async () => ({ success: true })),
}));

function app() {
  const instance = express();
  instance.use(express.json());
  const { moltEndpoints } = require("../../endpoints/molt");
  moltEndpoints(instance);
  return instance;
}

describe("Molt audit log events", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = { id: 42, role: "admin", username: "admin" };
    mockMultiUserMode = false;
    mockLogEvent.mockResolvedValue(true);
    mockManualReconnect.mockResolvedValue({ state: "CONNECTED" });
    mockMatrixInit.mockResolvedValue({ ok: true });
    mockChat.mockResolvedValue({ success: false, error: "boom" });
    mockGetSettingValue.mockImplementation(async ({ label }, fallback) => {
      if (label === "MOLT_API_TOKEN") return "main-token-secret";
      if (label === "MOLT_ADMIN_TOKEN") return "admin-token-secret";
      return fallback;
    });
    mockWorkspaceGet.mockResolvedValue({ id: 7, slug: "demo" });
    mockAttachmentGet.mockResolvedValue({
      id: 1,
      workspace_id: 7,
      molt_agent_id: "agent-1",
      enabled: true,
    });
    mockAttachmentWhere.mockResolvedValue([]);
    mockAssertWorkspaceAccess.mockResolvedValue({ ok: true });
    mockRequireWorkspaceAdmin.mockResolvedValue({ ok: true });
    mockRequireSystemAdmin.mockResolvedValue({ ok: true });
    mockAttach.mockImplementation(async (args) => ({
      id: 1,
      workspace_id: args.workspaceId,
      molt_agent_id: args.moltAgentId,
      enabled: true,
    }));
    mockRemove.mockResolvedValue(true);
  });

  test("molt.attach includes workspace, agent, and user metadata", async () => {
    const response = await request(app())
      .post("/workspace/demo/molt-agents")
      .send({ moltAgentId: "agent-1" });
    expect(response.status).toBe(200);

    expect(mockLogEvent).toHaveBeenCalledWith(
      "molt.attach",
      expect.objectContaining({
        user_id: 42,
        workspace_id: 7,
        molt_agent_id: "agent-1",
      }),
      42
    );
  });

  test("molt.detach includes workspace, agent, and user metadata", async () => {
    await request(app())
      .delete("/workspace/demo/molt-agents/agent-1")
      .expect(200);

    expect(mockLogEvent).toHaveBeenCalledWith(
      "molt.detach",
      expect.objectContaining({
        user_id: 42,
        workspace_id: 7,
        molt_agent_id: "agent-1",
      }),
      42
    );
  });

  test("molt.matrix_init audit metadata does not contain raw token values", async () => {
    await request(app()).post("/molt/matrix/init").expect(200);

    const [, metadata] = mockLogEvent.mock.calls.find(
      ([event]) => event === "molt.matrix_init"
    );
    expect(JSON.stringify(metadata)).not.toContain("admin-token-secret");
    expect(JSON.stringify(metadata)).not.toContain("main-token-secret");
    expect(metadata.userId).toBe(42);
  });

  test("molt.reconnect audit event is written", async () => {
    await request(app()).post("/molt/reconnect").expect(200);

    expect(mockLogEvent).toHaveBeenCalledWith(
      "molt.reconnect",
      expect.objectContaining({
        user_id: 42,
        state: "CONNECTED",
      }),
      42
    );
  });

  test("molt.chat_failed is written when workspace chat broker fails", async () => {
    await request(app())
      .post("/workspace/demo/molt-agents/agent-1/chat")
      .send({ message: "hello" })
      .expect(503);

    expect(mockLogEvent).toHaveBeenCalledWith(
      "molt.chat_failed",
      expect.objectContaining({
        user_id: 42,
        workspace_id: 7,
        molt_agent_id: "agent-1",
        error: "boom",
      }),
      42
    );
  });

  test("audit metadata never includes token fields in clear text", async () => {
    await request(app()).post("/molt/matrix/init").expect(200);
    await request(app()).post("/molt/reconnect").expect(200);

    const serialized = JSON.stringify(mockLogEvent.mock.calls);
    expect(serialized).not.toContain("admin-token-secret");
    expect(serialized).not.toContain("main-token-secret");
  });
});
