const express = require("express");
const request = require("supertest");

const users = {
  member: { id: 1, role: "default", username: "member" },
  outsider: { id: 3, role: "default", username: "outsider" },
  admin: { id: 99, role: "admin", username: "admin" },
};

const mockWorkspaceGet = jest.fn();
const mockWorkspaceUserFindFirst = jest.fn();
const mockGet = jest.fn();
const mockChat = jest.fn();
const mockListAgents = jest.fn();
const mockLogEvent = jest.fn(async () => true);
let mockMoltAvailable = true;

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

jest.mock("../../models/workspace", () => ({
  Workspace: {
    get: (...args) => mockWorkspaceGet(...args),
  },
}));

jest.mock("../../models/workspaceMoltAgent", () => ({
  WorkspaceMoltAgent: {
    get: (...args) => mockGet(...args),
  },
}));

jest.mock("../../utils/prisma", () => ({
  workspace_users: {
    findFirst: (...args) => mockWorkspaceUserFindFirst(...args),
  },
  $disconnect: jest.fn(),
}));

jest.mock("../../utils/molt/healthMonitor", () => ({
  MoltHealthMonitor: {
    getInstance: () => ({
      isAvailable: () => mockMoltAvailable,
      status: () => ({
        state: mockMoltAvailable ? "CONNECTED" : "OFFLINE",
      }),
      client: {},
    }),
  },
}));

jest.mock("../../utils/molt/broker", () => ({
  getMoltBroker: () => ({
    listAgents: (...args) => mockListAgents(...args),
    chat: (...args) => mockChat(...args),
  }),
}));

jest.mock("../../utils/molt/kmBridge", () => ({
  createKmBridge: () => ({ status: jest.fn() }),
}));

jest.mock("../../utils/molt/filesBridge", () => ({
  uploadTextFileToMolt: jest.fn(),
}));

jest.mock("../../models/eventLogs", () => ({
  EventLogs: {
    logEvent: (...args) => mockLogEvent(...args),
  },
}));

const { moltEndpoints } = require("../../endpoints/molt");

const workspace = { id: 7, slug: "demo", name: "Demo" };
const attachedAgent = {
  id: 10,
  workspace_id: 7,
  molt_agent_id: "molt-agent-1",
  display_name: "Matrix Coordinator",
  enabled: true,
  metadata: null,
};

function buildApp() {
  const app = express();
  app.use(express.json());
  moltEndpoints(app);
  return app;
}

function membershipFor({ where }) {
  const isWorkspace = Number(where.workspace_id) === workspace.id;
  const isMember = Number(where.user_id) === users.member.id;
  return Promise.resolve(isWorkspace && isMember ? { id: 100 } : null);
}

function route(slug = "demo", agentId = "molt-agent-1") {
  return `/workspace/${slug}/molt-agents/${agentId}/chat`;
}

