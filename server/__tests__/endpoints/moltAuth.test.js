const express = require("express");
const request = require("supertest");

const users = {
  member: { id: 1, role: "default", username: "member" },
  outsider: { id: 3, role: "default", username: "outsider" },
  admin: { id: 99, role: "admin", username: "admin" },
};

const mockStatus = jest.fn();
const mockIsAvailable = jest.fn();
const mockManualReconnect = jest.fn();
const mockCapabilitySnapshot = jest.fn();
const mockMatrixStatus = jest.fn();
const mockMatrixArchetypes = jest.fn();
const mockMatrixInit = jest.fn();
const mockListAgents = jest.fn();
const mockAskAgent = jest.fn();
const mockChat = jest.fn();
const mockStreamChat = jest.fn();
const mockKmStatus = jest.fn();
const mockUploadTextFileToMolt = jest.fn();
const mockGetValueOrFallback = jest.fn();
const mockWorkspaceGet = jest.fn();
const mockWorkspaceUserFindFirst = jest.fn();
const mockWorkspaceMoltAgentGet = jest.fn();
const mockLogEvent = jest.fn();

jest.mock("../../utils/middleware/validatedRequest", () => ({
  validatedRequest: (request, response, next) => {
    if (request.header("x-test-auth") === "none") {
      return response
        .status(401)
        .json({ success: false, error: "Unauthenticated" });
    }

    const multiUserMode = request.header("x-test-mode") === "multi";
    response.locals.multiUserMode = multiUserMode;
    if (multiUserMode) {
      response.locals.user = users[request.header("x-test-user") || "member"];
    }
    return next();
  },
}));

jest.mock("../../utils/molt/healthMonitor", () => ({
  MoltHealthMonitor: {
    getInstance: () => ({
      status: mockStatus,
      isAvailable: mockIsAvailable,
      manualReconnect: mockManualReconnect,
      client: {
        capabilitySnapshot: mockCapabilitySnapshot,
        matrixStatus: mockMatrixStatus,
        matrixArchetypes: mockMatrixArchetypes,
        matrixInit: mockMatrixInit,
      },
    }),
  },
}));

jest.mock("../../utils/molt/broker", () => ({
  getMoltBroker: () => ({
    listAgents: mockListAgents,
    askAgent: mockAskAgent,
    chat: mockChat,
    streamChat: mockStreamChat,
  }),
}));

jest.mock("../../utils/molt/kmBridge", () => ({
  createKmBridge: () => ({
    status: mockKmStatus,
  }),
}));

jest.mock("../../utils/molt/filesBridge", () => ({
  uploadTextFileToMolt: (...args) => mockUploadTextFileToMolt(...args),
}));

jest.mock("../../models/systemSettings", () => ({
  SystemSettings: {
    getValueOrFallback: (...args) => mockGetValueOrFallback(...args),
  },
}));

jest.mock("../../models/eventLogs", () => ({
  EventLogs: {
    logEvent: (...args) => mockLogEvent(...args),
  },
}));

jest.mock("../../models/workspace", () => ({
  Workspace: {
    get: (...args) => mockWorkspaceGet(...args),
  },
}));

jest.mock("../../models/workspaceMoltAgent", () => ({
  WorkspaceMoltAgent: {
    get: (...args) => mockWorkspaceMoltAgentGet(...args),
    where: jest.fn(),
    attach: jest.fn(),
    enable: jest.fn(),
    disable: jest.fn(),
    remove: jest.fn(),
  },
}));

jest.mock("../../models/workspaceMoltChat", () => ({
  WorkspaceMoltChat: {
    getActive: jest.fn(),
    upsert: jest.fn(),
    bumpLastUserMessage: jest.fn(),
    markStale: jest.fn(),
  },
}));

jest.mock("../../utils/prisma", () => ({
  workspace_users: {
    findFirst: (...args) => mockWorkspaceUserFindFirst(...args),
  },
  $disconnect: jest.fn(),
}));

