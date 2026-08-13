process.env.NODE_ENV = "test";

const { mockRequest, mockResponse } = require("../utils/testHelpers");

const mockCalls = [];

jest.mock("../../utils/skills", () => ({
  skillRegistry: {
    refreshFromSkillHubLocalRegistry: jest.fn(async () => {
      mockCalls.push("refresh");
      return { loaded: 1 };
    }),
    listSkillMetadata: jest.fn(() => {
      mockCalls.push("list");
      return [
        {
          id: "builtin:docx",
          name: "Word 文档处理",
          description: "demo",
          category: "document",
          icon: "📝",
        },
      ];
    }),
    getCategories: jest.fn(() => {
      mockCalls.push("categories");
      return ["document"];
    }),
  },
}));

describe("Assistant Library skills endpoint", () => {
  it("refreshes Skill Hub markdown skills before listing metadata", async () => {
    const routes = {};
    const app = {
      get: jest.fn((path, middleware, handler) => {
        routes[`GET ${path}`] = { middleware, handler };
      }),
      post: jest.fn(),
      patch: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
    };

    const { assistantLibraryEndpoints } = require("../../endpoints/assistantLibrary");
    assistantLibraryEndpoints(app);

    const route = routes["GET /assistant-library/skills"];
    expect(route).toBeDefined();

    const req = mockRequest();
    const res = mockResponse();

    await route.handler(req, res);

    const { skillRegistry } = require("../../utils/skills");
    expect(skillRegistry.refreshFromSkillHubLocalRegistry).toHaveBeenCalledTimes(1);
    expect(skillRegistry.listSkillMetadata).toHaveBeenCalledTimes(1);
    expect(skillRegistry.getCategories).toHaveBeenCalledTimes(1);

    expect(mockCalls[0]).toBe("refresh");
    expect(mockCalls).toEqual(["refresh", "list", "categories"]);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          skills: expect.any(Array),
          categories: expect.any(Array),
          total: expect.any(Number),
        }),
      })
    );
  });
});
