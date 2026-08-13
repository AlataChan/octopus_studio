process.env.NODE_ENV = "test";

const { mockRequest, mockResponse } = require("../utils/testHelpers");

const mockUser = { id: 41, role: "default" };
const mockFindArtifact = jest.fn();
const mockAssertAccess = jest.fn();

jest.mock("fs", () => ({ existsSync: jest.fn() }));
jest.mock("../../utils/prisma", () => ({
  run_artifacts: { findUnique: (...args) => mockFindArtifact(...args) },
}));
jest.mock("../../utils/http", () => ({
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
jest.mock("../../utils/middleware/validatedRequest", () => ({
  validatedRequest: (_request, _response, next) => next(),
}));
jest.mock("../../utils/access/assertWorkspaceResourceAccess", () => ({
  assertWorkspaceResourceAccess: (...args) => mockAssertAccess(...args),
}));

function registeredRoutes() {
  const routes = {};
  const app = {
    get: jest.fn((path, middleware, handler) => {
      routes[`GET ${path}`] = { middleware, handler };
    }),
  };
  const { runArtifactsEndpoints } = require("../../endpoints/runArtifacts");
  runArtifactsEndpoints(app);
  return routes;
}

describe("run artifact workspace isolation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFindArtifact.mockResolvedValue({
      id: "artifact-a",
      run: { workspaceId: 7 },
      metadata: "{}",
      storageRef: "artifact-a.json",
      mimeType: "application/json",
    });
    mockAssertAccess.mockResolvedValue({ ok: false, status: 403 });
  });

  it.each(["GET /run-artifacts/:id", "GET /run-artifacts/:id/download"])(
    "returns an indistinguishable 404 for a foreign artifact through %s",
    async (key) => {
      const response = mockResponse();

      await registeredRoutes()[key].handler(
        mockRequest({ params: { id: "artifact-a" } }),
        response
      );

      expect(mockAssertAccess).toHaveBeenCalledWith({
        workspaceId: 7,
        user: mockUser,
        multiUserMode: true,
      });
      expect(response.status).toHaveBeenCalledWith(404);
      expect(response.json).toHaveBeenCalledWith({
        error: "Artifact not found",
      });
    }
  );

  it("returns the same 404 for an absent artifact without checking access", async () => {
    mockFindArtifact.mockResolvedValue(null);
    const response = mockResponse();

    await registeredRoutes()["GET /run-artifacts/:id"].handler(
      mockRequest({ params: { id: "missing" } }),
      response
    );

    expect(response.status).toHaveBeenCalledWith(404);
    expect(response.json).toHaveBeenCalledWith({ error: "Artifact not found" });
    expect(mockAssertAccess).not.toHaveBeenCalled();
  });

  it("returns 401 for an unauthenticated artifact request", async () => {
    mockAssertAccess.mockResolvedValue({ ok: false, status: 401 });
    const response = mockResponse();

    await registeredRoutes()["GET /run-artifacts/:id"].handler(
      mockRequest({ params: { id: "artifact-a" } }),
      response
    );

    expect(response.status).toHaveBeenCalledWith(401);
    expect(response.json).toHaveBeenCalledWith({ error: "Unauthenticated" });
  });
});