const { moltEndpoints } = require("../../endpoints/molt");

const workspace = { id: 7, slug: "demo", name: "Demo" };
const attachedAgent = {
  id: 10,
  workspace_id: 7,
  molt_agent_id: "main",
  display_name: "Main Agent",
  enabled: true,
};

const gatedRoutes = [
  { method: "get", path: "/molt/status" },
  { method: "post", path: "/molt/reconnect" },
  { method: "post", path: "/molt/matrix/init" },
  { method: "get", path: "/molt/capability" },
  { method: "get", path: "/molt/mission-control/status" },
  { method: "get", path: "/molt/mission-control/archetypes" },
  { method: "get", path: "/molt/agents" },
  {
    method: "post",
    path: "/molt/agents/main/chat",
    body: { message: "hello" },
  },
  { method: "get", path: "/molt/km/status" },
  {
    method: "post",
    path: "/molt/files/upload-text",
    body: { agentId: "main", filename: "notes.md", content: "hello" },
  },
];

function buildApp() {
  const app = express();
  app.use(express.json());
  moltEndpoints(app);
  return app;
}

function issue(app, route) {
  const call = request(app)[route.method](route.path);
  return route.body ? call.send(route.body) : call;
}

function expectNoMarker(payload, marker) {
  expect(
    typeof payload === "string" ? payload : JSON.stringify(payload)
  ).not.toContain(marker);
}

function membershipFor({ where }) {
  const isWorkspace = Number(where.workspace_id) === workspace.id;
  const isMember = Number(where.user_id) === users.member.id;
  return Promise.resolve(isWorkspace && isMember ? { id: 100 } : null);
}

