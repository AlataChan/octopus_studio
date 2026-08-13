const express = require("express");
const request = require("supertest");

const mockUpdateSettings = jest.fn();
const mockGetSetting = jest.fn();
const mockVideoUnderstandingSettings = jest.fn();
const mockTestVideoConnection = jest.fn();

jest.mock("../../models/systemSettings", () => ({
  SystemSettings: {
    publicFields: [
      "video_understanding_provider",
      "video_understanding_base_url",
      "video_understanding_model",
      "video_understanding_api_key",
    ],
    updateSettings: (...args) => mockUpdateSettings(...args),
    get: (...args) => mockGetSetting(...args),
    videoUnderstandingSettings: (...args) =>
      mockVideoUnderstandingSettings(...args),
  },
}));

jest.mock("../../utils/VideoProviders/testConnection", () => ({
  testVideoUnderstandingConnection: (...args) =>
    mockTestVideoConnection(...args),
}));

jest.mock("../../utils/middleware/validatedRequest", () => ({
  validatedRequest: (_request, response, next) => {
    response.locals.multiUserMode = true;
    response.locals.user = { id: 1, role: "admin" };
    next();
  },
}));

jest.mock("../../utils/middleware/multiUserProtected", () => ({
  ROLES: { admin: "admin", manager: "manager", all: "all" },
  flexUserRoleValid: () => (_request, _response, next) => next(),
  strictMultiUserRoleValid: () => (_request, _response, next) => next(),
  isMultiUserSetup: jest.fn(() => true),
}));

jest.mock("../../utils/http", () => ({
  reqBody: (request) => request.body,
  safeJsonParse: (value, fallback = null) => {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  },
  userFromSession: jest.fn(),
}));

jest.mock("../../models/apiKeys", () => ({ ApiKey: {} }));
jest.mock("../../models/documents", () => ({ Document: {} }));
jest.mock("../../models/eventLogs", () => ({ EventLogs: {} }));
jest.mock("../../models/invite", () => ({ Invite: {} }));
jest.mock("../../models/telemetry", () => ({ Telemetry: {} }));
jest.mock("../../models/user", () => ({ User: {} }));
jest.mock("../../models/vectors", () => ({ DocumentVectors: {} }));
jest.mock("../../models/workspace", () => ({ Workspace: {} }));
jest.mock("../../models/workspaceChats", () => ({ WorkspaceChats: {} }));
jest.mock("../../utils/helpers", () => ({
  getEmbeddingEngineSelection: jest.fn(),
  getVectorDbClass: jest.fn(),
}));
jest.mock("../../utils/helpers/admin", () => ({
  canModifyAdmin: jest.fn(),
  validCanModify: jest.fn(),
  validRoleSelection: jest.fn(),
}));
jest.mock("../../utils/agents/imported", () => ({}));
jest.mock("../../utils/middleware/simpleSSOEnabled", () => ({
  simpleSSOLoginDisabledMiddleware: (_request, _response, next) => next(),
}));

const { adminEndpoints } = require("../../endpoints/admin");

function buildApp() {
  const app = express();
  app.use(express.json());
  adminEndpoints(app);
  return app;
}

describe("admin system preferences endpoint", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSetting.mockResolvedValue(null);
    mockVideoUnderstandingSettings.mockResolvedValue({
      enabled: false,
      provider: "moonshot",
      baseUrl: "https://api.moonshot.ai/v1",
      model: "kimi-k2.6",
      apiKey: "",
    });
  });

  test("returns validation feedback from SystemSettings.updateSettings", async () => {
    mockUpdateSettings.mockResolvedValue({
      success: false,
      error: "MOLT_BASE_URL must be a valid http(s) URL.",
    });

    const response = await request(buildApp())
      .post("/admin/system-preferences")
      .send({ MOLT_BASE_URL: "not a url" })
      .expect(200);

    expect(response.body).toEqual({
      success: false,
      error: "MOLT_BASE_URL must be a valid http(s) URL.",
    });
    expect(mockUpdateSettings).toHaveBeenCalledWith({
      MOLT_BASE_URL: "not a url",
    });
  });

  test("returns video understanding preferences with masked API key", async () => {
    mockVideoUnderstandingSettings.mockResolvedValue({
      enabled: true,
      provider: "moonshot",
      baseUrl: "https://api.moonshot.cn/v1",
      model: "kimi-k2.6",
      apiKey: "********************",
    });

    const response = await request(buildApp())
      .get(
        "/admin/system-preferences-for?labels=video_understanding_provider,video_understanding_base_url,video_understanding_model,video_understanding_api_key"
      )
      .expect(200);

    expect(response.body.settings).toEqual({
      video_understanding_provider: "moonshot",
      video_understanding_base_url: "https://api.moonshot.cn/v1",
      video_understanding_model: "kimi-k2.6",
      video_understanding_api_key: "********************",
    });
  });

  test("tests video understanding connection with submitted settings", async () => {
    mockTestVideoConnection.mockResolvedValue({
      ok: true,
      summary: { transcript: "fixture transcript", keyObservations: [] },
    });

    const body = {
      provider: "moonshot",
      baseUrl: "https://api.moonshot.cn/v1",
      model: "kimi-k2.6",
      apiKey: "sk-test",
    };

    const response = await request(buildApp())
      .post("/admin/video-understanding/test")
      .send(body)
      .expect(200);

    expect(response.body).toEqual({
      ok: true,
      summary: { transcript: "fixture transcript", keyObservations: [] },
    });
    expect(mockTestVideoConnection).toHaveBeenCalledWith(body);
  });
});
