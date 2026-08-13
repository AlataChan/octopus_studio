process.env.NODE_ENV = "test";

const { mockRequest, mockResponse } = require("../utils/testHelpers");

const mockGetSettings = jest.fn();
const mockUpdateSettings = jest.fn();
const mockReseedWorkAgentAssistants = jest.fn();

jest.mock("../../utils/http", () => ({
  reqBody: (request) => request.body,
  userFromSession: async () => ({ id: 1, role: "admin" }),
  multiUserMode: () => true,
  safeJsonParse: (value, fallback = null) => {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  },
}));

jest.mock("../../utils/middleware/validatedRequest", () => ({
  validatedRequest: (_request, response, next) => {
    response.locals.multiUserMode = true;
    response.locals.user = { id: 1, role: "admin" };
    next();
  },
}));

jest.mock("../../utils/middleware/multiUserProtected", () => ({
  ROLES: { all: "all", admin: "admin", manager: "manager" },
  flexUserRoleValid: () => (_request, _response, next) => next(),
}));

jest.mock("../../utils/workAgent/settings", () => ({
  WORK_AGENT_SETTINGS: {
    seedGstackAssistants: "SEED_GSTACK_ASSISTANTS",
  },
  getWorkAgentSettings: (...args) => mockGetSettings(...args),
  normalizeBooleanSetting: (value) =>
    String(value ?? "")
      .trim()
      .toLowerCase() === "true"
      ? "true"
      : "false",
  updateWorkAgentSettings: (...args) => mockUpdateSettings(...args),
}));

jest.mock("../../utils/workAgent/runtimeSeed", () => ({
  reseedWorkAgentAssistants: (...args) =>
    mockReseedWorkAgentAssistants(...args),
}));

jest.mock("../../models/workspace", () => ({
  Workspace: { get: jest.fn(), getWithUser: jest.fn() },
}));
jest.mock("../../models/workspaceThread", () => ({
  WorkspaceThread: { get: jest.fn() },
}));
jest.mock("../../models/run", () => ({
  Run: { getById: jest.fn(), STATUS: {} },
}));
jest.mock("../../models/runEvent", () => ({
  RunEvent: { listByRun: jest.fn() },
}));
jest.mock("../../utils/workAgent/engines", () => ({
  getWorkAgentEngine: jest.fn(() => ({ cancel: jest.fn() })),
}));
jest.mock("../../utils/workAgent/modelRouter", () => ({
  buildProviderRoute: jest.fn(),
}));

describe("work-agent admin settings endpoints", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockReseedWorkAgentAssistants.mockResolvedValue({
      skipped: false,
      result: { created: 48 },
    });
  });

  function buildRoutes() {
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
    return routes;
  }

  it("returns DB-backed work-agent settings through an authenticated admin route", async () => {
    mockGetSettings.mockResolvedValue({
      ALATA_WORK_AGENT_PROVIDER: { value: "deterministic", source: "db" },
    });
    const routes = buildRoutes();
    const route = routes["GET /admin/work-agent/settings"];
    expect(route).toBeDefined();

    const res = mockResponse();
    await route.handler(mockRequest(), res);

    expect(mockGetSettings).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        settings: {
          ALATA_WORK_AGENT_PROVIDER: { value: "deterministic", source: "db" },
        },
      },
    });
  });

  it("persists supported work-agent settings through an authenticated admin route", async () => {
    mockUpdateSettings.mockResolvedValue({ success: true, error: null });
    mockGetSettings.mockResolvedValue({
      SEED_GSTACK_ASSISTANTS: { value: "true", source: "db" },
    });
    const routes = buildRoutes();
    const route = routes["POST /admin/work-agent/settings"];
    expect(route).toBeDefined();

    const res = mockResponse();
    await route.handler(
      mockRequest({
        body: {
          settings: {
            SEED_GSTACK_ASSISTANTS: true,
            ALATA_CODE_EXECUTION_ROOT: "/tmp/code-root",
          },
        },
      }),
      res
    );

    expect(mockUpdateSettings).toHaveBeenCalledWith({
      SEED_GSTACK_ASSISTANTS: true,
      ALATA_CODE_EXECUTION_ROOT: "/tmp/code-root",
    });
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        settings: {
          SEED_GSTACK_ASSISTANTS: { value: "true", source: "db" },
        },
      },
    });
  });

  it("runs runtime assistant reseed when the gstack setting is enabled", async () => {
    mockUpdateSettings.mockResolvedValue({ success: true, error: null });
    mockGetSettings.mockResolvedValue({
      SEED_GSTACK_ASSISTANTS: { value: "true", source: "db" },
    });
    const routes = buildRoutes();
    const route = routes["POST /admin/work-agent/settings"];

    const res = mockResponse();
    await route.handler(
      mockRequest({
        body: { settings: { SEED_GSTACK_ASSISTANTS: true } },
      }),
      res
    );

    expect(mockReseedWorkAgentAssistants).toHaveBeenCalledTimes(1);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        settings: {
          SEED_GSTACK_ASSISTANTS: { value: "true", source: "db" },
        },
      },
    });
  });

  it("does not run runtime assistant reseed for false or unrelated setting updates", async () => {
    mockUpdateSettings.mockResolvedValue({ success: true, error: null });
    mockGetSettings.mockResolvedValue({
      SEED_GSTACK_ASSISTANTS: { value: "false", source: "db" },
    });
    const routes = buildRoutes();
    const route = routes["POST /admin/work-agent/settings"];

    await route.handler(
      mockRequest({
        body: { settings: { SEED_GSTACK_ASSISTANTS: false } },
      }),
      mockResponse()
    );
    await route.handler(
      mockRequest({
        body: { settings: { ALATA_CODE_EXECUTION_ROOT: "/tmp/code-root" } },
      }),
      mockResponse()
    );

    expect(mockReseedWorkAgentAssistants).not.toHaveBeenCalled();
  });

  it("still returns updated settings when runtime assistant reseed fails", async () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    mockUpdateSettings.mockResolvedValue({ success: true, error: null });
    mockGetSettings.mockResolvedValue({
      SEED_GSTACK_ASSISTANTS: { value: "true", source: "db" },
    });
    mockReseedWorkAgentAssistants.mockRejectedValue(new Error("seed failed"));
    const routes = buildRoutes();
    const route = routes["POST /admin/work-agent/settings"];

    const res = mockResponse();
    await route.handler(
      mockRequest({
        body: { settings: { SEED_GSTACK_ASSISTANTS: true } },
      }),
      res
    );

    expect(mockReseedWorkAgentAssistants).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      "[workAgent] gstack reseed skipped:",
      "seed failed"
    );
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        settings: {
          SEED_GSTACK_ASSISTANTS: { value: "true", source: "db" },
        },
      },
    });

    warnSpy.mockRestore();
  });
});