describe("workspace-scoped Molt chat endpoint", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMoltAvailable = true;
    mockWorkspaceGet.mockImplementation(({ slug }) =>
      slug === "missing" ? null : { ...workspace, slug }
    );
    mockWorkspaceUserFindFirst.mockImplementation(membershipFor);
    mockGet.mockResolvedValue(attachedAgent);
    mockLogEvent.mockResolvedValue(true);
    mockChat.mockResolvedValue({
      success: true,
      reply: "Molt reply",
      molt_thread_id: "thread-2",
      chatId: "chat-1",
    });
  });

  test("case 1: allows single-user mode chat", async () => {
    const response = await request(buildApp())
      .post(route())
      .send({ message: "hello", threadId: "thread-1" })
      .expect(200);

    expect(response.body).toEqual({
      success: true,
      reply: "Molt reply",
      molt_thread_id: "thread-2",
      chatId: "chat-1",
    });
    expect(mockChat).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: "molt-agent-1",
        message: "hello",
        threadId: "thread-1",
      })
    );
  });

  test("case 2: allows a multi-user member to chat in their workspace", async () => {
    await request(buildApp())
      .post(route())
      .set("x-test-mode", "multi")
      .set("x-test-user", "member")
      .send({ message: "hello" })
      .expect(200);

    expect(mockWorkspaceUserFindFirst).toHaveBeenCalledWith({
      where: { workspace_id: workspace.id, user_id: users.member.id },
      select: { id: true },
    });
    expect(mockChat).toHaveBeenCalledTimes(1);
  });

  test("case 3: denies a multi-user non-member with 403", async () => {
    const response = await request(buildApp())
      .post(route())
      .set("x-test-mode", "multi")
      .set("x-test-user", "outsider")
      .send({ message: "hello" })
      .expect(403);

    expect(response.body).toEqual({
      success: false,
      error: "Forbidden: not a workspace member",
    });
    expect(mockGet).not.toHaveBeenCalled();
    expect(mockChat).not.toHaveBeenCalled();
  });

  test("case 4: allows a multi-user system admin to chat in any workspace", async () => {
    await request(buildApp())
      .post(route())
      .set("x-test-mode", "multi")
      .set("x-test-user", "admin")
      .send({ message: "hello" })
      .expect(200);

    expect(mockWorkspaceUserFindFirst).not.toHaveBeenCalled();
    expect(mockChat).toHaveBeenCalledTimes(1);
  });

  test("case 5: workspace slug not found returns 404 before attachment lookup", async () => {
    await request(buildApp())
      .post(route("missing"))
      .send({ message: "hello" })
      .expect(404);

    expect(mockGet).not.toHaveBeenCalled();
    expect(mockChat).not.toHaveBeenCalled();
  });

  test("case 6: workspace exists but agent is not attached returns 404", async () => {
    mockGet.mockResolvedValueOnce(null);

    const response = await request(buildApp())
      .post(route())
      .send({ message: "hello" })
      .expect(404);

    expect(response.body).toEqual({
      success: false,
      error: "Molt agent attachment not found",
    });
    expect(mockChat).not.toHaveBeenCalled();
  });

  test("case 7: attached but disabled agent returns 403", async () => {
    mockGet.mockResolvedValueOnce({ ...attachedAgent, enabled: false });

    const response = await request(buildApp())
      .post(route())
      .send({ message: "hello" })
      .expect(403);

    expect(response.body).toEqual({
      success: false,
      error: "Molt agent attachment is disabled",
    });
    expect(mockChat).not.toHaveBeenCalled();
  });

  test("case 8: Molt offline returns 503 with molt_offline code", async () => {
    mockMoltAvailable = false;

    const response = await request(buildApp())
      .post(route())
      .send({ message: "hello" })
      .expect(503);

    expect(response.body).toEqual({
      success: false,
      error: "Molt is offline",
      code: "molt_offline",
    });
    expect(mockChat).not.toHaveBeenCalled();
  });

  test("case 9: missing message body returns 400", async () => {
    const response = await request(buildApp())
      .post(route())
      .send({ threadId: "thread-1" })
      .expect(400);

    expect(response.body).toEqual({
      success: false,
      error: "message is required",
      code: "MOLT_MESSAGE_REQUIRED",
    });
    expect(mockChat).not.toHaveBeenCalled();
  });

  test("case 10: stale Molt thread returns threadStale without throwing", async () => {
    mockChat.mockResolvedValueOnce({
      success: false,
      threadStale: true,
      code: "molt_thread_stale",
      error: "Molt thread not found",
      statusCode: 409,
    });

    const response = await request(buildApp())
      .post(route())
      .send({ message: "hello", threadId: "missing-thread" })
      .expect(409);

    expect(response.body).toEqual({
      success: false,
      threadStale: true,
      code: "molt_thread_stale",
      error: "Molt thread not found",
    });
  });

  test("case 11: missing workspace does not perform attachment or Molt calls", async () => {
    await request(buildApp())
      .post(route("missing"))
      .send({ message: "hello" })
      .expect(404);

    expect(mockGet).not.toHaveBeenCalled();
    expect(mockChat).not.toHaveBeenCalled();
  });

  test("case 12: unauthenticated requests return 401 before workspace lookup", async () => {
    await request(buildApp())
      .post(route())
      .set("x-test-auth", "none")
      .send({ message: "hello" })
      .expect(401);

    expect(mockWorkspaceGet).not.toHaveBeenCalled();
  });

  test("case 13: SQL injection-style slug is rejected before workspace lookup", async () => {
    const response = await request(buildApp())
      .post(route("bad%27%20OR%201%3D1"))
      .send({ message: "hello" })
      .expect(400);

    expect(response.body).toEqual({
      success: false,
      error: "Invalid workspace slug",
    });
    expect(mockWorkspaceGet).not.toHaveBeenCalled();
    expect(mockChat).not.toHaveBeenCalled();
  });
});
