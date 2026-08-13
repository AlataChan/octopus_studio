process.env.NODE_ENV = "test";

const { mockRequest, mockResponse } = require("../utils/testHelpers");

const mockValidatedRequest = jest.fn((_request, _response, next) => next());
const mockAuthorize = jest.fn();
const mockPersist = jest.fn();
const mockResolveBindings = jest.fn();
const mockPublishGate = jest.fn();
const mockDraftModel = {
  listByWorkspace: jest.fn(),
  getInWorkspace: jest.fn(),
  requestReview: jest.fn(),
  approve: jest.fn(),
  reject: jest.fn(),
  publish: jest.fn(),
};
const mockPrisma = { workspaces: { findUnique: jest.fn() } };

jest.mock("../../utils/prisma", () => mockPrisma);
jest.mock("../../utils/http", () => ({
  reqBody: (request) => request.body,
  userFromSession: async (_request, response) => response.locals.user || null,
  multiUserMode: (response) => response.locals.multiUserMode,
  safeJsonParse: (value, fallback) => {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  },
}));
jest.mock("../../utils/middleware/validatedRequest", () => ({
  validatedRequest: mockValidatedRequest,
}));
jest.mock("../../utils/middleware/multiUserProtected", () => ({
  ROLES: { all: "all" },
  flexUserRoleValid: () => (_request, _response, next) => next(),
}));
jest.mock("../../utils/fde/fdeAuthorization", () => {
  const actual = jest.requireActual("../../utils/fde/fdeAuthorization");
  return { ...actual, authorizeFdeAction: (...args) => mockAuthorize(...args) };
});
jest.mock("../../utils/fde/studioWorkflowImporter", () => ({
  persistStudioWorkflowSpec: (...args) => mockPersist(...args),
}));
jest.mock("../../utils/fde/studioWorkflowBindings", () => ({
  resolveBindings: (...args) => mockResolveBindings(...args),
}));
jest.mock("../../utils/fde/publishGate", () => ({
  assertPublishable: (...args) => mockPublishGate(...args),
}));
jest.mock("../../models/fdeWorkflowDraft", () => ({
  FdeWorkflowDraft: mockDraftModel,
  STUDIO_REVIEW_POLICY_VERSION: "1",
}));

const {
  StudioWorkflowSpecError,
} = require("../../utils/fde/studioWorkflowSpec");

function registerRoutes() {
  const routes = {};
  const app = {
    get: jest.fn((path, middleware, handler) => {
      routes[`GET ${path}`] = { middleware, handler };
    }),
    post: jest.fn((path, middleware, handler) => {
      routes[`POST ${path}`] = { middleware, handler };
    }),
  };
  const { fdeWorkflowEndpoints } = require("../../endpoints/fdeWorkflows");
  fdeWorkflowEndpoints(app);
  return routes;
}

function response() {
  const result = mockResponse();
  result.locals = {
    user: { id: 12, role: "default" },
    multiUserMode: true,
  };
  return result;
}

