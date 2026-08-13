const express = require("express");
const request = require("supertest");

const mockWorkspaceGet = jest.fn();
const mockListPending = jest.fn();

jest.mock("../../utils/middleware/validatedRequest", () => ({
  validatedRequest: (_request, response, next) => {
    response.locals.multiUserMode = false;
    next();
  },
}));

jest.mock("../../utils/http", () => ({
  multiUserMode: (response) => response.locals.multiUserMode,
  reqBody: (request) => request.body,
}));

jest.mock("../../models/workspace", () => ({
  Workspace: {
    get: (...args) => mockWorkspaceGet(...args),
  },
}));

jest.mock("../../models/workflowPendingConfirmation", () => ({
  WorkflowPendingConfirmation: {
    get: jest.fn(),
    listPending: (...args) => mockListPending(...args),
    approve: jest.fn(),
    reject: jest.fn(),
  },
}));

jest.mock("../../models/run", () => ({
  Run: {
    getById: jest.fn(),
  },
}));

jest.mock("../../utils/liveCanvas/runEventEmitter", () => ({
  runEventEmitter: {
    emitForSession: jest.fn(),
  },
}));

jest.mock("../../utils/liveCanvas/types", () => ({
  SSE_EVENTS: {
    APPROVAL_RESOLVED: "approval.resolved",
  },
}));

function buildMountedApp() {
  jest.resetModules();
  const { workflowConfirmationEndpoints } = require("../../endpoints/workflowConfirmation");
  const app = express();
  const apiRouter = express.Router();
  app.use(express.json());
  app.use("/api", apiRouter);
  workflowConfirmationEndpoints(apiRouter);
  return app;
}

describe("workflow confirmation endpoints", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWorkspaceGet.mockResolvedValue({ id: 7, slug: "demo" });
    mockListPending.mockResolvedValue([
      {
        id: 42,
        workspaceId: 7,
        planTitle: "调用工具确认",
        riskLevel: "high",
      },
    ]);
  });

  it("serves the pending confirmations route at the frontend API path", async () => {
    const app = buildMountedApp();

    const response = await request(app)
      .get("/api/workspace/demo/confirmations/pending")
      .expect(200);

    expect(mockWorkspaceGet).toHaveBeenCalledWith({ slug: "demo" });
    expect(mockListPending).toHaveBeenCalledWith({
      workspaceId: 7,
      userId: null,
    });
    expect(response.body).toEqual({
      success: true,
      confirmations: [
        {
          id: 42,
          workspaceId: 7,
          planTitle: "调用工具确认",
          riskLevel: "high",
        },
      ],
    });
  });

  it("does not expose a double-prefixed /api/api confirmation route", async () => {
    const app = buildMountedApp();

    await request(app)
      .get("/api/api/workspace/demo/confirmations/pending")
      .expect(404);
  });
});
