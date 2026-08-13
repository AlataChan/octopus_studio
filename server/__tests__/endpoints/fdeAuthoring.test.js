process.env.NODE_ENV = "test";

const { mockRequest, mockResponse } = require("../utils/testHelpers");

const mockAuthorize = jest.fn();
const mockClient = {
  createSession: jest.fn(),
  createTurn: jest.fn(),
  getIr: jest.fn(),
  getDiff: jest.fn(),
  compile: jest.fn(),
  downloadArtifact: jest.fn(),
};
const mockAuthoring = {
  create: jest.fn(),
  getInWorkspace: jest.fn(),
  recordTurn: jest.fn(),
};
const mockPersist = jest.fn();
const mockDraftModel = { getLatestInLineage: jest.fn() };
const mockPrisma = { workspaces: { findUnique: jest.fn() } };

jest.mock("../../utils/prisma", () => mockPrisma);
jest.mock("../../utils/http", () => ({
  userFromSession: async (_request, response) => response.locals.user || null,
  multiUserMode: (response) => response.locals.multiUserMode,
}));
jest.mock("../../utils/middleware/validatedRequest", () => ({
  validatedRequest: (_request, _response, next) => next(),
}));
jest.mock("../../utils/middleware/multiUserProtected", () => ({
  ROLES: { all: "all" },
  flexUserRoleValid: () => (_request, _response, next) => next(),
}));
jest.mock("../../utils/fde/fdeAuthorization", () => {
  const actual = jest.requireActual("../../utils/fde/fdeAuthorization");
  return { ...actual, authorizeFdeAction: (...args) => mockAuthorize(...args) };
});
jest.mock("../../utils/fde/fdeClient", () => ({
  getFdeClient: () => mockClient,
}));
jest.mock("../../models/fdeAuthoringSession", () => ({
  FdeAuthoringSession: mockAuthoring,
}));
jest.mock("../../utils/fde/studioWorkflowImporter", () => ({
  persistStudioWorkflowSpec: (...args) => mockPersist(...args),
}));
jest.mock("../../models/fdeWorkflowDraft", () => ({
  FdeWorkflowDraft: mockDraftModel,
}));

function routes() {
  const registered = {};
  const app = {
    get: jest.fn((path, middleware, handler) => {
      registered[`GET ${path}`] = { middleware, handler };
    }),
    post: jest.fn((path, middleware, handler) => {
      registered[`POST ${path}`] = { middleware, handler };
    }),
  };
  require("../../endpoints/fdeAuthoring").fdeAuthoringEndpoints(app);
  return registered;
}

function response() {
  const result = mockResponse();
  result.locals = {
    user: { id: 12, role: "default" },
    multiUserMode: true,
  };
  return result;
}

