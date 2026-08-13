const express = require("express");
const request = require("supertest");

jest.mock("../../utils/middleware/validatedRequest", () => ({
  validatedRequest: (_request, response, next) => {
    response.locals.multiUserMode = false;
    next();
  },
}));

const mockStatus = jest.fn();
const mockCapabilitySnapshot = jest.fn();
const mockMatrixStatus = jest.fn();
const mockMatrixArchetypes = jest.fn();
const mockListAgents = jest.fn();
const mockAskAgent = jest.fn();
const mockKmStatus = jest.fn();
const mockUploadTextFileToMolt = jest.fn();
const mockManualReconnect = jest.fn();
const mockGetValueOrFallback = jest.fn();
jest.mock("../../utils/molt/healthMonitor", () => ({
  MoltHealthMonitor: {
    getInstance: () => ({
      status: mockStatus,
      manualReconnect: mockManualReconnect,
      client: {
        capabilitySnapshot: mockCapabilitySnapshot,
        matrixStatus: mockMatrixStatus,
        matrixArchetypes: mockMatrixArchetypes,
      },
    }),
  },
}));
jest.mock("../../utils/molt/broker", () => ({
  getMoltBroker: () => ({
    listAgents: mockListAgents,
    askAgent: mockAskAgent,
  }),
}));
jest.mock("../../utils/molt/kmBridge", () => ({
  createKmBridge: () => ({
    status: mockKmStatus,
  }),
}));
jest.mock("../../utils/molt/filesBridge", () => ({
  uploadTextFileToMolt: (...args) => mockUploadTextFileToMolt(...args),
}));
jest.mock("../../models/systemSettings", () => ({
  SystemSettings: {
    getValueOrFallback: (...args) => mockGetValueOrFallback(...args),
  },
}));
jest.mock("../../models/eventLogs", () => ({
  EventLogs: {
    logEvent: jest.fn(),
  },
}));

