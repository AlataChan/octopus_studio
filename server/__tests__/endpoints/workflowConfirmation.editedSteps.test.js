"use strict";

const express = require("express");
const request = require("supertest");

const mockWorkspaceGet = jest.fn();
const mockConfirmationGet = jest.fn();
const mockApprove = jest.fn();
const mockResume = jest.fn();
const mockCreateOrchestrationResumeService = jest.fn();

jest.mock("../../utils/middleware/validatedRequest", () => ({
  validatedRequest: (_request, response, next) => {
    response.locals.multiUserMode = false;
    next();
  },
}));

jest.mock("../../utils/http", () => ({
  multiUserMode: () => false,
  reqBody: (request) => request.body || {},
}));

jest.mock("../../models/workspace", () => ({
  Workspace: {
    get: (...args) => mockWorkspaceGet(...args),
  },
}));

jest.mock("../../models/workflowPendingConfirmation", () => ({
  WorkflowPendingConfirmation: {
    get: (...args) => mockConfirmationGet(...args),
    listPending: jest.fn(),
    approve: (...args) => mockApprove(...args),
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

jest.mock("../../utils/agents/orchestration/orchestrationResumeService", () => ({
  shouldResumeTeam: (confirmation) => {
    const details =
      typeof confirmation?.planDetails === "string"
        ? JSON.parse(confirmation.planDetails)
        : confirmation?.planDetails || {};
    return details.kind === "team_step";
  },
  createOrchestrationResumeService: (...args) =>
    mockCreateOrchestrationResumeService(...args),
}));

jest.mock("../../utils/agents/orchestration/teamOrchestrationService", () => ({
  TeamOrchestrationService: jest.fn(),
  defaultRunStore: jest.fn(() => ({})),
}));

jest.mock("../../models/workspaceAssistant", () => ({
  WorkspaceAssistant: {
    forWorkspace: jest.fn().mockResolvedValue([]),
  },
}));

jest.mock("../../models/workspaceChats", () => ({
  WorkspaceChats: {
    new: jest.fn(),
  },
}));

jest.mock("../../utils/agents/orchestration/planner", () => ({
  buildPlannerGenerate: jest.fn(() => jest.fn()),
}));

function buildApp() {
  const { workflowConfirmationEndpoints } = require("../../endpoints/workflowConfirmation");
  const app = express();
  const apiRouter = express.Router();
  app.use(express.json());
  app.use("/api", apiRouter);
  workflowConfirmationEndpoints(apiRouter);
  return app;
}

describe("workflow confirmation approve editedSteps", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWorkspaceGet.mockResolvedValue({ id: 7, slug: "demo" });
    mockConfirmationGet.mockResolvedValue({
      id: 42,
      workspaceId: 7,
      planDetails: JSON.stringify({
        kind: "team_step",
        stepId: "plan",
        orchestrationRunId: "run-1",
      }),
    });
    mockApprove.mockResolvedValue(true);
    mockResume.mockResolvedValue({ handled: true });
    mockCreateOrchestrationResumeService.mockReturnValue({
      resume: mockResume,
    });
  });

  it("passes editedSteps from reqBody into team resume", async () => {
    const app = buildApp();
    const editedSteps = [{ assistantId: "a-1", subtask: "edited task" }];

    await request(app)
      .post("/api/workspace/demo/confirmations/42/approve")
      .send({ userResponse: "approved", editedSteps })
      .expect(200);

    expect(mockResume).toHaveBeenCalledWith(42, { editedSteps });
  });

  it("uses empty resume opts when editedSteps is absent", async () => {
    const app = buildApp();

    await request(app)
      .post("/api/workspace/demo/confirmations/42/approve")
      .send({ userResponse: "approved" })
      .expect(200);

    expect(mockResume).toHaveBeenCalledWith(42, {});
  });
});