describe("Molt system endpoint authorization", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStatus.mockReturnValue({
      state: "CONNECTED",
      matrixState: "initialized",
      agentCount: 1,
    });
    mockIsAvailable.mockReturnValue(true);
    mockManualReconnect.mockResolvedValue({ state: "CONNECTED" });
    mockCapabilitySnapshot.mockResolvedValue({ catalog: { tools: [] } });
    mockMatrixStatus.mockResolvedValue({ state: "initialized" });
    mockMatrixArchetypes.mockResolvedValue({ data: [{ id: "pm" }] });
    mockMatrixInit.mockResolvedValue({ ok: true, initialized: true });
    mockListAgents.mockResolvedValue({
      success: true,
      agents: [{ id: "main", name: "Main Agent" }],
    });
    mockAskAgent.mockResolvedValue({ success: true, answer: "Molt answer" });
    mockChat.mockResolvedValue({ success: true, reply: "Workspace answer" });
    mockStreamChat.mockResolvedValue({
      chatId: "chat-1",
      molt_thread_id: "thread-1",
    });
    mockKmStatus.mockResolvedValue({
      success: true,
      km: { configured: false },
    });
    mockUploadTextFileToMolt.mockResolvedValue({
      success: true,
      upload: { upload_id: "upload-1" },
    });
    mockGetValueOrFallback.mockImplementation(async ({ label }, fallback) => {
      if (label === "MOLT_ADMIN_TOKEN") return "admin-token";
      if (label === "MOLT_DASHBOARD_URL") return "http://molt.local";
      return fallback;
    });
    mockWorkspaceGet.mockImplementation(({ slug }) =>
      slug === workspace.slug ? workspace : null
    );
    mockWorkspaceUserFindFirst.mockImplementation(membershipFor);
    mockWorkspaceMoltAgentGet.mockResolvedValue(attachedAgent);
    mockLogEvent.mockResolvedValue({ eventLog: { id: 1 }, message: null });
  });

  test.each(gatedRoutes)(
    "$method $path rejects multi-user non-admin users",
    async (route) => {
      const response = await issue(buildApp(), route)
        .set("x-test-mode", "multi")
        .set("x-test-user", "member")
        .expect(403);

      expect(response.body).toEqual({
        success: false,
        error: "Forbidden: system admin required",
      });
    }
  );

  test.each(gatedRoutes)(
    "$method $path allows multi-user system admins",
    async (route) => {
      const response = await issue(buildApp(), route)
        .set("x-test-mode", "multi")
        .set("x-test-user", "admin")
        .expect(200);

      expect(response.body.success).toBe(true);
    }
  );

  test.each(gatedRoutes)(
    "$method $path allows single-user mode",
    async (route) => {
      const response = await issue(buildApp(), route).expect(200);

      expect(response.body.success).toBe(true);
    }
  );

  test("unexpected system endpoint errors do not leak upstream messages", async () => {
    const marker = "UPSTREAM_SECRET_MARKER";
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    mockCapabilitySnapshot.mockRejectedValueOnce(new Error(marker));

    const response = await request(buildApp())
      .get("/molt/capability")
      .set("x-test-mode", "multi")
      .set("x-test-user", "admin")
      .expect(500);

    expect(JSON.stringify(response.body)).not.toContain(marker);
    expect(response.body).toEqual({
      success: false,
      error: "Unable to read Molt capability",
      code: "MOLT_CAPABILITY_ERROR",
    });
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  test("matrix init upstream failures do not leak upstream error messages", async () => {
    const marker = "UPSTREAM_SECRET_MARKER";
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    mockMatrixInit.mockResolvedValueOnce({
      ok: false,
      statusCode: 401,
      error: marker,
      body: { marker },
    });

    const response = await request(buildApp())
      .post("/molt/matrix/init")
      .set("x-test-mode", "multi")
      .set("x-test-user", "admin")
      .expect(401);

    expectNoMarker(response.body, marker);
    expect(response.body).toMatchObject({
      success: false,
      error: "Molt Matrix init unauthorized",
      code: "MOLT_MATRIX_INIT_UNAUTHORIZED",
    });
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  test("capability upstream failure bodies do not leak to clients", async () => {
    const marker = "UPSTREAM_SECRET_MARKER";
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    mockCapabilitySnapshot.mockResolvedValueOnce({
      ok: false,
      statusCode: 502,
      error: marker,
      code: "UPSTREAM_CODE",
      body: { marker },
    });

    const response = await request(buildApp())
      .get("/molt/capability")
      .set("x-test-mode", "multi")
      .set("x-test-user", "admin")
      .expect(502);

    expectNoMarker(response.body, marker);
    expect(response.body).toEqual({
      success: false,
      error: "Unable to read Molt capability",
      code: "MOLT_CAPABILITY_ERROR",
    });
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  test("broker upstream failure details do not leak from system agents routes", async () => {
    const marker = "UPSTREAM_SECRET_MARKER";
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    mockListAgents.mockResolvedValueOnce({
      success: false,
      code: "UPSTREAM_CODE",
      error: marker,
      statusCode: 503,
      details: { marker },
    });

    const listResponse = await request(buildApp())
      .get("/molt/agents")
      .set("x-test-mode", "multi")
      .set("x-test-user", "admin")
      .expect(503);

    expectNoMarker(listResponse.body, marker);
    expect(listResponse.body).toEqual({
      success: false,
      error: "Unable to list Molt agents",
      code: "MOLT_AGENTS_ERROR",
    });

    mockAskAgent.mockResolvedValueOnce({
      success: false,
      code: "UPSTREAM_CODE",
      error: marker,
      statusCode: 503,
      details: { marker },
    });

    const chatResponse = await request(buildApp())
      .post("/molt/agents/main/chat")
      .set("x-test-mode", "multi")
      .set("x-test-user", "admin")
      .send({ message: "hello" })
      .expect(503);

    expectNoMarker(chatResponse.body, marker);
    expect(chatResponse.body).toEqual({
      success: false,
      error: "Unable to chat with Molt agent",
      code: "MOLT_AGENT_CHAT_ERROR",
    });
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  test("km bridge failures do not leak upstream error messages", async () => {
    const marker = "UPSTREAM_SECRET_MARKER";
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    mockKmStatus.mockResolvedValueOnce({
      success: false,
      code: "UPSTREAM_CODE",
      error: marker,
      statusCode: 503,
    });

    const response = await request(buildApp())
      .get("/molt/km/status")
      .set("x-test-mode", "multi")
      .set("x-test-user", "admin")
      .expect(503);

    expectNoMarker(response.body, marker);
    expect(response.body).toEqual({
      success: false,
      error: "Unable to read Molt KM status",
      code: "MOLT_KM_STATUS_ERROR",
    });
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  test("file upload failures do not leak upstream error messages", async () => {
    const marker = "UPSTREAM_SECRET_MARKER";
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    mockUploadTextFileToMolt.mockResolvedValueOnce({
      success: false,
      code: "MOLT_FILE_UPLOAD_ERROR",
      error: marker,
      statusCode: 502,
      details: { marker },
    });

    const response = await request(buildApp())
      .post("/molt/files/upload-text")
      .set("x-test-mode", "multi")
      .set("x-test-user", "admin")
      .send({ agentId: "main", filename: "notes.md", content: "hello" })
      .expect(502);

    expectNoMarker(response.body, marker);
    expect(response.body).toEqual({
      success: false,
      error: "Unable to upload text to Molt",
      code: "MOLT_FILE_UPLOAD_ERROR",
    });
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  test("workspace chat broker failures do not leak upstream error messages", async () => {
    const marker = "UPSTREAM_SECRET_MARKER";
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    mockChat.mockResolvedValueOnce({
      success: false,
      code: "UPSTREAM_CODE",
      error: marker,
      statusCode: 503,
      details: { marker },
    });

    const response = await request(buildApp())
      .post("/workspace/demo/molt-agents/main/chat")
      .set("x-test-mode", "multi")
      .set("x-test-user", "member")
      .send({ message: "hello" })
      .expect(503);

    expectNoMarker(response.body, marker);
    expect(response.body).toEqual({
      success: false,
      error: "Unable to chat with workspace Molt agent",
      code: "MOLT_WORKSPACE_CHAT_ERROR",
    });
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  test("workspace stream errors do not leak upstream error messages", async () => {
    const marker = "UPSTREAM_SECRET_MARKER";
    mockStreamChat.mockRejectedValueOnce(new Error(marker));

    const response = await request(buildApp())
      .post("/workspace/demo/molt-agents/main/chat/stream")
      .set("x-test-mode", "multi")
      .set("x-test-user", "member")
      .send({ message: "hello", scopeKey: "scope-1" })
      .expect(200);

    expectNoMarker(response.text, marker);
    expect(response.text).toContain("MOLT_STREAM_ERROR");
    expect(response.text).toContain("Molt stream failed");
  });

  test("unexpected workspace-scoped errors do not leak upstream messages", async () => {
    const marker = "WORKSPACE_SECRET_MARKER";
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    mockWorkspaceMoltAgentGet.mockRejectedValueOnce(new Error(marker));

    const response = await request(buildApp())
      .post("/workspace/demo/molt-agents/main/chat")
      .set("x-test-mode", "multi")
      .set("x-test-user", "member")
      .send({ message: "hello" })
      .expect(500);

    expect(JSON.stringify(response.body)).not.toContain(marker);
    expect(response.body).toEqual({
      success: false,
      error: "Unable to chat with workspace Molt agent",
      code: "MOLT_WORKSPACE_CHAT_ERROR",
    });
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  test("workspace-scoped chat still rejects multi-user non-members", async () => {
    const response = await request(buildApp())
      .post("/workspace/demo/molt-agents/main/chat")
      .set("x-test-mode", "multi")
      .set("x-test-user", "outsider")
      .send({ message: "hello" })
      .expect(403);

    expect(response.body).toEqual({
      success: false,
      error: "Forbidden: not a workspace member",
    });
    expect(mockWorkspaceMoltAgentGet).not.toHaveBeenCalled();
    expect(mockChat).not.toHaveBeenCalled();
  });
});
