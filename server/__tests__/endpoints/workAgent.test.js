process.env.NODE_ENV = "test";

const { mockRequest, mockResponse } = require("../utils/testHelpers");

jest.mock("../../utils/http", () => ({
  reqBody: (req) => req.body,
  userFromSession: async () => ({ id: 12, role: "default" }),
  multiUserMode: () => false,
}));

jest.mock("../../utils/middleware/multiUserProtected", () => ({
  ROLES: { all: "all" },
  flexUserRoleValid: () => (_req, _res, next) => next(),
}));

jest.mock("../../models/workspace", () => ({
  Workspace: {
    get: jest.fn(async () => ({ id: 7, slug: "demo", name: "Demo" })),
    getWithUser: jest.fn(),
  },
}));

jest.mock("../../models/workspaceThread", () => ({
  WorkspaceThread: {
    get: jest.fn(async () => ({
      id: 33,
      slug: "thread-1",
      workspace_id: 7,
    })),
  },
}));

const mockSubmitGoal = jest.fn(async () => ({ runId: "run-1" }));
jest.mock("../../utils/workAgent/engines", () => ({
  getWorkAgentEngine: jest.fn(() => ({
    submitGoal: (...args) => mockSubmitGoal(...args),
  })),
}));

describe("workAgent endpoints", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSubmitGoal.mockResolvedValue({ runId: "run-1" });
  });

  it("submits a goal and returns Live Canvas stream coordinates", async () => {
    const routes = {};
    const app = {
      get: jest.fn((path, middleware, handler) => {
        routes[`GET ${path}`] = { middleware, handler };
      }),
      post: jest.fn((path, middleware, handler) => {
        routes[`POST ${path}`] = { middleware, handler };
      }),
    };

    const { workAgentEndpoints } = require("../../endpoints/workAgent");
    workAgentEndpoints(app);

    const route = routes["POST /work-agent/runs"];
    expect(route).toBeDefined();

    const req = mockRequest({
      body: {
        goal: "Draft a report",
        workspaceSlug: "demo",
        threadSlug: "thread-1",
      },
    });
    const res = mockResponse();

    await route.handler(req, res);

    expect(mockSubmitGoal).toHaveBeenCalledWith(
      expect.objectContaining({
        goal: "Draft a report",
        workspace: expect.objectContaining({ id: 7 }),
        thread: expect.objectContaining({ slug: "thread-1" }),
        engine: "mastra",
      })
    );
    expect(res.status).toHaveBeenCalledWith(202);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          runId: "run-1",
          engine: "mastra",
          stream: {
            type: "liveCanvas",
            sessionId: "thread-1",
            eventsPath: "/api/canvas/events?sessionId=thread-1",
          },
        }),
      })
    );
  });

  it("rejects a retired engine without echoing the rejected value", async () => {
    const routes = {};
    const app = {
      get: jest.fn((path, middleware, handler) => {
        routes[`GET ${path}`] = { middleware, handler };
      }),
      post: jest.fn((path, middleware, handler) => {
        routes[`POST ${path}`] = { middleware, handler };
      }),
    };
    const { workAgentEndpoints } = require("../../endpoints/workAgent");
    workAgentEndpoints(app);
    const res = mockResponse();

    await routes["POST /work-agent/runs"].handler(
      mockRequest({
        body: {
          goal: "Draft a report",
          workspaceSlug: "demo",
          threadSlug: "thread-1",
          engine: "octopus",
        },
      }),
      res
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: "Unsupported work-agent engine",
    });
    expect(mockSubmitGoal).not.toHaveBeenCalled();
  });
});
