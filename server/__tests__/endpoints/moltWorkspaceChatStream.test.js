const express = require("express");
const request = require("supertest");

const users = {
  member: { id: 1, role: "default", username: "member" },
  outsider: { id: 3, role: "default", username: "outsider" },
  admin: { id: 99, role: "admin", username: "admin" },
};

const mockWorkspaceGet = jest.fn();
const mockWorkspaceUserFindFirst = jest.fn();
const mockAttachmentGet = jest.fn();
const mockStreamChat = jest.fn();
const mockChatPointerGetActive = jest.fn();
const mockChatPointerUpsert = jest.fn();
const mockChatPointerBump = jest.fn();
const mockChatPointerMarkStale = jest.fn();
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
    get: (...args) => mockAttachmentGet(...args),
  },
}));

jest.mock("../../models/workspaceMoltChat", () => ({
  WorkspaceMoltChat: {
    getActive: (...args) => mockChatPointerGetActive(...args),
    upsert: (...args) => mockChatPointerUpsert(...args),
    bumpLastUserMessage: (...args) => mockChatPointerBump(...args),
    markStale: (...args) => mockChatPointerMarkStale(...args),
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
      status: () => ({ state: mockMoltAvailable ? "CONNECTED" : "OFFLINE" }),
      client: {},
    }),
  },
}));

