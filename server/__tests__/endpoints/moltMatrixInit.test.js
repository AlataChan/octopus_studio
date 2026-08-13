const express = require("express");
const request = require("supertest");

const users = {
  member: { id: 1, role: "default", username: "member" },
  owner: { id: 2, role: "manager", username: "owner" },
  admin: { id: 99, role: "admin", username: "admin" },
};

const mockStatus = jest.fn();
const mockIsAvailable = jest.fn();
const mockMatrixInit = jest.fn();
const mockGetValueOrFallback = jest.fn();
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
      client: {
        matrixInit: (...args) => mockMatrixInit(...args),
      },
    }),
  },
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

jest.mock("../../utils/molt/broker", () => ({
  getMoltBroker: () => ({ listAgents: jest.fn() }),
}));
jest.mock("../../utils/molt/kmBridge", () => ({
  createKmBridge: () => ({ status: jest.fn() }),
}));
jest.mock("../../utils/molt/filesBridge", () => ({
  uploadTextFileToMolt: jest.fn(),
}));
jest.mock("../../models/workspace", () => ({
  Workspace: { get: jest.fn() },
}));
jest.mock("../../models/workspaceMoltAgent", () => ({
  WorkspaceMoltAgent: {
    where: jest.fn(),
    attach: jest.fn(),
    get: jest.fn(),
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
  workspace_users: { findFirst: jest.fn() },
  $disconnect: jest.fn(),
}));

const { moltEndpoints } = require("../../endpoints/molt");

function buildApp() {
  const app = express();
  app.use(express.json());
  moltEndpoints(app);
  return app;
}

function settings(values = {}) {
  mockGetValueOrFallback.mockImplementation(async ({ label }, fallback) =>
    Object.prototype.hasOwnProperty.call(values, label)
      ? values[label]
      : fallback
  );
}

function auditMetadata() {
  return mockLogEvent.mock.calls.at(-1)?.[1] || {};
}

describe("Molt Matrix init endpoint", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    settings({
      MOLT_ADMIN_TOKEN: "admin-secret",
      MOLT_API_TOKEN: "main-secret",
      MOLT_DASHBOARD_URL: "http://molt.local",
    });
    mockStatus.mockReturnValue({
      state: "CONNECTED",
      version: "1.2.3",
      capabilities: ["agents"],
      matrixState: "uninitialized",
      agentCount: 0,
    });
    mockIsAvailable.mockReturnValue(true);
    mockMatrixInit.mockResolvedValue({ ok: true, initialized: true });
    mockLogEvent.mockResolvedValue({ eventLog: { id: 1 }, message: null });
  });

  test("single-user mode can init Matrix", async () => {
    const response = await request(buildApp())
      .post("/molt/matrix/init")
      .expect(200);

    expect(response.body).toEqual({
      success: true,
      moltResponse: { ok: true, initialized: true },
    });
    expect(mockMatrixInit).toHaveBeenCalledWith({ adminToken: "admin-secret" });
  });

  test("multi-user system admin can init Matrix", async () => {
    await request(buildApp())
      .post("/molt/matrix/init")
      .set("x-test-mode", "multi")
      .set("x-test-user", "admin")
      .expect(200);

    expect(mockMatrixInit).toHaveBeenCalledTimes(1);
  });

  test("multi-user ordinary member cannot init Matrix", async () => {
    const response = await request(buildApp())
      .post("/molt/matrix/init")
      .set("x-test-mode", "multi")
      .set("x-test-user", "member")
      .expect(403);

    expect(response.body).toEqual({
      success: false,
      error: "Forbidden: system admin required",
    });
    expect(mockMatrixInit).not.toHaveBeenCalled();
  });

  test("multi-user workspace owner or manager cannot init Matrix", async () => {
    await request(buildApp())
      .post("/molt/matrix/init")
      .set("x-test-mode", "multi")
      .set("x-test-user", "owner")
      .expect(403);

    expect(mockMatrixInit).not.toHaveBeenCalled();
  });

  test("unauthenticated init request is rejected", async () => {
    await request(buildApp())
      .post("/molt/matrix/init")
      .set("x-test-auth", "none")
      .expect(401);

    expect(mockMatrixInit).not.toHaveBeenCalled();
  });

  test("uses configured admin token when available", async () => {
    await request(buildApp()).post("/molt/matrix/init").expect(200);

    expect(mockMatrixInit).toHaveBeenCalledWith({ adminToken: "admin-secret" });
    expect(auditMetadata().tokenMode).toBe("admin");
  });

  test("falls back to the main token and warns when admin token is missing", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    settings({
      MOLT_API_TOKEN: "main-secret",
      MOLT_DASHBOARD_URL: "http://molt.local",
    });

    await request(buildApp()).post("/molt/matrix/init").expect(200);

    expect(mockMatrixInit).toHaveBeenCalledWith({ adminToken: "main-secret" });
    expect(warn).toHaveBeenCalledWith(
      "[MoltMatrixInit] MOLT_ADMIN_TOKEN not configured; using main Molt token"
    );
    expect(auditMetadata().tokenMode).toBe("main");
    warn.mockRestore();
  });

  test("successful init writes an audit log", async () => {
    await request(buildApp())
      .post("/molt/matrix/init")
      .set("x-test-mode", "multi")
      .set("x-test-user", "admin")
      .expect(200);

    expect(mockLogEvent).toHaveBeenCalledWith(
      "molt.matrix_init",
      expect.objectContaining({
        success: true,
        userId: users.admin.id,
        tokenMode: "admin",
        tokenIdHash: expect.any(String),
        moltResponse: { ok: true, initialized: true },
      }),
      users.admin.id
    );
  });

  test("failed init writes an audit log with error metadata", async () => {
    mockMatrixInit.mockResolvedValue({
      ok: false,
      statusCode: 401,
      error: "Unauthorized",
    });

    await request(buildApp()).post("/molt/matrix/init").expect(401);

    expect(mockLogEvent).toHaveBeenCalledWith(
      "molt.matrix_init",
      expect.objectContaining({
        success: false,
        error: "Unauthorized",
      }),
      null
    );
  });

  test("audit metadata includes user id and never stores raw token", async () => {
    await request(buildApp())
      .post("/molt/matrix/init")
      .set("x-test-mode", "multi")
      .set("x-test-user", "admin")
      .expect(200);

    const metadata = auditMetadata();
    expect(metadata.userId).toBe(users.admin.id);
    expect(JSON.stringify(metadata)).not.toContain("admin-secret");
    expect(JSON.stringify(metadata)).not.toContain("main-secret");
    expect(metadata.tokenIdHash).toMatch(/^[a-f0-9]{64}$/);
  });

  test("upstream 401 returns a friendly admin token hint", async () => {
    mockMatrixInit.mockResolvedValue({
      ok: false,
      statusCode: 401,
      error: "Unauthorized",
    });

    const response = await request(buildApp())
      .post("/molt/matrix/init")
      .expect(401);

    expect(response.body).toEqual({
      success: false,
      error: "Molt Matrix init unauthorized",
      code: "MOLT_MATRIX_INIT_UNAUTHORIZED",
      hint: "Configure MOLT_ADMIN_TOKEN with Matrix init permissions.",
    });
  });

  test("upstream 5xx returns a controlled failure", async () => {
    mockMatrixInit.mockResolvedValue({
      ok: false,
      statusCode: 502,
      error: "Bad gateway",
    });

    const response = await request(buildApp())
      .post("/molt/matrix/init")
      .expect(502);

    expect(response.body).toEqual({
      success: false,
      error: "Molt Matrix init failed",
      code: "MOLT_MATRIX_INIT_FAILED",
    });
  });

  test("offline Molt returns 503 before calling upstream", async () => {
    mockIsAvailable.mockReturnValue(false);

    const response = await request(buildApp())
      .post("/molt/matrix/init")
      .expect(503);

    expect(response.body).toEqual({
      success: false,
      error: "Molt is offline",
      code: "molt_offline",
    });
    expect(mockMatrixInit).not.toHaveBeenCalled();
  });

  test("status endpoint exposes Matrix init UI fields", async () => {
    const response = await request(buildApp()).get("/molt/status").expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        success: true,
        hasAdminToken: true,
        dashboardUrl: "http://molt.local",
        matrixState: "uninitialized",
        agentCount: 0,
      })
    );
  });
});
