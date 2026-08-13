process.env.NODE_ENV = "test";

const { mockRequest, mockResponse } = require("../utils/testHelpers");

jest.mock("../../utils/http", () => ({
  reqBody: (req) => req.body,
  userFromSession: async () => ({ id: 123 }),
  multiUserMode: () => false,
}));

const mockAssistantTemplateUpdate = jest.fn(async (id, updates) => ({
  template: { id, name: updates?.name || "Updated Template" },
  message: null,
}));

jest.mock("../../models/assistantTemplate", () => ({
  AssistantTemplate: {
    update: (...args) => mockAssistantTemplateUpdate(...args),
  },
}));

const mockEventLogsLogEvent = jest.fn(async () => true);
jest.mock("../../models/eventLogs", () => ({
  EventLogs: {
    logEvent: (...args) => mockEventLogsLogEvent(...args),
  },
}));

const mockRefreshAssistants = jest.fn(async () => true);
jest.mock("../../utils/office/singleton", () => ({
  getOfficeProjection: jest.fn(() => ({
    refreshAssistants: (...args) => mockRefreshAssistants(...args),
  })),
}));

describe("Assistant Library template update", () => {
  beforeEach(() => {
    mockAssistantTemplateUpdate.mockImplementation(async (id, updates) => ({
      template: { id, name: updates?.name || "Updated Template" },
      message: null,
    }));
    mockEventLogsLogEvent.mockResolvedValue(true);
    mockRefreshAssistants.mockResolvedValue(true);
  });

  it("refreshes OfficeProjection after updating a template", async () => {
    const routes = {};
    const app = {
      get: jest.fn(),
      post: jest.fn(),
      patch: jest.fn((path, middleware, handler) => {
        routes[`PATCH ${path}`] = { middleware, handler };
      }),
      put: jest.fn(),
      delete: jest.fn(),
    };

    const { assistantLibraryEndpoints } = require("../../endpoints/assistantLibrary");
    assistantLibraryEndpoints(app);

    const route = routes["PATCH /assistant-library/templates/:id"];
    expect(route).toBeDefined();

    const req = mockRequest({
      params: { id: "tpl_1" },
      body: { employeeName: "新名字", avatarUrl: "/new-avatar.jpg" },
    });
    const res = mockResponse();
    res.locals = { user: { id: 123 } };

    await route.handler(req, res);

    expect(mockAssistantTemplateUpdate).toHaveBeenCalledWith("tpl_1", {
      employeeName: "新名字",
      avatarUrl: "/new-avatar.jpg",
    });
    expect(mockRefreshAssistants).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