jest.mock("../../utils/molt/broker", () => ({
  getMoltBroker: () => ({
    listAgents: jest.fn(),
    streamChat: (...args) => mockStreamChat(...args),
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
  enabled: true,
};
const chatPointer = {
  id: 55,
  workspace_id: 7,
  molt_agent_id: "molt-agent-1",
  scope_key: "user:1",
  molt_thread_id: "thread-existing",
  status: "active",
};

function buildApp() {
  const app = express();
  app.use(express.json({ limit: "2mb" }));
  moltEndpoints(app);
  return app;
}

function membershipFor({ where }) {
  const isWorkspace = Number(where.workspace_id) === workspace.id;
  const isMember = Number(where.user_id) === users.member.id;
  return Promise.resolve(isWorkspace && isMember ? { id: 100 } : null);
}

function route(slug = "demo", agentId = "molt-agent-1") {
  return `/workspace/${slug}/molt-agents/${agentId}/chat/stream`;
}

function parseSse(text) {
  return String(text || "")
    .split("\n\n")
    .filter(Boolean)
    .map((frame) => {
      const lines = frame.split("\n");
      const event = lines
        .find((line) => line.startsWith("event:"))
        ?.replace("event:", "")
        .trim();
      const data = lines
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.replace("data:", "").trim())
        .join("\n");
      return { event, data: JSON.parse(data) };
    });
}

describe("workspace-scoped Molt chat stream endpoint", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMoltAvailable = true;
    mockWorkspaceGet.mockImplementation(({ slug }) =>
      slug === "missing" ? null : { ...workspace, slug }
    );
    mockWorkspaceUserFindFirst.mockImplementation(membershipFor);
    mockAttachmentGet.mockResolvedValue(attachedAgent);
    mockLogEvent.mockResolvedValue(true);
    mockChatPointerGetActive.mockResolvedValue(null);
    mockChatPointerUpsert.mockResolvedValue({ ...chatPointer, id: 56 });
    mockChatPointerBump.mockResolvedValue({ ...chatPointer, id: 56 });
    mockChatPointerMarkStale.mockResolvedValue({
      ...chatPointer,
      status: "stale",
    });
    mockStreamChat.mockImplementation(async ({ onChunk }) => {
      onChunk("hello");
      onChunk(" world");
      return { chatId: "chat-1", molt_thread_id: "thread-2" };
    });
  });

  test("case 1: allows single-user stream chat", async () => {
    const response = await request(buildApp())
      .post(route())
      .send({ message: "hello", scopeKey: "workspace-thread:default" })
      .expect(200);

    expect(response.headers["content-type"]).toContain("text/event-stream");
    expect(parseSse(response.text).map((frame) => frame.event)).toEqual([
      "chunk",
      "chunk",
      "done",
    ]);
  });

  test("case 2: allows a multi-user member to stream in their workspace", async () => {
    await request(buildApp())
      .post(route())
      .set("x-test-mode", "multi")
      .set("x-test-user", "member")
      .send({ message: "hello", scopeKey: "user:1" })
      .expect(200);

    expect(mockWorkspaceUserFindFirst).toHaveBeenCalledWith({
      where: { workspace_id: workspace.id, user_id: users.member.id },
      select: { id: true },
    });
    expect(mockStreamChat).toHaveBeenCalledTimes(1);
  });

  test("case 3: denies a multi-user non-member before attachment lookup", async () => {
    await request(buildApp())
      .post(route())
      .set("x-test-mode", "multi")
      .set("x-test-user", "outsider")
      .send({ message: "hello", scopeKey: "user:3" })
      .expect(403);

    expect(mockAttachmentGet).not.toHaveBeenCalled();
    expect(mockStreamChat).not.toHaveBeenCalled();
  });

  test("case 4: allows a multi-user system admin", async () => {
    await request(buildApp())
      .post(route())
      .set("x-test-mode", "multi")
      .set("x-test-user", "admin")
      .send({ message: "hello", scopeKey: "console:99" })
      .expect(200);

    expect(mockWorkspaceUserFindFirst).not.toHaveBeenCalled();
  });

  test("case 5: missing workspace returns 404 before attachment lookup", async () => {
    await request(buildApp())
      .post(route("missing"))
      .send({ message: "hello", scopeKey: "user:1" })
      .expect(404);

    expect(mockAttachmentGet).not.toHaveBeenCalled();
    expect(mockStreamChat).not.toHaveBeenCalled();
  });

  test("case 6: unattached agent returns 404", async () => {
    mockAttachmentGet.mockResolvedValueOnce(null);

    await request(buildApp())
      .post(route())
      .send({ message: "hello", scopeKey: "user:1" })
      .expect(404);

    expect(mockStreamChat).not.toHaveBeenCalled();
  });

  test("case 7: disabled attachment returns 403", async () => {
    mockAttachmentGet.mockResolvedValueOnce({ ...attachedAgent, enabled: false });

    await request(buildApp())
      .post(route())
      .send({ message: "hello", scopeKey: "user:1" })
      .expect(403);

    expect(mockStreamChat).not.toHaveBeenCalled();
  });

  test("case 8: Molt offline returns 503 before stream starts", async () => {
    mockMoltAvailable = false;

    const response = await request(buildApp())
      .post(route())
      .send({ message: "hello", scopeKey: "user:1" })
      .expect(503);

    expect(response.body).toEqual({
      success: false,
      error: "Molt is offline",
      code: "molt_offline",
    });
    expect(mockStreamChat).not.toHaveBeenCalled();
  });

  test("case 9: unauthenticated request returns 401 before workspace lookup", async () => {
    await request(buildApp())
      .post(route())
      .set("x-test-auth", "none")
      .send({ message: "hello", scopeKey: "user:1" })
      .expect(401);

    expect(mockWorkspaceGet).not.toHaveBeenCalled();
  });

  test("case 10: SQL injection-style slug is rejected before workspace lookup", async () => {
    await request(buildApp())
      .post(route("bad%27%20OR%201%3D1"))
      .send({ message: "hello", scopeKey: "user:1" })
      .expect(400);

    expect(mockWorkspaceGet).not.toHaveBeenCalled();
  });

  test("case 11: successful stream emits chunk frames and a done frame", async () => {
    const response = await request(buildApp())
      .post(route())
      .send({ message: "hello", scopeKey: "user:1" })
      .expect(200);

    expect(parseSse(response.text)).toEqual([
      { event: "chunk", data: { text: "hello", seq: 1 } },
      { event: "chunk", data: { text: " world", seq: 2 } },
      {
        event: "done",
        data: { chatId: "chat-1", molt_thread_id: "thread-2" },
      },
    ]);
  });

  test("case 12: chunk seq values increase monotonically", async () => {
    mockStreamChat.mockImplementationOnce(async ({ onChunk }) => {
      onChunk("a");
      onChunk("b");
      onChunk("c");
      return { chatId: "chat-1", molt_thread_id: "thread-2" };
    });

    const response = await request(buildApp())
      .post(route())
      .send({ message: "hello", scopeKey: "user:1" })
      .expect(200);

    expect(
      parseSse(response.text)
        .filter((frame) => frame.event === "chunk")
        .map((frame) => frame.data.seq)
    ).toEqual([1, 2, 3]);
  });

  test("case 13: thread stale marks the active pointer and emits an error frame", async () => {
    mockChatPointerGetActive.mockResolvedValueOnce(chatPointer);
    const error = new Error("Molt thread not found");
    error.code = "thread_stale";
    mockStreamChat.mockRejectedValueOnce(error);

    const response = await request(buildApp())
      .post(route())
      .send({ message: "hello", scopeKey: "user:1", threadId: "missing" })
      .expect(200);

    expect(mockChatPointerMarkStale).toHaveBeenCalledWith({ id: 55 });
    expect(parseSse(response.text)).toEqual([
      {
        event: "error",
        data: { code: "thread_stale", message: "Molt thread not found" },
      },
    ]);
  });

  test("case 14: broker errors emit error frame without marking stale", async () => {
    mockStreamChat.mockRejectedValueOnce(new Error("upstream down"));

    const response = await request(buildApp())
      .post(route())
      .send({ message: "hello", scopeKey: "user:1" })
      .expect(200);

    expect(mockChatPointerMarkStale).not.toHaveBeenCalled();
    expect(parseSse(response.text)).toEqual([
      {
        event: "error",
        data: { code: "MOLT_STREAM_ERROR", message: "Molt stream failed" },
      },
    ]);
  });

  test("case 15: abort-style upstream cancellation has no persistence side effects", async () => {
    const error = new Error("aborted");
    error.name = "AbortError";
    mockStreamChat.mockRejectedValueOnce(error);

    const response = await request(buildApp())
      .post(route())
      .send({ message: "hello", scopeKey: "user:1" })
      .expect(200);

    expect(parseSse(response.text)).toEqual([]);
    expect(mockChatPointerUpsert).not.toHaveBeenCalled();
    expect(mockChatPointerBump).not.toHaveBeenCalled();
    expect(mockChatPointerMarkStale).not.toHaveBeenCalled();
  });

  test("case 16: overlong message is rejected with 413", async () => {
    await request(buildApp())
      .post(route())
      .send({ message: "x".repeat(32_001), scopeKey: "user:1" })
      .expect(413);

    expect(mockStreamChat).not.toHaveBeenCalled();
  });

  test("case 17: successful stream upserts active pointer and bumps message timestamp", async () => {
    await request(buildApp())
      .post(route())
      .send({ message: "hello", scopeKey: "user:1" })
      .expect(200);

    expect(mockChatPointerUpsert).toHaveBeenCalledWith({
      workspaceId: 7,
      moltAgentId: "molt-agent-1",
      scopeKey: "user:1",
      createdByUserId: null,
      moltThreadId: "thread-2",
    });
    expect(mockChatPointerBump).toHaveBeenCalledWith({ id: 56 });
  });

  test("case 18: existing pointer thread id is reused when request omits threadId", async () => {
    mockChatPointerGetActive.mockResolvedValueOnce(chatPointer);

    await request(buildApp())
      .post(route())
      .send({ message: "hello", scopeKey: "user:1" })
      .expect(200);

    expect(mockStreamChat).toHaveBeenCalledWith(
      expect.objectContaining({ threadId: "thread-existing" })
    );
  });
});