describe("Molt endpoints", () => {
  beforeEach(() => {
    mockStatus.mockReturnValue({
      state: "CONNECTED",
      lastCheckedAt: "2026-05-05T00:00:00.000Z",
      version: "1.2.3",
      capabilities: ["agents"],
      error: null,
    });
    mockCapabilitySnapshot.mockResolvedValue({
      catalog: { tools: [{ toolId: "sessions_list" }] },
      state: { km: { configured: false } },
    });
    mockMatrixStatus.mockResolvedValue({
      state: "initialized",
      matrixAgent: { id: "molt-matrix" },
    });
    mockMatrixArchetypes.mockResolvedValue({
      data: [{ id: "pm", label: "PM" }],
    });
    mockListAgents.mockResolvedValue({
      success: true,
      agents: [{ id: "main", name: "Main Agent" }],
    });
    mockAskAgent.mockResolvedValue({
      success: true,
      answer: "Molt answer",
      conversationId: "conv-1",
    });
    mockKmStatus.mockResolvedValue({
      success: true,
      km: { configured: false, knowledgeBases: [] },
    });
    mockUploadTextFileToMolt.mockResolvedValue({
      success: true,
      upload: { upload_id: "upload-1", filename: "notes.md" },
    });
    mockManualReconnect.mockResolvedValue({
      state: "CONNECTED",
      lastCheckedAt: "2026-05-05T00:01:00.000Z",
      version: "1.2.4",
      capabilities: ["agents", "km"],
      error: null,
    });
    mockGetValueOrFallback.mockImplementation(async ({ label }, fallback) => {
      if (label === "MOLT_ADMIN_TOKEN") return null;
      if (label === "MOLT_DASHBOARD_URL") return "http://molt.local";
      return fallback;
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test("GET /molt/status returns current monitor status", async () => {
    const { moltEndpoints } = require("../../endpoints/molt");
    const app = express();
    moltEndpoints(app);

    const response = await request(app).get("/molt/status").expect(200);

    expect(response.body).toEqual({
      success: true,
      state: "CONNECTED",
      lastCheckedAt: "2026-05-05T00:00:00.000Z",
      version: "1.2.3",
      capabilities: ["agents"],
      error: null,
      hasAdminToken: false,
      dashboardUrl: "http://molt.local",
      matrixState: "unknown",
      agentCount: 0,
    });
  });

  test("POST /molt/reconnect triggers manual monitor reconnect", async () => {
    const { moltEndpoints } = require("../../endpoints/molt");
    const app = express();
    moltEndpoints(app);

    const response = await request(app).post("/molt/reconnect").expect(200);

    expect(response.body).toEqual({
      success: true,
      state: "CONNECTED",
      lastCheckedAt: "2026-05-05T00:01:00.000Z",
      version: "1.2.4",
      capabilities: ["agents", "km"],
      error: null,
    });
    expect(mockManualReconnect).toHaveBeenCalledTimes(1);
  });

  test("GET /molt/capability proxies the Molt capability snapshot", async () => {
    const { moltEndpoints } = require("../../endpoints/molt");
    const app = express();
    moltEndpoints(app);

    const response = await request(app).get("/molt/capability").expect(200);

    expect(response.body).toEqual({
      success: true,
      capability: {
        catalog: { tools: [{ toolId: "sessions_list" }] },
        state: { km: { configured: false } },
      },
    });
    expect(mockCapabilitySnapshot).toHaveBeenCalledTimes(1);
  });

  test("GET /molt/mission-control/status proxies matrix status", async () => {
    const { moltEndpoints } = require("../../endpoints/molt");
    const app = express();
    moltEndpoints(app);

    const response = await request(app)
      .get("/molt/mission-control/status")
      .expect(200);

    expect(response.body).toEqual({
      success: true,
      status: {
        state: "initialized",
        matrixAgent: { id: "molt-matrix" },
      },
    });
    expect(mockMatrixStatus).toHaveBeenCalledWith({ includeAgents: true });
  });

  test("GET /molt/mission-control/archetypes proxies archetype catalog", async () => {
    const { moltEndpoints } = require("../../endpoints/molt");
    const app = express();
    moltEndpoints(app);

    const response = await request(app)
      .get("/molt/mission-control/archetypes")
      .expect(200);

    expect(response.body).toEqual({
      success: true,
      archetypes: [{ id: "pm", label: "PM" }],
    });
    expect(mockMatrixArchetypes).toHaveBeenCalledTimes(1);
  });

  test("GET /molt/agents returns broker-visible agents", async () => {
    const { moltEndpoints } = require("../../endpoints/molt");
    const app = express();
    moltEndpoints(app);

    const response = await request(app).get("/molt/agents").expect(200);

    expect(response.body).toEqual({
      success: true,
      agents: [{ id: "main", name: "Main Agent" }],
    });
    expect(mockListAgents).toHaveBeenCalledTimes(1);
  });

  test("POST /molt/agents/:agentId/chat sends a broker chat request", async () => {
    const { moltEndpoints } = require("../../endpoints/molt");
    const app = express();
    app.use(express.json());
    moltEndpoints(app);

    const response = await request(app)
      .post("/molt/agents/main/chat")
      .send({ message: "hello", conversationId: "conv-0" })
      .expect(200);

    expect(response.body).toEqual({
      success: true,
      answer: "Molt answer",
      conversationId: "conv-1",
    });
    expect(mockAskAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: "main",
        message: "hello",
        conversationId: "conv-0",
      })
    );
  });

  test("GET /molt/km/status returns normalized KM bridge status", async () => {
    const { moltEndpoints } = require("../../endpoints/molt");
    const app = express();
    moltEndpoints(app);

    const response = await request(app).get("/molt/km/status").expect(200);

    expect(response.body).toEqual({
      success: true,
      km: { configured: false, knowledgeBases: [] },
    });
    expect(mockKmStatus).toHaveBeenCalledTimes(1);
  });

  test("POST /molt/files/upload-text uploads text content to Molt", async () => {
    const { moltEndpoints } = require("../../endpoints/molt");
    const app = express();
    app.use(express.json());
    moltEndpoints(app);

    const response = await request(app)
      .post("/molt/files/upload-text")
      .send({
        agentId: "main",
        filename: "notes.md",
        content: "hello",
      })
      .expect(200);

    expect(response.body).toEqual({
      success: true,
      upload: { upload_id: "upload-1", filename: "notes.md" },
    });
    expect(mockUploadTextFileToMolt).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: "main",
        filename: "notes.md",
        content: "hello",
      })
    );
  });
});
