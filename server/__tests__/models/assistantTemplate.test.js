/**
 * AssistantTemplate 模型单元测试
 * 使用 mock 避免实际数据库操作
 */

const { AssistantTemplate } = require("../../models/assistantTemplate");

// Mock Prisma
jest.mock("../../utils/prisma", () => ({
  assistant_templates: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
}));

const prisma = require("../../utils/prisma");

describe("AssistantTemplate Model", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("writable fields", () => {
    it("should have correct writable fields defined", () => {
      expect(AssistantTemplate.writable).toContain("name");
      expect(AssistantTemplate.writable).toContain("description");
      expect(AssistantTemplate.writable).toContain("category");
      expect(AssistantTemplate.writable).toContain("systemPrompt");
      expect(AssistantTemplate.writable).toContain("tags");
      expect(AssistantTemplate.writable).toContain("skills");
    });
  });

  describe("create", () => {
    it("should create a new template with default values", async () => {
      const mockTemplate = {
        id: "test-uuid",
        name: "未命名助手",
        description: "",
        category: "通用",
        tags: null,
        isGlobal: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      prisma.assistant_templates.create.mockResolvedValue(mockTemplate);

      const result = await AssistantTemplate.create({});

      expect(result.template).toBeDefined();
      expect(result.message).toBeNull();
      expect(prisma.assistant_templates.create).toHaveBeenCalledTimes(1);
    });

    it("should create a template with custom data", async () => {
      const customData = {
        name: "测试助手",
        description: "这是一个测试助手",
        category: "营销",
        tags: ["SEO", "内容"],
      };

      const mockTemplate = {
        id: "test-uuid",
        ...customData,
        tags: JSON.stringify(customData.tags),
        isGlobal: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      prisma.assistant_templates.create.mockResolvedValue(mockTemplate);

      const result = await AssistantTemplate.create(customData);

      expect(result.template).toBeDefined();
      expect(result.template.name).toBe("测试助手");
      expect(result.message).toBeNull();
    });

    it("should handle creation error", async () => {
      prisma.assistant_templates.create.mockRejectedValue(
        new Error("Database error")
      );

      const result = await AssistantTemplate.create({});

      expect(result.template).toBeNull();
      expect(result.message).toBe("Database error");
    });
  });

  describe("get", () => {
    it("should return template by ID", async () => {
      const mockTemplate = {
        id: "test-uuid",
        name: "测试助手",
        tags: "[]",
        skills: "[]",
      };

      prisma.assistant_templates.findUnique.mockResolvedValue(mockTemplate);

      const result = await AssistantTemplate.get("test-uuid");

      expect(result).toBeDefined();
      expect(result.id).toBe("test-uuid");
      expect(prisma.assistant_templates.findUnique).toHaveBeenCalledWith({
        where: { id: "test-uuid" },
      });
    });

    it("should return null for non-existent template", async () => {
      prisma.assistant_templates.findUnique.mockResolvedValue(null);

      const result = await AssistantTemplate.get("non-existent");

      expect(result).toBeNull();
    });
  });

  describe("_formatTemplate", () => {
    it("should parse JSON fields correctly", () => {
      const rawTemplate = {
        id: "test-uuid",
        name: "测试",
        tags: '["tag1", "tag2"]',
        skills: '["skill1"]',
        internalRoles: null,
        defaultTools: null,
        defaultMCPServers: null,
        platformConfig: null,
        workExperience: "[]",
        certifications: "[]",
      };

      const formatted = AssistantTemplate._formatTemplate(rawTemplate);

      expect(formatted.tags).toEqual(["tag1", "tag2"]);
      expect(formatted.skills).toEqual(["skill1"]);
      expect(formatted.internalRoles).toEqual([]);
    });

    it("should handle already parsed objects", () => {
      const rawTemplate = {
        id: "test-uuid",
        tags: ["already", "parsed"],
        skills: [],
      };

      const formatted = AssistantTemplate._formatTemplate(rawTemplate);

      expect(formatted.tags).toEqual(["already", "parsed"]);
    });

    it("should return null for null input", () => {
      const result = AssistantTemplate._formatTemplate(null);
      expect(result).toBeNull();
    });
  });
});

