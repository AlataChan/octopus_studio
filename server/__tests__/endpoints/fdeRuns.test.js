process.env.NODE_ENV = "test";

const { mockRequest, mockResponse } = require("../utils/testHelpers");

const mockAuthorize = jest.fn();
const mockDrafts = { getInWorkspace: jest.fn() };
const mockRuns = { getById: jest.fn(), updateStatus: jest.fn() };
const mockEvents = { append: jest.fn(), listByRun: jest.fn() };
const mockArtifacts = { listByRun: jest.fn() };
const mockCreateStudioRun = jest.fn();
const mockQueueStudioRun = jest.fn();
const mockResumeStudioRun = jest.fn();
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
jest.mock("../../models/fdeWorkflowDraft", () => ({
  FdeWorkflowDraft: mockDrafts,
}));
jest.mock("../../models/run", () => ({ Run: mockRuns }));
jest.mock("../../models/runEvent", () => ({ RunEvent: mockEvents }));
jest.mock("../../models/runArtifact", () => ({ RunArtifact: mockArtifacts }));
jest.mock("../../utils/fde/studioRunService", () => ({
  createStudioRun: (...args) => mockCreateStudioRun(...args),
  queueStudioRun: (...args) => mockQueueStudioRun(...args),
  resumeStudioRun: (...args) => mockResumeStudioRun(...args),
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
  require("../../endpoints/fdeRuns").fdeRunEndpoints(app);
  return registered;
}

function response(overrides = {}) {
  const result = mockResponse();
  result.locals = {
    user: { id: 12, role: "manager" },
    multiUserMode: true,
    ...overrides,
  };
  return result;
}

describe("FDE run API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.workspaces.findUnique.mockResolvedValue({
      id: 7,
      slug: "clinic-a",
    });
    mockAuthorize.mockResolvedValue({ ok: true });
    mockDrafts.getInWorkspace.mockResolvedValue({
      id: "draft-a",
      workspaceId: 7,
      status: "published",
      lineageKey: "lineage-a",
      engine: "mastra",
    });
    mockRuns.getById.mockResolvedValue({
      id: "run-a",
      workspaceId: 7,
      fdeWorkflowDraftId: "draft-a",
      engine: "mastra",
      status: "running",
    });
    mockCreateStudioRun.mockResolvedValue({ id: "run-a", status: "queued" });
    mockQueueStudioRun.mockResolvedValue(undefined);
    mockResumeStudioRun.mockResolvedValue({ id: "run-a", status: "running" });
    mockEvents.listByRun.mockResolvedValue([{ id: "event-a" }]);
    mockArtifacts.listByRun.mockResolvedValue([{ id: "artifact-a" }]);
    mockRuns.updateStatus.mockResolvedValue({
      id: "run-a",
      status: "cancelled",
    });
  });

  it("registers create, detail, events, artifacts, cancel, and resume", () => {
    expect(Object.keys(routes()).sort()).toEqual([
      "GET /workspace/:slug/fde-runs/:runId",
      "GET /workspace/:slug/fde-runs/:runId/artifacts",
      "GET /workspace/:slug/fde-runs/:runId/events",
      "POST /workspace/:slug/fde-runs/:runId/cancel",
      "POST /workspace/:slug/fde-runs/:runId/resume",
      "POST /workspace/:slug/fde-workflows/:id/runs",
    ]);
  });

  it("creates an explicit-engine manual run from a published workspace draft", async () => {
    const res = response();
    const inputs = { patient_alias: "P-001", visit_note: "Follow up." };

    await routes()["POST /workspace/:slug/fde-workflows/:id/runs"].handler(
      mockRequest({
        params: { slug: "clinic-a", id: "draft-a" },
        body: { inputs },
      }),
      res
    );

    expect(mockCreateStudioRun).toHaveBeenCalledWith({
      draft: expect.objectContaining({ id: "draft-a" }),
      workspace: { id: 7, slug: "clinic-a" },
      inputs,
      actor: { id: 12, role: "manager" },
      engine: "mastra",
    });
    expect(mockQueueStudioRun).toHaveBeenCalledWith("run-a");
    expect(res.status).toHaveBeenCalledWith(202);
  });

  it("rejects an unpublished draft before creating a run", async () => {
    mockDrafts.getInWorkspace.mockResolvedValue({
      id: "draft-a",
      workspaceId: 7,
      status: "ready",
    });
    const res = response();

    await routes()["POST /workspace/:slug/fde-workflows/:id/runs"].handler(
      mockRequest({
        params: { slug: "clinic-a", id: "draft-a" },
        body: { inputs: {} },
      }),
      res
    );

    expect(res.status).toHaveBeenCalledWith(409);
    expect(mockCreateStudioRun).not.toHaveBeenCalled();
  });

  it.each([
    [
      "GET /workspace/:slug/fde-runs/:runId",
      mockEvents.listByRun,
      mockArtifacts.listByRun,
    ],
    [
      "GET /workspace/:slug/fde-runs/:runId/events",
      mockEvents.listByRun,
      mockArtifacts.listByRun,
    ],
    [
      "GET /workspace/:slug/fde-runs/:runId/artifacts",
      mockArtifacts.listByRun,
      mockEvents.listByRun,
    ],
    [
      "POST /workspace/:slug/fde-runs/:runId/cancel",
      mockRuns.updateStatus,
      mockEvents.listByRun,
    ],
    [
      "POST /workspace/:slug/fde-runs/:runId/resume",
      mockResumeStudioRun,
      mockEvents.listByRun,
    ],
  ])("hides a foreign run through %s", async (key, forbidden, other) => {
    mockRuns.getById.mockResolvedValue({
      id: "run-a",
      workspaceId: 8,
      fdeWorkflowDraftId: "draft-a",
    });
    const res = response();

    await routes()[key].handler(
      mockRequest({ params: { slug: "clinic-a", runId: "run-a" }, body: {} }),
      res
    );

    expect(res.status).toHaveBeenCalledWith(404);
    expect(forbidden).not.toHaveBeenCalled();
    expect(other).not.toHaveBeenCalled();
  });

  it("returns events and artifacts only after workspace-scoped run resolution", async () => {
    const registered = routes();
    const events = response();
    const artifacts = response();
    await registered["GET /workspace/:slug/fde-runs/:runId/events"].handler(
      mockRequest({ params: { slug: "clinic-a", runId: "run-a" } }),
      events
    );
    await registered["GET /workspace/:slug/fde-runs/:runId/artifacts"].handler(
      mockRequest({ params: { slug: "clinic-a", runId: "run-a" } }),
      artifacts
    );
    expect(mockEvents.listByRun).toHaveBeenCalledWith("run-a");
    expect(mockArtifacts.listByRun).toHaveBeenCalledWith("run-a");
  });

  it("cancels and resumes through stable Studio-owned operations", async () => {
    const registered = routes();
    await registered["POST /workspace/:slug/fde-runs/:runId/cancel"].handler(
      mockRequest({ params: { slug: "clinic-a", runId: "run-a" }, body: {} }),
      response()
    );
    await registered["POST /workspace/:slug/fde-runs/:runId/resume"].handler(
      mockRequest({ params: { slug: "clinic-a", runId: "run-a" }, body: {} }),
      response()
    );
    expect(mockRuns.updateStatus).toHaveBeenCalledWith("run-a", "cancelled");
    expect(mockEvents.append).toHaveBeenCalledWith({
      runId: "run-a",
      type: "status.cancelled",
      payload: {},
    });
    expect(mockResumeStudioRun).toHaveBeenCalledWith("run-a");
  });
});
