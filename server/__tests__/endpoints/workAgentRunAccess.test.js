process.env.NODE_ENV = "test";

const { mockRequest, mockResponse } = require("../utils/testHelpers");

const mockUser = { id: 41, role: "default" };
const mockGetRun = jest.fn();
const mockListEvents = jest.fn();
const mockCancel = jest.fn();
const mockAssertAccess = jest.fn();
const mockGetEngine = jest.fn();

jest.mock("../../utils/http", () => ({
  reqBody: (request) => request.body,
  userFromSession: async () => mockUser,
  multiUserMode: () => true,
  safeJsonParse: (value, fallback) => {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  },
}));

jest.mock("../../utils/middleware/multiUserProtected", () => ({
  ROLES: { all: "all", admin: "admin", manager: "manager" },
  flexUserRoleValid: () => (_request, _response, next) => next(),
}));

jest.mock("../../models/run", () => ({
  Run: { getById: (...args) => mockGetRun(...args) },
}));

jest.mock("../../models/runEvent", () => ({
  RunEvent: { listByRun: (...args) => mockListEvents(...args) },
}));

jest.mock("../../utils/access/assertWorkspaceResourceAccess", () => ({
  assertWorkspaceResourceAccess: (...args) => mockAssertAccess(...args),
}));

jest.mock("../../utils/workAgent/engines", () => ({
  getWorkAgentEngine: (...args) => mockGetEngine(...args),
}));

function registeredRoutes() {
  const routes = {};
  const app = {
    get: jest.fn((route, middleware, handler) => {
      routes[`GET ${route}`] = { middleware, handler };
    }),
    post: jest.fn((route, middleware, handler) => {
      routes[`POST ${route}`] = { middleware, handler };
    }),
  };
  const { workAgentEndpoints } = require("../../endpoints/workAgent");
  workAgentEndpoints(app);
  return routes;
}

describe("pre-existing work-agent run route isolation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetEngine.mockReturnValue({
      submitGoal: jest.fn(),
      cancel: (...args) => mockCancel(...args),
    });
    mockGetRun.mockResolvedValue({
      id: "run-a",
      workspaceId: 7,
      metadata: "{}",
    });
    mockAssertAccess.mockResolvedValue({ ok: false, status: 403 });
  });

  it.each([
    ["GET /work-agent/runs/:runId", mockListEvents, mockCancel],
    ["GET /work-agent/runs/:runId/events", mockListEvents, mockCancel],
    ["POST /work-agent/runs/:runId/cancel", mockCancel, mockListEvents],
  ])(
    "returns the same 404 for a foreign run through %s",
    async (key, forbidden, other) => {
      const route = registeredRoutes()[key];
      const request = mockRequest({ params: { runId: "run-a" } });
      const response = mockResponse();

      await route.handler(request, response);

      expect(mockAssertAccess).toHaveBeenCalledWith({
        workspaceId: 7,
        user: mockUser,
        multiUserMode: true,
      });
      expect(response.status).toHaveBeenCalledWith(404);
      expect(response.json).toHaveBeenCalledWith({
        success: false,
        error: "Run not found",
      });
      expect(forbidden).not.toHaveBeenCalled();
      expect(other).not.toHaveBeenCalled();
    }
  );

  it("loads events only after workspace access succeeds", async () => {
    mockAssertAccess.mockResolvedValue({ ok: true });
    mockListEvents.mockResolvedValue([{ id: "event-a" }]);
    const route = registeredRoutes()["GET /work-agent/runs/:runId/events"];
    const response = mockResponse();

    await route.handler(mockRequest({ params: { runId: "run-a" } }), response);

    expect(mockListEvents).toHaveBeenCalledWith("run-a");
    expect(response.json).toHaveBeenCalledWith({
      success: true,
      data: { events: [{ id: "event-a" }] },
    });
  });

  it("returns the same 404 for an absent run without checking membership", async () => {
    mockGetRun.mockResolvedValue(null);
    const route = registeredRoutes()["GET /work-agent/runs/:runId/events"];
    const response = mockResponse();

    await route.handler(
      mockRequest({ params: { runId: "missing" } }),
      response
    );

    expect(response.status).toHaveBeenCalledWith(404);
    expect(mockAssertAccess).not.toHaveBeenCalled();
    expect(mockListEvents).not.toHaveBeenCalled();
  });

  it("fails closed for a historical run owned by the retired engine", async () => {
    mockAssertAccess.mockResolvedValue({ ok: true });
    mockGetRun.mockResolvedValue({
      id: "run-a",
      workspaceId: 7,
      engine: "octopus",
      metadata: '{"engine":"mastra"}',
    });
    const route = registeredRoutes()["POST /work-agent/runs/:runId/cancel"];
    const response = mockResponse();

    await route.handler(mockRequest({ params: { runId: "run-a" } }), response);

    expect(response.status).toHaveBeenCalledWith(409);
    expect(response.json).toHaveBeenCalledWith({
      success: false,
      error: "Run engine ownership is unavailable",
    });
    expect(mockGetEngine).not.toHaveBeenCalled();
    expect(mockCancel).not.toHaveBeenCalled();
  });

  it("fails closed when a legacy run has no attributable engine", async () => {
    mockAssertAccess.mockResolvedValue({ ok: true });
    mockGetRun.mockResolvedValue({
      id: "run-a",
      workspaceId: 7,
      engine: null,
      metadata: '{"engine":"octopus"}',
    });
    const route = registeredRoutes()["POST /work-agent/runs/:runId/cancel"];
    const response = mockResponse();

    await route.handler(mockRequest({ params: { runId: "run-a" } }), response);

    expect(response.status).toHaveBeenCalledWith(409);
    expect(mockGetEngine).not.toHaveBeenCalled();
    expect(mockCancel).not.toHaveBeenCalled();
  });
});
