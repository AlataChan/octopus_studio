/**
 * Workspace 模型单元测试
 * 测试工作区验证和核心方法
 */

const { Workspace } = require("../../models/workspace");

// Mock dependencies
jest.mock("../../utils/prisma", () => ({
  workspaces: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  workspace_users: {
    findMany: jest.fn(),
  },
  users: {
    findMany: jest.fn(),
  },
}));

jest.mock("../../models/documents", () => ({
  Document: { forWorkspace: jest.fn() },
}));

jest.mock("../../models/workspaceUsers", () => ({
  WorkspaceUser: {},
}));

jest.mock("../../models/user", () => ({
  User: { filterFields: jest.fn((u) => u) },
}));

jest.mock("../../models/promptHistory", () => ({
  PromptHistory: {},
}));

describe("Workspace Model", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("defaultPrompt", () => {
    it("should have a default prompt defined", () => {
      expect(Workspace.defaultPrompt).toBeDefined();
      expect(typeof Workspace.defaultPrompt).toBe("string");
      expect(Workspace.defaultPrompt.length).toBeGreaterThan(0);
    });
  });

  describe("writable fields", () => {
    it("should have correct writable fields", () => {
      expect(Workspace.writable).toContain("name");
      expect(Workspace.writable).toContain("openAiTemp");
      expect(Workspace.writable).toContain("chatProvider");
      expect(Workspace.writable).toContain("chatModel");
      expect(Workspace.writable).not.toContain("slug"); // slug 不可写
    });
  });

  describe("validations.name", () => {
    it("should return default name for invalid input", () => {
      expect(Workspace.validations.name(null)).toBe("My Workspace");
      expect(Workspace.validations.name(undefined)).toBe("My Workspace");
      expect(Workspace.validations.name(123)).toBe("My Workspace");
    });

    it("should truncate long names", () => {
      const longName = "a".repeat(300);
      const result = Workspace.validations.name(longName);
      expect(result.length).toBe(255);
    });

    it("should accept valid names", () => {
      expect(Workspace.validations.name("My Project")).toBe("My Project");
    });
  });

  describe("validations.openAiTemp", () => {
    it("should return null for invalid values", () => {
      expect(Workspace.validations.openAiTemp(null)).toBeNull();
      expect(Workspace.validations.openAiTemp(undefined)).toBeNull();
      expect(Workspace.validations.openAiTemp("abc")).toBeNull();
      expect(Workspace.validations.openAiTemp(-1)).toBeNull();
    });

    it("should accept valid temperature values", () => {
      expect(Workspace.validations.openAiTemp(0)).toBe(0);
      expect(Workspace.validations.openAiTemp(0.7)).toBe(0.7);
      expect(Workspace.validations.openAiTemp(1)).toBe(1);
      expect(Workspace.validations.openAiTemp("0.5")).toBe(0.5);
    });
  });

  describe("validations.openAiHistory", () => {
    it("should return default for invalid values", () => {
      expect(Workspace.validations.openAiHistory(null)).toBe(20);
      expect(Workspace.validations.openAiHistory(undefined)).toBe(20);
      expect(Workspace.validations.openAiHistory("abc")).toBe(20);
    });

    it("should return 0 for negative values", () => {
      expect(Workspace.validations.openAiHistory(-5)).toBe(0);
    });

    it("should accept valid history values", () => {
      expect(Workspace.validations.openAiHistory(10)).toBe(10);
      expect(Workspace.validations.openAiHistory(50)).toBe(50);
    });
  });

  describe("validations.similarityThreshold", () => {
    it("should return default for invalid values", () => {
      expect(Workspace.validations.similarityThreshold(null)).toBe(0.25);
      expect(Workspace.validations.similarityThreshold("abc")).toBe(0.25);
    });

    it("should clamp values to valid range", () => {
      expect(Workspace.validations.similarityThreshold(-0.5)).toBe(0);
      expect(Workspace.validations.similarityThreshold(1.5)).toBe(1);
    });

    it("should accept valid threshold values", () => {
      expect(Workspace.validations.similarityThreshold(0.5)).toBe(0.5);
      expect(Workspace.validations.similarityThreshold(0.75)).toBe(0.75);
    });
  });

  describe("validations.topN", () => {
    it("should return default for invalid values", () => {
      expect(Workspace.validations.topN(null)).toBe(4);
      expect(Workspace.validations.topN("abc")).toBe(4);
    });

    it("should clamp to minimum value", () => {
      expect(Workspace.validations.topN(0)).toBe(1);
      expect(Workspace.validations.topN(-5)).toBe(1);
    });

    it("should accept valid topN values", () => {
      expect(Workspace.validations.topN(10)).toBe(10);
      expect(Workspace.validations.topN(20)).toBe(20);
    });
  });

  describe("validations.chatMode", () => {
    it("should return default for invalid values", () => {
      expect(Workspace.validations.chatMode(null)).toBe("chat");
      expect(Workspace.validations.chatMode("invalid")).toBe("chat");
    });

    it("should accept valid chat modes", () => {
      expect(Workspace.validations.chatMode("chat")).toBe("chat");
      expect(Workspace.validations.chatMode("query")).toBe("query");
    });
  });
});