describe("FDE authoring proxy", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.workspaces.findUnique.mockResolvedValue({
      id: 7,
      slug: "clinic-a",
    });
    mockAuthorize.mockResolvedValue({ ok: true });
    mockAuthoring.create.mockResolvedValue({
      id: "authoring-a",
      workspaceId: 7,
      fdeSessionId: "remote-a",
    });
    mockAuthoring.getInWorkspace.mockResolvedValue({
      id: "authoring-a",
      workspaceId: 7,
      fdeSessionId: "remote-a",
      fdeFromTurnId: "turn-one",
      fdeToTurnId: "turn-two",
    });
    mockClient.createSession.mockResolvedValue({
      session_id: "remote-a",
      state: "init",
    });
    mockClient.createTurn.mockResolvedValue({
      turn_id: "turn-three",
      kind: "clarify",
    });
    mockClient.getIr.mockResolvedValue({ ir: { ir_version: "0.3" } });
    mockClient.getDiff.mockResolvedValue({
      from: "turn-one",
      to: "turn-two",
      changes: [],
    });
    mockClient.compile.mockResolvedValue({ artifact_id: "artifact-a" });
    mockClient.downloadArtifact.mockResolvedValue(
      JSON.stringify({ target: "studio" })
    );
    mockPersist.mockResolvedValue({ id: "draft-a" });
    mockDraftModel.getLatestInLineage.mockResolvedValue(null);
  });

  it("registers all five workspace-scoped proxy routes", () => {
    expect(Object.keys(routes()).sort()).toEqual([
      "GET /workspace/:slug/fde-workflows/sessions/:draftId/diff",
      "GET /workspace/:slug/fde-workflows/sessions/:draftId/ir",
      "POST /workspace/:slug/fde-workflows/sessions",
      "POST /workspace/:slug/fde-workflows/sessions/:draftId/compile-import",
      "POST /workspace/:slug/fde-workflows/sessions/:draftId/turns",
    ]);
  });

  it("creates a local authoring row without creating a draft", async () => {
    const res = response();
    await routes()["POST /workspace/:slug/fde-workflows/sessions"].handler(
      mockRequest({ params: { slug: "clinic-a" }, body: {} }),
      res
    );

    expect(mockClient.createSession).toHaveBeenCalledWith();
    expect(mockAuthoring.create).toHaveBeenCalledWith({
      workspaceId: 7,
      fdeSessionId: "remote-a",
      createdByUserId: 12,
    });
    expect(mockPersist).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("submits a requirement using only the stored remote session id", async () => {
    const res = response();
    await routes()[
      "POST /workspace/:slug/fde-workflows/sessions/:draftId/turns"
    ].handler(
      mockRequest({
        params: { slug: "clinic-a", draftId: "authoring-a" },
        body: { user_message: "Draft a follow-up message" },
      }),
      res
    );

    expect(mockClient.createTurn).toHaveBeenCalledWith(
      "remote-a",
      "Draft a follow-up message"
    );
    expect(mockAuthoring.recordTurn).toHaveBeenCalledWith(
      "authoring-a",
      "turn-three"
    );
  });

  it("reads IR and turn-scoped diff from stored identifiers", async () => {
    const registered = routes();
    await registered[
      "GET /workspace/:slug/fde-workflows/sessions/:draftId/ir"
    ].handler(
      mockRequest({ params: { slug: "clinic-a", draftId: "authoring-a" } }),
      response()
    );
    await registered[
      "GET /workspace/:slug/fde-workflows/sessions/:draftId/diff"
    ].handler(
      mockRequest({ params: { slug: "clinic-a", draftId: "authoring-a" } }),
      response()
    );

    expect(mockClient.getIr).toHaveBeenCalledWith("remote-a");
    expect(mockClient.getDiff).toHaveBeenCalledWith(
      "remote-a",
      "turn-one",
      "turn-two"
    );
  });

  it("compile-import downloads JSON server-side and persists the FDE linkage", async () => {
    const res = response();
    await routes()[
      "POST /workspace/:slug/fde-workflows/sessions/:draftId/compile-import"
    ].handler(
      mockRequest({
        params: { slug: "clinic-a", draftId: "authoring-a" },
        body: { lineageKey: "d00493fa-3ee2-41d3-861b-937d3ad978c2" },
      }),
      res
    );

    expect(mockClient.compile).toHaveBeenCalledWith("remote-a");
    expect(mockClient.downloadArtifact).toHaveBeenCalledWith(
      "remote-a",
      "artifact-a"
    );
    expect(mockPersist).toHaveBeenCalledWith({
      spec: { target: "studio" },
      workspaceId: 7,
      actorUserId: 12,
      lineageKey: "d00493fa-3ee2-41d3-861b-937d3ad978c2",
      parentDraftId: undefined,
      fdeSessionId: "remote-a",
      fdeFromTurnId: "turn-one",
      fdeToTurnId: "turn-two",
      diffJson: null,
    });
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("caches a redacted semantic diff only against the previous lineage revision", async () => {
    mockDraftModel.getLatestInLineage.mockResolvedValue({
      id: "draft-previous",
      revision: 1,
      fdeSessionId: "remote-a",
      fdeToTurnId: "turn-one",
    });
    mockClient.getDiff.mockResolvedValue({
      from: "turn-one",
      to: "turn-two",
      changes: [{ detail: "Bearer should-not-persist" }],
      summary: { nodes: 1, edges: 0, total: 1 },
    });

    await routes()[
      "POST /workspace/:slug/fde-workflows/sessions/:draftId/compile-import"
    ].handler(
      mockRequest({
        params: { slug: "clinic-a", draftId: "authoring-a" },
        body: { lineageKey: "d00493fa-3ee2-41d3-861b-937d3ad978c2" },
      }),
      response()
    );

    expect(mockDraftModel.getLatestInLineage).toHaveBeenCalledWith(
      7,
      "d00493fa-3ee2-41d3-861b-937d3ad978c2"
    );
    expect(mockClient.getDiff).toHaveBeenCalledWith(
      "remote-a",
      "turn-one",
      "turn-two"
    );
    const persisted = mockPersist.mock.calls[0][0].diffJson;
    expect(JSON.parse(persisted).changes[0].detail).toContain("[REDACTED]");
    expect(persisted).not.toContain("should-not-persist");
  });

  it("fails closed when the previous revision is not the prior turn in the same FDE session", async () => {
    mockDraftModel.getLatestInLineage.mockResolvedValue({
      id: "draft-previous",
      revision: 1,
      fdeSessionId: "other-remote",
      fdeToTurnId: "other-turn",
    });
    const res = response();

    await routes()[
      "POST /workspace/:slug/fde-workflows/sessions/:draftId/compile-import"
    ].handler(
      mockRequest({
        params: { slug: "clinic-a", draftId: "authoring-a" },
        body: { lineageKey: "d00493fa-3ee2-41d3-861b-937d3ad978c2" },
      }),
      res
    );

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      code: "STUDIO_DIFF_LINEAGE_MISMATCH",
      path: "lineageKey",
    });
    expect(mockClient.compile).not.toHaveBeenCalled();
    expect(mockPersist).not.toHaveBeenCalled();
  });

  it("hides a foreign authoring session as 404 before any FDE call", async () => {
    mockAuthoring.getInWorkspace.mockResolvedValue(null);
    const res = response();

    await routes()[
      "GET /workspace/:slug/fde-workflows/sessions/:draftId/ir"
    ].handler(
      mockRequest({ params: { slug: "clinic-a", draftId: "foreign" } }),
      res
    );

    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockClient.getIr).not.toHaveBeenCalled();
  });
});
