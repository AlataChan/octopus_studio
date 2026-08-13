const express = require("express");
const request = require("supertest");

const mockCount = jest.fn();

jest.mock("../../utils/prisma", () => ({
  experiment_assignments: {
    count: (...args) => mockCount(...args),
  },
}));

jest.mock("../../utils/middleware/validatedRequest", () => ({
  validatedRequest: (_request, _response, next) => next(),
}));

const originalExperimentLabel = process.env.EXPERIMENT_LABEL;
const originalExperimentsAdminEnabled =
  process.env.EXPERIMENTS_ADMIN_ENABLED;

function restoreEnv() {
  if (typeof originalExperimentLabel === "undefined") {
    delete process.env.EXPERIMENT_LABEL;
  } else {
    process.env.EXPERIMENT_LABEL = originalExperimentLabel;
  }

  if (typeof originalExperimentsAdminEnabled === "undefined") {
    delete process.env.EXPERIMENTS_ADMIN_ENABLED;
  } else {
    process.env.EXPERIMENTS_ADMIN_ENABLED = originalExperimentsAdminEnabled;
  }
}

function loadExperimentAssignment() {
  jest.resetModules();
  return require("../../models/experimentAssignment").ExperimentAssignment;
}

describe("experiment labels and admin gate", () => {
  afterEach(() => {
    restoreEnv();
    jest.clearAllMocks();
  });

  test("uses default_experiment when EXPERIMENT_LABEL is unset", () => {
    delete process.env.EXPERIMENT_LABEL;
    const ExperimentAssignment = loadExperimentAssignment();

    expect(ExperimentAssignment.Experiments.DEFAULT).toBe(
      "default_experiment"
    );
  });

  test("uses EXPERIMENT_LABEL when provided", () => {
    process.env.EXPERIMENT_LABEL = "custom-2026-q2";
    const ExperimentAssignment = loadExperimentAssignment();

    expect(ExperimentAssignment.Experiments.DEFAULT).toBe("custom-2026-q2");
  });

  test("metrics admin endpoints return disabled response when gate is off", async () => {
    process.env.EXPERIMENTS_ADMIN_ENABLED = "false";
    jest.resetModules();

    const { metricsEndpoints } = require("../../endpoints/metrics");
    const app = express();
    app.use(express.json());
    metricsEndpoints(app);

    const response = await request(app)
      .get("/metrics/ab-test/assignments")
      .expect(404);

    expect(response.body).toEqual({
      success: false,
      error: "Experiments admin not enabled",
      code: "EXPERIMENTS_ADMIN_DISABLED",
    });
  });

  test("metrics admin endpoints allow disabled preflight requests", async () => {
    process.env.EXPERIMENTS_ADMIN_ENABLED = "false";
    jest.resetModules();

    const { metricsEndpoints } = require("../../endpoints/metrics");
    const app = express();
    app.use(express.json());
    metricsEndpoints(app);

    await request(app)
      .options("/metrics/chat-stats")
      .set("Origin", "http://localhost:3000")
      .set("Access-Control-Request-Method", "GET")
      .expect(204);
  });

  test("legacy kdio_mvp assignments are still readable", async () => {
    mockCount.mockResolvedValueOnce(3).mockResolvedValueOnce(7);

    const ExperimentAssignment = loadExperimentAssignment();
    const stats = await ExperimentAssignment.getStats("kdio_mvp");

    expect(stats.experiment).toBe("kdio_mvp");
    expect(stats.total).toBe(10);
    expect(stats.variants).toEqual({
      with_knowledge: 3,
      without_knowledge: 7,
    });
  });
});
