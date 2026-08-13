process.env.NODE_ENV = "test";

const { mockRequest, mockResponse } = require("../utils/testHelpers");

jest.mock("../../utils/http", () => ({
  reqBody: (req) => req.body,
  userFromSession: async () => ({ id: 123 }),
  multiUserMode: () => false,
}));

const mockAssistantTemplateCreate = jest.fn(async (data) => ({
  template: { id: "tpl_1", name: data?.name || "Template" },
  message: null,
}));

jest.mock("../../models/assistantTemplate", () => ({
  AssistantTemplate: {
    create: (...args) => mockAssistantTemplateCreate(...args),
  },
}));

const mockEventLogsLogEvent = jest.fn(async () => true);
jest.mock("../../models/eventLogs", () => ({
  EventLogs: {
    logEvent: (...args) => mockEventLogsLogEvent(...args),
  },
}));

const presetFixture = {
  id: "preset_1",
  name: "Preset Template",
  description: "demo",
  icon: "🤖",
  category: "通用基础",
  tags: ["demo"],
  industry: "通用",
  systemPrompt: "hello",
  defaultTools: ["datetime-info"],
  defaultSkills: ["builtin:document-search"],
  recommendedModel: "openai:gpt-4o-mini",
  knowledgeModeTemplate: "workspace",
  employeeName: "Alice",
  employeeTitle: "Advisor",
};

const mockGetPresetById = jest.fn(() => presetFixture);

jest.mock("../../data/presetTemplates", () => ({
  getPresetById: (...args) => mockGetPresetById(...args),
  getPresetsByCategory: jest.fn(() => []),
  getAllCategories: jest.fn(() => []),
}));

describe("Assistant Library create-from-preset", () => {
  beforeEach(() => {
    // resetMocks=true wipes implementations; restore them here.
    mockAssistantTemplateCreate.mockImplementation(async (data) => ({
      template: { id: "tpl_1", name: data?.name || "Template" },
      message: null,
    }));
    mockEventLogsLogEvent.mockResolvedValue(true);
    mockGetPresetById.mockImplementation(() => presetFixture);
  });

  it("merges preset.defaultTools + preset.defaultSkills into defaultTools", async () => {
    const routes = {};
    const app = {
      get: jest.fn(),
      post: jest.fn((path, middleware, handler) => {
        routes[`POST ${path}`] = { middleware, handler };
      }),
      patch: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
    };

    const { assistantLibraryEndpoints } = require("../../endpoints/assistantLibrary");
    assistantLibraryEndpoints(app);

    const route = routes["POST /assistant-library/create-from-preset"];
    expect(route).toBeDefined();

    const req = mockRequest({
      body: { presetId: "preset_1", customizations: {} },
    });
    const res = mockResponse();
    res.locals = { user: { id: 123 } };

    await route.handler(req, res);

    expect(mockAssistantTemplateCreate).toHaveBeenCalledTimes(1);
    const payload = mockAssistantTemplateCreate.mock.calls[0][0] || {};
    const parsedDefaultTools = Array.isArray(payload.defaultTools)
      ? payload.defaultTools
      : [];
    expect(parsedDefaultTools).toEqual(
      expect.arrayContaining(["datetime-info", "builtin:document-search"])
    );

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.any(Object),
      })
    );
  });
});
