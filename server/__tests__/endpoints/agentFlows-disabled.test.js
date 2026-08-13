const express = require("express");
const request = require("supertest");

jest.mock("../../utils/middleware/validatedRequest", () => ({
  validatedRequest: (_request, _response, next) => next(),
}));

jest.mock("../../utils/middleware/multiUserProtected", () => ({
  ROLES: { admin: "admin" },
  flexUserRoleValid: () => (_request, _response, next) => next(),
}));

jest.mock("../../utils/agentFlows", () => ({
  AgentFlows: {
    saveFlow: jest.fn(),
    listFlows: jest.fn(),
    loadFlow: jest.fn(),
    deleteFlow: jest.fn(),
  },
}));

jest.mock("../../models/telemetry", () => ({
  Telemetry: {
    sendTelemetry: jest.fn(),
  },
}));

const originalAgentFlowRunEnabled = process.env.AGENT_FLOW_RUN_ENABLED;

function buildApp({ runEnabled } = {}) {
  jest.resetModules();

  if (typeof runEnabled === "undefined") {
    delete process.env.AGENT_FLOW_RUN_ENABLED;
  } else {
    process.env.AGENT_FLOW_RUN_ENABLED = runEnabled ? "true" : "false";
  }

  const { agentFlowEndpoints } = require("../../endpoints/agentFlows");
  const app = express();
  app.use(express.json());
  agentFlowEndpoints(app);
  return app;
}

describe("agent flow run endpoints", () => {
  afterEach(() => {
    if (typeof originalAgentFlowRunEnabled === "undefined") {
      delete process.env.AGENT_FLOW_RUN_ENABLED;
    } else {
      process.env.AGENT_FLOW_RUN_ENABLED = originalAgentFlowRunEnabled;
    }
    jest.clearAllMocks();
  });

  test.each([
    "/agent-flows/flow-1/run",
    "/agent-flows/flow-1/test-run",
    "/agent-flows/flow-1/execute",
    "/agent-flows/public-run",
  ])("returns a disabled response for %s", async (route) => {
    const app = buildApp({ runEnabled: false });

    const response = await request(app).post(route).send({}).expect(404);

    expect(response.body).toEqual({
      success: false,
      error: "Feature not enabled",
      code: "AGENT_FLOW_RUN_DISABLED",
    });
  });

  test("returns not implemented when explicitly enabled", async () => {
    const app = buildApp({ runEnabled: true });

    const response = await request(app)
      .post("/agent-flows/flow-1/run")
      .send({})
      .expect(501);

    expect(response.body).toEqual({
      success: false,
      error: "Agent flow run not yet implemented in this build",
      code: "AGENT_FLOW_RUN_NOT_IMPLEMENTED",
    });
  });
});
