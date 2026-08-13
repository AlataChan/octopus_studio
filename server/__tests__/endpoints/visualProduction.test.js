const express = require("express");
const { Readable } = require("stream");
const request = require("supertest");

jest.mock("../../utils/visualProduction", () => {
  const mock = {
    isAvailable: jest.fn(),
    estimate: jest.fn(),
    resultStream: jest.fn(),
  };
  return { visualProductionClient: mock };
});

const mockFlexUserRoleValid = jest.fn(() => (_req, _res, next) => next());

jest.mock("../../utils/middleware/validatedRequest", () => ({
  validatedRequest: (_req, _res, next) => next(),
}));

jest.mock("../../utils/middleware/multiUserProtected", () => ({
  flexUserRoleValid: (...args) => mockFlexUserRoleValid(...args),
  ROLES: { all: "all", admin: "admin", manager: "manager" },
}));

const { visualProductionClient } = require("../../utils/visualProduction");
const { visualProductionEndpoints } = require("../../endpoints/visualProduction");

function makeApp() {
  const app = express();
  app.use(express.json());
  const apiRouter = express.Router();
  visualProductionEndpoints(apiRouter);
  app.use("/api", apiRouter);
  return app;
}

describe("/api/visual endpoints", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFlexUserRoleValid.mockImplementation(
      () => (_req, _res, next) => next()
    );
  });

  test("routes live under /api/visual (not /api/api/visual)", async () => {
    visualProductionClient.isAvailable.mockResolvedValue({ available: true });
    visualProductionClient.estimate.mockResolvedValue({ cost_cny: 0 });

    const ok = await request(makeApp())
      .post("/api/visual/estimate")
      .send({ task: "x" });
    expect(ok.status).toBe(200);

    const wrong = await request(makeApp())
      .post("/api/api/visual/estimate")
      .send({ task: "x" });
    expect(wrong.status).toBe(404);
  });

  test("503 when sidecar unavailable", async () => {
    visualProductionClient.isAvailable.mockResolvedValue({
      available: false,
      message: "down",
    });
    const res = await request(makeApp())
      .post("/api/visual/estimate")
      .send({ task: "x" });
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/unavailable/);
  });

  test("forwards estimate with only browser override key header", async () => {
    visualProductionClient.isAvailable.mockResolvedValue({ available: true });
    visualProductionClient.estimate.mockResolvedValue({ cost_cny: 1.5 });

    const res = await request(makeApp())
      .post("/api/visual/estimate")
      .set("X-Ark-Key", "ARKKEY")
      .send({ task: "image.poster.final" });

    expect(res.status).toBe(200);
    expect(res.body.cost_cny).toBe(1.5);
    const [, keys] = visualProductionClient.estimate.mock.calls[0];
    expect(keys.arkKey).toBe("ARKKEY");
  });

  test("rejects path traversal on results (raw and encoded)", async () => {
    visualProductionClient.isAvailable.mockResolvedValue({ available: true });

    const raw = await request(makeApp()).get(
      "/api/visual/results/../../etc/passwd"
    );
    expect([400, 404]).toContain(raw.status);

    const encoded = await request(makeApp()).get(
      "/api/visual/results/..%2f..%2fetc/passwd"
    );
    expect(encoded.status).toBe(400);
    expect(visualProductionClient.resultStream).not.toHaveBeenCalled();
  });

  test("passes through upstream result 404 instead of converting to 500", async () => {
    visualProductionClient.isAvailable.mockResolvedValue({ available: true });
    visualProductionClient.resultStream.mockRejectedValue({
      response: {
        status: 404,
        data: { error: "result not found" },
      },
    });

    const res = await request(makeApp()).get(
      "/api/visual/results/job-1/missing.png"
    );

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("result not found");
  });

  test("forwards result content headers from the sidecar stream", async () => {
    visualProductionClient.isAvailable.mockResolvedValue({ available: true });
    visualProductionClient.resultStream.mockResolvedValue({
      stream: Readable.from(["payload"]),
      headers: {
        "content-type": "image/png",
        "content-length": "7",
        "content-disposition": 'attachment; filename="out.png"',
      },
    });

    const res = await request(makeApp()).get(
      "/api/visual/results/job-1/out.png"
    );

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/image\/png/);
    expect(res.headers["content-length"]).toBe("7");
    expect(res.headers["content-disposition"]).toBe(
      'attachment; filename="out.png"'
    );
    expect((res.text || res.body.toString())).toBe("payload");
  });

  test("guards endpoints with admin/manager roles", () => {
    mockFlexUserRoleValid.mockClear();
    makeApp();
    const rolesArgs = mockFlexUserRoleValid.mock.calls.map((call) => call[0]);

    expect(rolesArgs.length).toBeGreaterThan(0);
    for (const roles of rolesArgs) {
      expect(roles).toEqual(["admin", "manager"]);
    }
  });
});
