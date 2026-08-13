const express = require("express");
const request = require("supertest");

const users = {
  member: { id: 1, role: "default", username: "member" },
  manager: { id: 2, role: "manager", username: "manager" },
  outsider: { id: 3, role: "default", username: "outsider" },
  admin: { id: 99, role: "admin", username: "admin" },
};

const mockWorkspaceGet = jest.fn();
const mockWorkspaceUserFindFirst = jest.fn();
const mockWhere = jest.fn();
const mockAttach = jest.fn();
const mockGet = jest.fn();
const mockEnable = jest.fn();
const mockDisable = jest.fn();
const mockRemove = jest.fn();
const mockListAgents = jest.fn();
const mockLogEvent = jest.fn(async () => true);

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
    where: (...args) => mockWhere(...args),
    attach: (...args) => mockAttach(...args),
    get: (...args) => mockGet(...args),
    enable: (...args) => mockEnable(...args),
    disable: (...args) => mockDisable(...args),
    remove: (...args) => mockRemove(...args),
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
      status: () => ({ state: "CONNECTED" }),
      client: {},
    }),
  },
}));

jest.mock("../../utils/molt/broker", () => ({
  getMoltBroker: () => ({
    listAgents: (...args) => mockListAgents(...args),
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
  const isMember = [users.member.id, users.manager.id].includes(
    Number(where.user_id)
  );
  return Promise.resolve(isWorkspace && isMember ? { id: 100 } : null);
}

function route(slug = "demo", suffix = "") {
  return `/workspace/${slug}/molt-agents${suffix}`;
}

describe("workspace-scoped Molt agent endpoints", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWorkspaceGet.mockImplementation(({ slug }) =>
      slug === "missing" ? null : { ...workspace, slug }
    );
    mockWorkspaceUserFindFirst.mockImplementation(membershipFor);
    mockWhere.mockResolvedValue([attachedAgent]);
    mockAttach.mockResolvedValue(attachedAgent);
    mockGet.mockResolvedValue(attachedAgent);
    mockEnable.mockResolvedValue({ ...attachedAgent, enabled: true });
    mockDisable.mockResolvedValue({ ...attachedAgent, enabled: false });
    mockRemove.mockResolvedValue(true);
    mockListAgents.mockResolvedValue({
      success: true,
      agents: [{ id: "molt-agent-1", name: "Matrix Coordinator" }],
    });
    mockLogEvent.mockResolvedValue(true);
  });

  describe("GET /workspace/:slug/molt-agents", () => {
    test("case 1: allows single-user mode access", async () => {
      const response = await request(buildApp()).get(route()).expect(200);

      expect(response.body).toEqual({
        success: true,
        agents: [attachedAgent],
        moltAvailable: true,
      });
      expect(mockWhere).toHaveBeenCalledWith({ workspaceId: workspace.id });
    });

    test("case 2: allows a multi-user workspace member", async () => {
      const response = await request(buildApp())
        .get(route())
        .set("x-test-mode", "multi")
        .set("x-test-user", "member")
        .expect(200);

      expect(response.body.agents).toEqual([attachedAgent]);
      expect(mockWorkspaceUserFindFirst).toHaveBeenCalledWith({
        where: { workspace_id: workspace.id, user_id: users.member.id },
        select: { id: true },
      });
    });

    test("case 3: denies a multi-user non-member with 403", async () => {
      const response = await request(buildApp())
        .get(route())
        .set("x-test-mode", "multi")
        .set("x-test-user", "outsider")
        .expect(403);

      expect(response.body).toEqual({
        success: false,
        error: "Forbidden: not a workspace member",
      });
      expect(mockWhere).not.toHaveBeenCalled();
      expect(mockListAgents).not.toHaveBeenCalled();
    });

    test("case 4: allows a multi-user system admin for any workspace", async () => {
      await request(buildApp())
        .get(route())
        .set("x-test-mode", "multi")
        .set("x-test-user", "admin")
        .expect(200);

      expect(mockWorkspaceUserFindFirst).not.toHaveBeenCalled();
    });

    test("case 5: returns 404 for missing workspace slug", async () => {
      const response = await request(buildApp())
        .get(route("missing"))
        .expect(404);

      expect(response.body).toEqual({
        success: false,
        error: "Workspace not found",
      });
      expect(mockWhere).not.toHaveBeenCalled();
    });

    test("case 6: rejects unauthenticated requests before workspace lookup", async () => {
      await request(buildApp())
        .get(route())
        .set("x-test-auth", "none")
        .expect(401);

      expect(mockWorkspaceGet).not.toHaveBeenCalled();
    });
  });

  describe("POST /workspace/:slug/molt-agents", () => {
    test("case 7: allows single-user mode attach", async () => {
      const response = await request(buildApp())
        .post(route())
        .send({ moltAgentId: "molt-agent-1" })
        .expect(200);

      expect(response.body).toEqual({ success: true, agent: attachedAgent });
      expect(mockAttach).toHaveBeenCalledWith({
        workspaceId: workspace.id,
        moltAgentId: "molt-agent-1",
        displayName: undefined,
        metadata: undefined,
      });
    });

    test("case 8: allows a multi-user workspace admin attach", async () => {
      await request(buildApp())
        .post(route())
        .set("x-test-mode", "multi")
        .set("x-test-user", "manager")
        .send({ moltAgentId: "molt-agent-1" })
        .expect(200);

      expect(mockAttach).toHaveBeenCalledTimes(1);
      expect(mockWorkspaceUserFindFirst).toHaveBeenCalledTimes(2);
    });

    test("case 9: denies a multi-user ordinary member attach", async () => {
      const response = await request(buildApp())
        .post(route())
        .set("x-test-mode", "multi")
        .set("x-test-user", "member")
        .send({ moltAgentId: "molt-agent-1" })
        .expect(403);

      expect(response.body).toEqual({
        success: false,
        error: "Forbidden: workspace admin required",
      });
      expect(mockAttach).not.toHaveBeenCalled();
      expect(mockListAgents).not.toHaveBeenCalled();
    });

    test("case 10: allows a multi-user system admin who is not a workspace member", async () => {
      await request(buildApp())
        .post(route())
        .set("x-test-mode", "multi")
        .set("x-test-user", "admin")
        .send({ moltAgentId: "molt-agent-1" })
        .expect(200);

      expect(mockAttach).toHaveBeenCalledTimes(1);
      expect(mockWorkspaceUserFindFirst).not.toHaveBeenCalled();
    });

    test("case 11: duplicate attach is idempotent and returns 200", async () => {
      mockAttach.mockResolvedValueOnce({ ...attachedAgent, id: 10 });

      const response = await request(buildApp())
        .post(route())
        .send({ moltAgentId: "molt-agent-1" })
        .expect(200);

      expect(response.body.agent.id).toBe(10);
      expect(mockAttach).toHaveBeenCalledTimes(1);
    });

    test("case 12: missing moltAgentId returns 400", async () => {
      const response = await request(buildApp())
        .post(route())
        .send({ displayName: "No id" })
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        error: "moltAgentId is required",
      });
      expect(mockAttach).not.toHaveBeenCalled();
      expect(mockListAgents).not.toHaveBeenCalled();
    });

    test("case 13: Molt unavailable still attaches with a warning", async () => {
      mockListAgents.mockResolvedValueOnce({
        success: false,
        error: "Molt offline",
      });

      const response = await request(buildApp())
        .post(route())
        .send({ moltAgentId: "molt-agent-1" })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.warning).toContain("已 attach 待恢复");
      expect(mockAttach).toHaveBeenCalledTimes(1);
    });
  });

  describe("PATCH /workspace/:slug/molt-agents/:agentId", () => {
    test("case 14: lets a multi-user workspace admin toggle enabled", async () => {
      const response = await request(buildApp())
        .patch(route("demo", "/molt-agent-1"))
        .set("x-test-mode", "multi")
        .set("x-test-user", "manager")
        .send({ enabled: false })
        .expect(200);

      expect(response.body.agent.enabled).toBe(false);
      expect(mockDisable).toHaveBeenCalledWith({
        workspaceId: workspace.id,
        moltAgentId: "molt-agent-1",
      });
    });

    test("case 15: denies a multi-user ordinary member PATCH", async () => {
      await request(buildApp())
        .patch(route("demo", "/molt-agent-1"))
        .set("x-test-mode", "multi")
        .set("x-test-user", "member")
        .send({ enabled: false })
        .expect(403);

      expect(mockGet).not.toHaveBeenCalled();
      expect(mockDisable).not.toHaveBeenCalled();
    });

    test("case 16: returns 404 when PATCH target attachment does not exist", async () => {
      mockGet.mockResolvedValueOnce(null);

      const response = await request(buildApp())
        .patch(route("demo", "/missing-agent"))
        .set("x-test-mode", "multi")
        .set("x-test-user", "manager")
        .send({ enabled: false })
        .expect(404);

      expect(response.body).toEqual({
        success: false,
        error: "Molt agent attachment not found",
      });
      expect(mockDisable).not.toHaveBeenCalled();
    });
  });

  describe("DELETE /workspace/:slug/molt-agents/:agentId", () => {
    test("case 17: lets a multi-user workspace admin remove an attachment", async () => {
      const response = await request(buildApp())
        .delete(route("demo", "/molt-agent-1"))
        .set("x-test-mode", "multi")
        .set("x-test-user", "manager")
        .expect(200);

      expect(response.body).toEqual({ success: true });
      expect(mockRemove).toHaveBeenCalledWith({
        workspaceId: workspace.id,
        moltAgentId: "molt-agent-1",
      });
    });

    test("case 18: denies a multi-user ordinary member remove", async () => {
      await request(buildApp())
        .delete(route("demo", "/molt-agent-1"))
        .set("x-test-mode", "multi")
        .set("x-test-user", "member")
        .expect(403);

      expect(mockRemove).not.toHaveBeenCalled();
    });
  });

  describe("guard order and malformed input", () => {
    test("case 19: workspace missing returns 404 before attachment lookup", async () => {
      mockGet.mockResolvedValueOnce(attachedAgent);

      await request(buildApp())
        .patch(route("missing", "/molt-agent-1"))
        .set("x-test-mode", "multi")
        .set("x-test-user", "admin")
        .send({ enabled: false })
        .expect(404);

      expect(mockGet).not.toHaveBeenCalled();
      expect(mockDisable).not.toHaveBeenCalled();
    });

    test("case 20: SQL injection-style slug is rejected before workspace lookup", async () => {
      const response = await request(buildApp())
        .get(route("bad%27%20OR%201%3D1"))
        .expect(400);

      expect(response.body).toEqual({
        success: false,
        error: "Invalid workspace slug",
      });
      expect(mockWorkspaceGet).not.toHaveBeenCalled();
    });
  });
});
