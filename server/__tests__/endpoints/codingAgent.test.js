const express = require("express");
const fs = require("fs");
const os = require("os");
const path = require("path");
const request = require("supertest");

const mockFlexUserRoleValid = jest.fn();

jest.mock("../../utils/middleware/validatedRequest", () => ({
  validatedRequest: (req, res, next) => {
    if (req.headers.authorization !== "Bearer test") {
      return res.status(401).json({ success: false, error: "unauthorized" });
    }
    next();
  },
}));

jest.mock("../../utils/middleware/multiUserProtected", () => ({
  flexUserRoleValid: (...args) => mockFlexUserRoleValid(...args),
  ROLES: { all: "all", admin: "admin", manager: "manager", default: "default" },
}));

function loadEndpoints() {
  jest.resetModules();
  jest.doMock("../../utils/middleware/validatedRequest", () => ({
    validatedRequest: (req, res, next) => {
      if (req.headers.authorization !== "Bearer test") {
        return res.status(401).json({ success: false, error: "unauthorized" });
      }
      next();
    },
  }));
  jest.doMock("../../utils/middleware/multiUserProtected", () => ({
    flexUserRoleValid: (...args) => mockFlexUserRoleValid(...args),
    ROLES: { all: "all", admin: "admin", manager: "manager", default: "default" },
  }));
  return require("../../endpoints/codingAgent");
}

function makeApp(manager) {
  const { codingAgentEndpoints } = loadEndpoints();
  const app = express();
  const apiRouter = express.Router();
  app.use(express.json());
  codingAgentEndpoints(apiRouter, { manager });
  app.use("/api", apiRouter);
  return app;
}

function auth(requestBuilder, role = "admin") {
  return requestBuilder.set("Authorization", "Bearer test").set("X-Test-Role", role);
}

describe("coding agent endpoints M3", () => {
  let tempDir;
  let allowedRoot;
  let outsideRoot;
  let manager;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFlexUserRoleValid.mockImplementation((roles) => (req, res, next) => {
      const role = req.headers["x-test-role"];
      if (!roles.includes(role)) {
        return res.status(403).json({ success: false, error: "forbidden" });
      }
      next();
    });
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "octopus-coding-endpoint-"));
    allowedRoot = path.join(tempDir, "allowed");
    outsideRoot = path.join(tempDir, "outside");
    fs.mkdirSync(path.join(allowedRoot, "repo"), { recursive: true });
    fs.mkdirSync(path.join(outsideRoot, "repo"), { recursive: true });
    process.env.CODING_AGENT_ALLOWED_SOURCE_ROOTS = allowedRoot;
    manager = {
      createRun: jest.fn(async () => ({ runId: "run-1", status: "pending" })),
      getRun: jest.fn((id) =>
        id === "run-1" ? { runId: id, status: "completed", totalTurns: 1 } : null
      ),
      listEvents: jest.fn(() => [{ sequence: 2, type: "coding.run.completed", payload: {} }]),
      approve: jest.fn(async () => ({ ok: true, status: "completed" })),
      cancel: jest.fn(() => ({ ok: true, status: "cancelled" })),
      getPatch: jest.fn(async () => ({ text: "patch" })),
      applyBack: jest.fn(async () => ({ applied: true, status: "applied" })),
    };
  });

  afterEach(() => {
    delete process.env.CODING_AGENT_ALLOWED_SOURCE_ROOTS;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test("T-EP1 POST /api/coding-agent/runs creates a run and /api/api route is absent", async () => {
    const app = makeApp(manager);
    const sourceRepoPath = path.join(allowedRoot, "repo");

    const ok = await auth(request(app).post("/api/coding-agent/runs"))
      .send({ sourceRepoPath, prompt: "fix", allowedSourceRoots: [outsideRoot] })
      .expect(202);

    expect(ok.body).toEqual({ success: true, runId: "run-1", status: "pending" });
    expect(manager.createRun).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceRepoPath: fs.realpathSync.native(sourceRepoPath),
        prompt: "fix",
        allowedSourceRoots: [fs.realpathSync.native(allowedRoot)],
      })
    );

    await auth(request(app).post("/api/api/coding-agent/runs"))
      .send({ sourceRepoPath, prompt: "fix" })
      .expect(404);
  });

  test("T-EP2 unauthenticated or insufficient-role requests are rejected by middleware", async () => {
    const app = makeApp(manager);
    const sourceRepoPath = path.join(allowedRoot, "repo");

    await request(app)
      .post("/api/coding-agent/runs")
      .send({ sourceRepoPath, prompt: "fix" })
      .expect(401);

    await auth(request(app).post("/api/coding-agent/runs"), "default")
      .send({ sourceRepoPath, prompt: "fix" })
      .expect(403);

    expect(mockFlexUserRoleValid).toHaveBeenCalledWith(["admin", "manager"]);
  });

  test("T-EP3 status, events, approve, cancel, patch, apply routes return shapes and unknown id returns 404", async () => {
    const app = makeApp(manager);

    await auth(request(app).get("/api/coding-agent/runs/run-1"))
      .expect(200)
      .expect((res) => {
        expect(res.body.data).toMatchObject({ runId: "run-1", status: "completed" });
      });
    await auth(request(app).get("/api/coding-agent/runs/missing")).expect(404);

    await auth(request(app).get("/api/coding-agent/runs/run-1/events?after=1"))
      .expect(200)
      .expect((res) => {
        expect(manager.listEvents).toHaveBeenCalledWith("run-1", { afterSequence: 1 });
        expect(res.body.events).toEqual([expect.objectContaining({ sequence: 2 })]);
      });
    await auth(request(app).post("/api/coding-agent/runs/run-1/approve"))
      .send({ approvalId: "approval-1", approved: true })
      .expect(200);
    await auth(request(app).post("/api/coding-agent/runs/run-1/cancel")).expect(200);
    await auth(request(app).get("/api/coding-agent/runs/run-1/patch"))
      .expect(200)
      .expect((res) => expect(res.body.patch).toEqual({ text: "patch" }));
    await auth(request(app).post("/api/coding-agent/runs/run-1/apply"))
      .send({ approved: true })
      .expect(200)
      .expect((res) => expect(res.body.result).toMatchObject({ applied: true }));
  });

  test("T-EP4 source path outside CODING_AGENT_ALLOWED_SOURCE_ROOTS is 403 and client allowlist is ignored", async () => {
    const app = makeApp(manager);
    const outsideRepo = path.join(outsideRoot, "repo");

    await auth(request(app).post("/api/coding-agent/runs"))
      .send({
        sourceRepoPath: outsideRepo,
        prompt: "fix",
        allowedSourceRoots: [outsideRoot],
      })
      .expect(403);
    expect(manager.createRun).not.toHaveBeenCalled();

    delete process.env.CODING_AGENT_ALLOWED_SOURCE_ROOTS;
    await auth(request(app).post("/api/coding-agent/runs"))
      .send({ sourceRepoPath: path.join(allowedRoot, "repo"), prompt: "fix" })
      .expect(403);
  });
});