describe("FDE workflow endpoints", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.workspaces.findUnique.mockResolvedValue({
      id: 7,
      slug: "clinic-a",
    });
    mockAuthorize.mockResolvedValue({ ok: true });
    mockPersist.mockResolvedValue({ id: "draft-1", workspaceId: 7 });
    mockDraftModel.getInWorkspace.mockResolvedValue({
      id: "draft-1",
      workspaceId: 7,
      createdByUserId: 22,
      stateVersion: 3,
      specJson: JSON.stringify({ workflow: { required_bindings: [] } }),
      reviewStatus: "approved",
      diffJson: null,
    });
    mockResolveBindings.mockResolvedValue({ resolved: {}, missing: [] });
  });

  it("registers every route on validatedRequest", () => {
    const routes = registerRoutes();
    expect(Object.keys(routes).sort()).toEqual([
      "GET /workspace/:slug/fde-workflows",
      "GET /workspace/:slug/fde-workflows/:draftId",
      "POST /workspace/:slug/fde-workflows/:draftId/publish",
      "POST /workspace/:slug/fde-workflows/:draftId/review",
      "POST /workspace/:slug/fde-workflows/import",
    ]);
    for (const route of Object.values(routes)) {
      expect(route.middleware).toContain(mockValidatedRequest);
    }
  });

  it("imports the spec with optional Studio-assigned lineage fields", async () => {
    const route =
      registerRoutes()["POST /workspace/:slug/fde-workflows/import"];
    const res = response();
    const spec = { schema_version: "1.0" };

    await route.handler(
      mockRequest({
        body: {
          spec,
          lineageKey: "d00493fa-3ee2-41d3-861b-937d3ad978c2",
          parentDraftId: "c08a0bc2-fbdb-490a-8230-0cd16a5230b7",
        },
        params: { slug: "clinic-a" },
      }),
      res
    );

    expect(mockPersist).toHaveBeenCalledWith({
      spec,
      workspaceId: 7,
      actorUserId: 12,
      lineageKey: "d00493fa-3ee2-41d3-861b-937d3ad978c2",
      parentDraftId: "c08a0bc2-fbdb-490a-8230-0cd16a5230b7",
    });
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it.each(["workspaceId", "status", "engine", "specDigest", "reviewStatus"])(
    "rejects mass assignment of %s",
    async (field) => {
      const route =
        registerRoutes()["POST /workspace/:slug/fde-workflows/import"];
      const res = response();
      await route.handler(
        mockRequest({
          body: { spec: {}, [field]: "owned" },
          params: { slug: "clinic-a" },
        }),
        res
      );
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        code: "STUDIO_REQUEST_FIELDS_INVALID",
        path: "body",
      });
      expect(mockPersist).not.toHaveBeenCalled();
    }
  );

  it("returns a stable version error without a schema wall", async () => {
    mockPersist.mockRejectedValue(
      new StudioWorkflowSpecError(
        "STUDIO_SPEC_VERSION_UNSUPPORTED",
        "must not leak internals",
        "/schema_version"
      )
    );
    const route =
      registerRoutes()["POST /workspace/:slug/fde-workflows/import"];
    const res = response();
    await route.handler(
      mockRequest({ body: { spec: {} }, params: { slug: "clinic-a" } }),
      res
    );
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      code: "STUDIO_SPEC_VERSION_UNSUPPORTED",
      path: "/schema_version",
    });
  });

  it("exposes a parsed cached semantic diff on draft detail", async () => {
    mockDraftModel.getInWorkspace.mockResolvedValue({
      id: "draft-1",
      workspaceId: 7,
      diffJson: JSON.stringify({
        changes: [{ op: "replace", path: "/workflow/name" }],
        summary: { nodes: 1, edges: 0, total: 1 },
      }),
    });
    const res = response();

    await registerRoutes()[
      "GET /workspace/:slug/fde-workflows/:draftId"
    ].handler(
      mockRequest({ params: { slug: "clinic-a", draftId: "draft-1" } }),
      res
    );

    expect(res.json).toHaveBeenCalledWith({
      data: {
        draft: expect.objectContaining({ id: "draft-1" }),
        diff: expect.objectContaining({
          summary: { nodes: 1, edges: 0, total: 1 },
        }),
      },
    });
  });

  it("hides a foreign workspace as 404 and performs no import", async () => {
    mockAuthorize.mockResolvedValue({ ok: false, status: 403 });
    const route =
      registerRoutes()["POST /workspace/:slug/fde-workflows/import"];
    const res = response();
    await route.handler(
      mockRequest({ body: { spec: {} }, params: { slug: "clinic-a" } }),
      res
    );
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      code: "STUDIO_WORKSPACE_NOT_FOUND",
      path: "workspace",
    });
    expect(mockPersist).not.toHaveBeenCalled();
  });

  it("maps review decisions and never accepts an actor id from the body", async () => {
    const tx = { marker: "transaction-client" };
    mockDraftModel.approve.mockImplementation(async (args) => {
      await args.resolveFreshBindings({
        draft: await mockDraftModel.getInWorkspace(),
        tx,
      });
      return { id: "draft-1", reviewStatus: "approved" };
    });
    const route =
      registerRoutes()["POST /workspace/:slug/fde-workflows/:draftId/review"];
    const res = response();
    await route.handler(
      mockRequest({
        params: { slug: "clinic-a", draftId: "draft-1" },
        body: { decision: "approve", expectedStateVersion: 3 },
      }),
      res
    );
    expect(mockDraftModel.approve).toHaveBeenCalledWith({
      id: "draft-1",
      actorUserId: 12,
      separationOfDutySatisfied: true,
      expectedStateVersion: 3,
      resolveFreshBindings: expect.any(Function),
      studioReviewPolicyVersion: "1",
    });
    expect(mockResolveBindings).toHaveBeenCalledWith({
      workspaceId: 7,
      requiredBindings: [],
      prismaClient: tx,
    });
  });

  it("revalidates bindings and leaves publish disabled without a diff", async () => {
    mockPublishGate.mockImplementation(() => {
      const error = new Error("disabled");
      error.code = "STUDIO_PUBLISH_DIFF_REQUIRED";
      error.path = "diff";
      error.status = 409;
      throw error;
    });
    const route =
      registerRoutes()["POST /workspace/:slug/fde-workflows/:draftId/publish"];
    const res = response();
    await route.handler(
      mockRequest({
        params: { slug: "clinic-a", draftId: "draft-1" },
        body: { expectedStateVersion: 3 },
      }),
      res
    );
    expect(mockResolveBindings).not.toHaveBeenCalled();
    expect(mockDraftModel.publish).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      code: "STUDIO_PUBLISH_DIFF_REQUIRED",
      path: "diff",
    });
  });

  it("revalidates publish bindings inside the model transaction", async () => {
    const draft = {
      id: "draft-1",
      workspaceId: 7,
      createdByUserId: 22,
      stateVersion: 3,
      specJson: JSON.stringify({ workflow: { required_bindings: [] } }),
      reviewStatus: "approved",
      diffJson: "{}",
    };
    const tx = { marker: "transaction-client" };
    mockDraftModel.getInWorkspace.mockResolvedValue(draft);
    mockDraftModel.publish.mockImplementation(async (args) => {
      await args.resolveFreshBindings({ draft, tx });
      return { ...draft, status: "published" };
    });
    const route =
      registerRoutes()["POST /workspace/:slug/fde-workflows/:draftId/publish"];
    const res = response();

    await route.handler(
      mockRequest({
        params: { slug: "clinic-a", draftId: "draft-1" },
        body: { expectedStateVersion: 3 },
      }),
      res
    );

    expect(mockResolveBindings).toHaveBeenCalledWith({
      workspaceId: 7,
      requiredBindings: [],
      prismaClient: tx,
    });
    expect(mockDraftModel.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        separationOfDutySatisfied: true,
        resolveFreshBindings: expect.any(Function),
        studioReviewPolicyVersion: "1",
      })
    );
  });

  it.each([
    ["approve", "POST /workspace/:slug/fde-workflows/:draftId/review"],
    ["publish", "POST /workspace/:slug/fde-workflows/:draftId/publish"],
  ])(
    "blocks %s after switching to single-user mode",
    async (action, routeKey) => {
      const route = registerRoutes()[routeKey];
      const res = response();
      res.locals.multiUserMode = false;
      res.locals.user = null;

      await route.handler(
        mockRequest({
          params: { slug: "clinic-a", draftId: "draft-1" },
          body:
            action === "approve"
              ? { decision: "approve", expectedStateVersion: 3 }
              : { expectedStateVersion: 3 },
        }),
        res
      );

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({
        code: "STUDIO_REVIEW_SEPARATION_REQUIRED",
        path: "review",
      });
      expect(mockDraftModel.approve).not.toHaveBeenCalled();
      expect(mockDraftModel.publish).not.toHaveBeenCalled();
    }
  );
});
