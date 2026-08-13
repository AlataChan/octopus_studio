/**
 * WorkspaceAssistant 模型单元测试
 * 测试核心方法的行为
 */

// Mock dependencies before requiring the module
jest.mock("../../utils/prisma", () => ({
  workspace_assistants: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock("../../models/assistantTemplate", () => ({
  AssistantTemplate: {
    get: jest.fn(),
    _formatTemplate: jest.fn((t) => t),
  },
}));

jest.mock("../../models/workspaceGraph", () => ({
  WorkspaceGraph: {
    upsertNode: jest.fn().mockResolvedValue({ node: { id: "node-123" } }),
    deleteNode: jest.fn().mockResolvedValue(true),
  },
}));

const { WorkspaceAssistant } = require("../../models/workspaceAssistant");
const prisma = require("../../utils/prisma");
const { AssistantTemplate } = require("../../models/assistantTemplate");
const { WorkspaceGraph } = require("../../models/workspaceGraph");

describe("WorkspaceAssistant Model", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    AssistantTemplate._formatTemplate.mockImplementation((t) => t);
  });

  describe("install", () => {
    it("should return error when template not found", async () => {
      AssistantTemplate.get.mockResolvedValue(null);

      const result = await WorkspaceAssistant.install(1, "non-existent");

      expect(result.assistant).toBeNull();
      expect(result.message).toBe("Template not found");
    });

    it("should return error when already installed", async () => {
      AssistantTemplate.get.mockResolvedValue({ id: "t1", name: "Test" });
      prisma.workspace_assistants.findUnique.mockResolvedValue({
        id: "existing",
      });

      const result = await WorkspaceAssistant.install(1, "t1");

      expect(result.assistant).toBeNull();
      expect(result.message).toBe(
        "Assistant already installed in this workspace"
      );
    });

    it("should install successfully when template exists and not installed", async () => {
      const mockTemplate = {
        id: "template-uuid",
        name: "测试助手",
        category: "通用",
      };

      const mockInstalled = {
        id: "install-uuid",
        workspaceId: 1,
        templateId: "template-uuid",
        instanceName: "我的助手",
        enabled: true,
        customConfig: null,
        template: mockTemplate,
      };

      AssistantTemplate.get.mockResolvedValue(mockTemplate);
      prisma.workspace_assistants.findUnique.mockResolvedValue(null);
      prisma.workspace_assistants.create.mockResolvedValue(mockInstalled);

      const result = await WorkspaceAssistant.install(
        1,
        "template-uuid",
        "我的助手"
      );

      expect(result.assistant).toBeDefined();
      expect(result.message).toBeNull();
      expect(prisma.workspace_assistants.create).toHaveBeenCalledTimes(1);
      const graphNode = WorkspaceGraph.upsertNode.mock.calls[0][0];
      expect(graphNode).not.toHaveProperty("group");
      expect(graphNode).not.toHaveProperty("rank");
    });
  });

  describe("get", () => {
    it("should return assistant by ID", async () => {
      const mockAssistant = {
        id: "install-uuid",
        workspaceId: 1,
        templateId: "template-uuid",
        customConfig: null,
      };

      prisma.workspace_assistants.findUnique.mockResolvedValue(mockAssistant);

      const result = await WorkspaceAssistant.get("install-uuid");

      expect(result).toBeDefined();
      expect(result.id).toBe("install-uuid");
    });

    it("should return null for non-existent assistant", async () => {
      prisma.workspace_assistants.findUnique.mockResolvedValue(null);

      const result = await WorkspaceAssistant.get("non-existent");

      expect(result).toBeNull();
    });
  });

  describe("listByWorkspace", () => {
    it("should tolerate assistants whose template row is missing", async () => {
      prisma.workspace_assistants.findMany.mockResolvedValue([
        {
          id: "install-uuid",
          workspaceId: 1,
          templateId: "missing-template",
          instanceName: "Researcher",
          customConfig: null,
          enabled: true,
        },
      ]);
      AssistantTemplate.get.mockResolvedValue(null);

      const result = await WorkspaceAssistant.listByWorkspace(1);

      expect(prisma.workspace_assistants.findMany).toHaveBeenCalledWith({
        where: { workspaceId: 1 },
        orderBy: { createdAt: "desc" },
      });
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: "install-uuid",
        workspaceId: 1,
        template: null,
      });
    });
  });

  describe("forWorkspace", () => {
    it("should return formatted assistants for a workspace", async () => {
      const rawAssistants = [
        {
          id: "install-uuid",
          workspaceId: 1,
          templateId: "template-uuid",
          instanceName: "Researcher",
          customConfig: '{"capabilities":["research"]}',
          enabled: true,
        },
      ];
      prisma.workspace_assistants.findMany.mockResolvedValue(rawAssistants);
      AssistantTemplate.get.mockResolvedValue({
        name: "Research Assistant",
        employeeName: "Default Researcher",
        employeeTitle: "Research Lead",
        skills: ["search", "summarize"],
      });

      const result = await WorkspaceAssistant.forWorkspace(1);

      expect(prisma.workspace_assistants.findMany).toHaveBeenCalledWith({
        where: { workspaceId: 1 },
        orderBy: { createdAt: "desc" },
      });
      expect(AssistantTemplate.get).toHaveBeenCalledWith("template-uuid");
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: "install-uuid",
        workspaceId: 1,
        name: "Researcher",
        title: "Research Lead",
        capabilities: ["search", "summarize"],
        customConfig: { capabilities: ["research"] },
      });
    });

    it("should tolerate assistants whose template row is missing", async () => {
      prisma.workspace_assistants.findMany.mockResolvedValue([
        {
          id: "install-uuid",
          workspaceId: 1,
          templateId: "missing-template",
          instanceName: "Researcher",
          customConfig: null,
          enabled: true,
        },
      ]);
      AssistantTemplate.get.mockResolvedValue(null);

      const result = await WorkspaceAssistant.forWorkspace(1);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: "install-uuid",
        name: "Researcher",
        title: "",
        capabilities: [],
      });
    });
  });

  describe("_formatAssistant", () => {
    it("should parse JSON customConfig field", () => {
      const rawAssistant = {
        id: "test-uuid",
        customConfig: '{"key": "value"}',
      };

      const formatted = WorkspaceAssistant._formatAssistant(rawAssistant);

      expect(formatted.customConfig).toEqual({ key: "value" });
    });

    it("should handle null customConfig", () => {
      const rawAssistant = {
        id: "test-uuid",
        customConfig: null,
      };

      const formatted = WorkspaceAssistant._formatAssistant(rawAssistant);

      // null customConfig 保持为 null
      expect(formatted.customConfig).toBeNull();
    });

    it("should return null for null input", () => {
      const result = WorkspaceAssistant._formatAssistant(null);
      expect(result).toBeNull();
    });
  });
});
