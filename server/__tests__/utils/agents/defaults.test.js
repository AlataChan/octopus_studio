// Set required env vars before requiring modules
process.env.STORAGE_DIR = __dirname;
process.env.NODE_ENV = "test";

const { SystemPromptVariables } = require("../../../models/systemPromptVariables");
const Provider = require("../../../utils/agents/aibitat/providers/ai-provider");

jest.mock("../../../models/systemPromptVariables");
jest.mock("../../../models/systemSettings");
jest.mock("../../../utils/plugins/skillHub/registry", () => ({
  localRegistry: {
    scan: jest.fn(),
  },
}));
jest.mock("../../../utils/agents/imported", () => ({
  activeImportedPlugins: jest.fn().mockReturnValue([]),
}));
jest.mock("../../../utils/agentFlows", () => ({
  AgentFlows: {
    activeFlowPlugins: jest.fn().mockReturnValue([]),
  },
}));
jest.mock("../../../utils/MCP", () => {
  return class MockMCPCompatibilityLayer {
    async activeMCPServers() {
      return [];
    }
  };
});

const { WORKSPACE_AGENT } = require("../../../utils/agents/defaults");

describe("WORKSPACE_AGENT.getDefinition", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Mock SystemSettings to return empty arrays for agent skills
    const { SystemSettings } = require("../../../models/systemSettings");
    SystemSettings.getValueOrFallback = jest.fn().mockResolvedValue("[]");

    // Reset runtime markdown skills between tests
    const { skillRegistry } = require("../../../utils/skills");
    skillRegistry?.customSkills?.clear?.();
    skillRegistry?._markdownSkillIds?.clear?.();
  });

  it("should use provider default system prompt when workspace has no openAiPrompt", async () => {
    const workspace = {
      id: 1,
      name: "Test Workspace",
      openAiPrompt: null,
    };
    const user = { id: 1 };
    const provider = "openai";
    const expectedPrompt = await Provider.systemPrompt({ provider, workspace, user });
    const definition = await WORKSPACE_AGENT.getDefinition(
      provider,
      workspace,
      user
    );
    // 验证系统提示词包含 provider 默认提示（可能会追加工具列表等增强内容）
    expect(definition.role).toContain(expectedPrompt.trim());
    expect(SystemPromptVariables.expandSystemPromptVariables).not.toHaveBeenCalled();
  });

  it("should use workspace system prompt with variable expansion when openAiPrompt exists", async () => {
    const workspace = {
      id: 1,
      name: "Test Workspace",
      openAiPrompt: "You are a helpful assistant for {workspace.name}. The current user is {user.name}.",
    };
    const user = { id: 1 };
    const provider = "openai";

    const expandedPrompt = "You are a helpful assistant for Test Workspace. The current user is John Doe.";
    SystemPromptVariables.expandSystemPromptVariables.mockResolvedValue(expandedPrompt);

    const definition = await WORKSPACE_AGENT.getDefinition(
      provider,
      workspace,
      user
    );

    expect(SystemPromptVariables.expandSystemPromptVariables).toHaveBeenCalledWith(
      workspace.openAiPrompt,
      user.id,
      workspace.id
    );
    // 验证系统提示词包含展开后的内容（可能会追加工具列表等增强内容）
    expect(definition.role).toContain(expandedPrompt);
  });

  it("should handle workspace system prompt without user context", async () => {
    const workspace = {
      id: 1,
      name: "Test Workspace",
      openAiPrompt: "You are a helpful assistant. Today is {date}.",
    };
    const user = null;
    const provider = "lmstudio";
    const expandedPrompt = "You are a helpful assistant. Today is January 1, 2024.";
    SystemPromptVariables.expandSystemPromptVariables.mockResolvedValue(expandedPrompt);

    const definition = await WORKSPACE_AGENT.getDefinition(
      provider,
      workspace,
      user
    );

    expect(SystemPromptVariables.expandSystemPromptVariables).toHaveBeenCalledWith(
      workspace.openAiPrompt,
      null,
      workspace.id
    );
    // 验证系统提示词包含展开后的内容（可能会追加工具列表等增强内容）
    expect(definition.role).toContain(expandedPrompt);
  });

  it("should return functions array in definition", async () => {
    const workspace = { id: 1, openAiPrompt: null };
    const provider = "openai";

    const definition = await WORKSPACE_AGENT.getDefinition(
      provider,
      workspace,
      null
    );

    expect(definition).toHaveProperty("functions");
    expect(Array.isArray(definition.functions)).toBe(true);
  });

  it("should use LMStudio specific prompt when workspace has no openAiPrompt", async () => {
    const workspace = { id: 1, openAiPrompt: null };
    const user = null;
    const provider = "lmstudio";
    const definition = await WORKSPACE_AGENT.getDefinition(
      provider,
      workspace,
      null
    );

    const expectedPrompt = await Provider.systemPrompt({ provider, workspace, user });
    // 验证系统提示词包含 provider 默认提示（可能会追加工具列表等增强内容）
    expect(definition.role).toContain(expectedPrompt.trim());
    expect(definition.role).toContain("helpful ai assistant");
  });

  it("should expand abstract tool aliases in assistantConfig.tools", async () => {
    const workspace = { id: 1, openAiPrompt: null };
    const user = { id: 1 };
    const provider = "openai";

    const definition = await WORKSPACE_AGENT.getDefinition(provider, workspace, user, {
      tools: ["http-request"],
      skills: [],
    });

    expect(definition.functions).toContain("web-browsing");
    expect(definition.functions).not.toContain("http-request");
  });

  it("should not include skill ids in functions[] (skills are prompts, not tools)", async () => {
    const workspace = { id: 1, openAiPrompt: null };
    const user = { id: 1 };
    const provider = "openai";

    const definition = await WORKSPACE_AGENT.getDefinition(provider, workspace, user, {
      tools: [],
      skills: ["builtin:docx"],
    });

    expect(definition.functions).not.toContain("builtin:docx");
  });

  it("should inject tools from runtimeSkillIds (installed skills) even without assistantConfig", async () => {
    const { localRegistry } = require("../../../utils/plugins/skillHub/registry");
    localRegistry.scan.mockResolvedValue([
      {
        skillId: "custom:demo",
        name: "Demo Skill",
        description: "demo",
        version: "1.0.0",
        category: "general",
        tags: ["demo"],
        icon: "🧪",
        tools: ["http-request"],
        systemPrompt: "When needed, use http-request to fetch external data.",
      },
    ]);

    const workspace = { id: 1, openAiPrompt: null };
    const user = { id: 1 };
    const provider = "openai";

    const definition = await WORKSPACE_AGENT.getDefinition(
      provider,
      workspace,
      user,
      null,
      ["custom:demo"]
    );

    expect(definition.functions).toContain("web-browsing");
    expect(definition.role).toContain("## Demo Skill");
  });
});
