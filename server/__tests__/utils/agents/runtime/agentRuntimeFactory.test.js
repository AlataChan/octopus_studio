"use strict";

/**
 * 特征化测试 — AgentRuntimeFactory
 * 这些测试是"抽取前行为"的锚，确保工厂与 AgentHandler 原有逻辑等价。
 * 不打真模型/真 DB，全部用 jest mock 隔离。
 */

// Must mock before requiring the factory
jest.mock("../../../../models/workspaceAssistant", () => ({
  WorkspaceAssistant: {
    getById: jest.fn(),
  },
}));

jest.mock("../../../../models/skillInstallations", () => ({
  SkillInstallations: {
    listForWorkspace: jest.fn(),
  },
}));

// Mock AgentPlugins to control SYSTEM_TOOLS / OUTPUT_TOOLS
jest.mock("../../../../utils/agents/aibitat/plugins", () => ({
  SYSTEM_TOOLS: ["__system_clock__"],
  OUTPUT_TOOLS: ["__output_excel__"],
}));

// Mock USER_AGENT and WORKSPACE_AGENT from defaults
jest.mock("../../../../utils/agents/defaults", () => ({
  USER_AGENT: {
    name: "USER",
    getDefinition: jest.fn().mockResolvedValue({ functions: ["user-func-1"] }),
  },
  WORKSPACE_AGENT: {
    name: "WORKSPACE",
    getDefinition: jest
      .fn()
      .mockResolvedValue({ functions: ["ws-func-1", "ws-func-2"] }),
  },
}));

const { AgentRuntimeFactory } = require("../../../../utils/agents/runtime/agentRuntimeFactory");
const { WorkspaceAssistant } = require("../../../../models/workspaceAssistant");
const { SkillInstallations } = require("../../../../models/skillInstallations");
const { PermissionMode } = require("../../../../utils/permissions");

beforeEach(() => {
  jest.clearAllMocks();
  // Reset env vars
  delete process.env.LLM_PROVIDER;
  delete process.env.OPEN_MODEL_PREF;
  delete process.env.ANTHROPIC_MODEL_PREF;
});

// ─────────────────────────────────────────────────────────────────────────────
// resolveProviderModel
// ─────────────────────────────────────────────────────────────────────────────
describe("AgentRuntimeFactory.resolveProviderModel", () => {
  it("① workspace has agentProvider + agentModel → returns them as-is", () => {
    const workspace = {
      agentProvider: "openai",
      agentModel: "gpt-4-turbo",
      chatProvider: null,
      chatModel: null,
    };
    const result = AgentRuntimeFactory.resolveProviderModel({ workspace });
    expect(result).toEqual({ provider: "openai", model: "gpt-4-turbo" });
  });

  it("② no agentProvider but has chatProvider+chatModel → fallback to chat", () => {
    const workspace = {
      agentProvider: null,
      agentModel: null,
      chatProvider: "anthropic",
      chatModel: "claude-3-haiku-20240307",
    };
    const result = AgentRuntimeFactory.resolveProviderModel({ workspace });
    expect(result).toEqual({
      provider: "anthropic",
      model: "claude-3-haiku-20240307",
    });
  });

  it("③ all null but LLM_PROVIDER set → system provider + providerDefault model", () => {
    process.env.LLM_PROVIDER = "openai";
    process.env.OPEN_MODEL_PREF = "gpt-4o";
    const workspace = {
      agentProvider: null,
      agentModel: null,
      chatProvider: null,
      chatModel: null,
    };
    const result = AgentRuntimeFactory.resolveProviderModel({ workspace });
    expect(result.provider).toBe("openai");
    expect(result.model).toBe("gpt-4o");
  });

  it("③ all null and LLM_PROVIDER not set → provider null", () => {
    const workspace = {
      agentProvider: null,
      agentModel: null,
      chatProvider: null,
      chatModel: null,
    };
    const result = AgentRuntimeFactory.resolveProviderModel({ workspace });
    expect(result.provider).toBeNull();
  });

  it("④ provider set but no agentModel → providerDefault", () => {
    process.env.ANTHROPIC_MODEL_PREF = "claude-3-opus-20240229";
    const workspace = {
      agentProvider: "anthropic",
      agentModel: null,
      chatProvider: null,
      chatModel: null,
    };
    const result = AgentRuntimeFactory.resolveProviderModel({ workspace });
    expect(result.provider).toBe("anthropic");
    expect(result.model).toBe("claude-3-opus-20240229");
  });

  it("④ provider set but no agentModel and no env → providerDefault fallback", () => {
    const workspace = {
      agentProvider: "anthropic",
      agentModel: null,
      chatProvider: null,
      chatModel: null,
    };
    const result = AgentRuntimeFactory.resolveProviderModel({ workspace });
    expect(result.provider).toBe("anthropic");
    // Default anthropic model when no env set: "claude-3-sonnet-20240229"
    expect(result.model).toBe("claude-3-sonnet-20240229");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// providerDefault
// ─────────────────────────────────────────────────────────────────────────────
describe("AgentRuntimeFactory.providerDefault", () => {
  it("known provider with env set → returns env value", () => {
    process.env.OPEN_MODEL_PREF = "gpt-4-turbo";
    expect(AgentRuntimeFactory.providerDefault("openai")).toBe("gpt-4-turbo");
  });

  it("known provider without env → returns base default", () => {
    delete process.env.OPEN_MODEL_PREF;
    expect(AgentRuntimeFactory.providerDefault("openai")).toBe("gpt-4o");
  });

  it("unknown provider → returns null", () => {
    expect(AgentRuntimeFactory.providerDefault("unknown-xyz")).toBeNull();
  });

  it("gemini → returns env or default", () => {
    delete process.env.GEMINI_LLM_MODEL_PREF;
    expect(AgentRuntimeFactory.providerDefault("gemini")).toBe(
      "gemini-2.0-flash-lite"
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// assembleAssistantConfig
// ─────────────────────────────────────────────────────────────────────────────
describe("AgentRuntimeFactory.assembleAssistantConfig", () => {
  it("assistant not found → {assistantConfig:null, permissionConfig:null}", async () => {
    WorkspaceAssistant.getById.mockResolvedValue(null);
    const result = await AgentRuntimeFactory.assembleAssistantConfig({
      assistantId: "missing-id",
    });
    expect(result).toEqual({ assistantConfig: null, permissionConfig: null });
  });

  it("assistant disabled → {assistantConfig:null, permissionConfig:null}", async () => {
    WorkspaceAssistant.getById.mockResolvedValue({
      enabled: false,
      instanceName: "Disabled",
      template: { name: "t", systemPrompt: null, defaultTools: "[]" },
      customConfig: {},
    });
    const result = await AgentRuntimeFactory.assembleAssistantConfig({
      assistantId: "disabled-id",
    });
    expect(result).toEqual({ assistantConfig: null, permissionConfig: null });
  });

  it("enabled assistant with template → correct assistantConfig and permissionConfig", async () => {
    WorkspaceAssistant.getById.mockResolvedValue({
      enabled: true,
      instanceName: "Marketing Bot",
      template: {
        name: "MarketingTemplate",
        systemPrompt: "You are a marketing expert.",
        defaultTools: JSON.stringify([
          "builtin:seo-skill",
          "web-search",
          "summarize",
        ]),
        skills: [],
        defaultMCPServers: JSON.stringify({ myMcp: true }),
        agentFlowId: "flow-abc-123",
        defaultPermissionMode: "default",
        defaultAllowedTools: JSON.stringify(["web-search"]),
        defaultAutoApprovedTools: JSON.stringify([]),
      },
      customConfig: {},
    });

    const result = await AgentRuntimeFactory.assembleAssistantConfig({
      assistantId: "enabled-id",
    });

    expect(result.assistantConfig).not.toBeNull();
    expect(result.assistantConfig.name).toBe("Marketing Bot");
    expect(result.assistantConfig.systemPrompt).toBe(
      "You are a marketing expert."
    );
    // tools should NOT contain builtin: prefixed items
    expect(result.assistantConfig.tools).toEqual(
      expect.arrayContaining(["web-search", "summarize"])
    );
    expect(result.assistantConfig.tools).not.toContain("builtin:seo-skill");
    // skills should contain builtin: prefixed item
    expect(result.assistantConfig.skills).toContain("builtin:seo-skill");
    // agentFlowId preserved
    expect(result.assistantConfig.agentFlowId).toBe("flow-abc-123");
    // mcpServers preserved
    expect(result.assistantConfig.mcpServers).toEqual({ myMcp: true });

    // permissionConfig: allowedTools should be run through withSystemToolsAllowed
    expect(result.permissionConfig).not.toBeNull();
    expect(result.permissionConfig.permissionMode).toBe("default");
    // withSystemToolsAllowed adds SYSTEM_TOOLS and OUTPUT_TOOLS to non-empty allowedTools
    expect(result.permissionConfig.allowedTools).toContain("web-search");
    expect(result.permissionConfig.allowedTools).toContain("__system_clock__");
    expect(result.permissionConfig.allowedTools).toContain("__output_excel__");
  });

  it("customConfig overrides template permissionMode and allowedTools", async () => {
    WorkspaceAssistant.getById.mockResolvedValue({
      enabled: true,
      instanceName: "Custom Bot",
      template: {
        name: "Base",
        systemPrompt: null,
        defaultTools: "[]",
        skills: [],
        defaultMCPServers: "{}",
        agentFlowId: null,
        defaultPermissionMode: "default",
        defaultAllowedTools: JSON.stringify(["tool-a"]),
        defaultAutoApprovedTools: "[]",
      },
      customConfig: {
        permissionMode: "acceptEdits",
        allowedTools: ["tool-b", "tool-c"],
        autoApprovedTools: ["tool-b"],
      },
    });

    const result = await AgentRuntimeFactory.assembleAssistantConfig({
      assistantId: "custom-id",
    });

    expect(result.permissionConfig.permissionMode).toBe("acceptEdits");
    expect(result.permissionConfig.allowedTools).toContain("tool-b");
    expect(result.permissionConfig.allowedTools).toContain("tool-c");
    // Still gets system tools merged in (non-empty array)
    expect(result.permissionConfig.allowedTools).toContain("__system_clock__");
    expect(result.permissionConfig.autoApprovedTools).toEqual(["tool-b"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// resolveRuntimeSkills
// ─────────────────────────────────────────────────────────────────────────────
describe("AgentRuntimeFactory.resolveRuntimeSkills", () => {
  it("no installations → empty array", async () => {
    SkillInstallations.listForWorkspace.mockResolvedValue([]);
    const result = await AgentRuntimeFactory.resolveRuntimeSkills({
      workspaceId: 1,
      assistantId: null,
    });
    expect(result).toEqual([]);
  });

  it("workspace-scoped skills are included", async () => {
    SkillInstallations.listForWorkspace.mockResolvedValue([
      { scopeType: "workspace", scopeId: "__workspace__", skillId: "skill-ws-1" },
      { scopeType: "workspace", scopeId: "__workspace__", skillId: "skill-ws-2" },
    ]);
    const result = await AgentRuntimeFactory.resolveRuntimeSkills({
      workspaceId: 1,
      assistantId: null,
    });
    expect(result).toEqual(["skill-ws-1", "skill-ws-2"]);
  });

  it("assistant-scoped skills only if assistantId matches", async () => {
    SkillInstallations.listForWorkspace.mockResolvedValue([
      { scopeType: "workspace", scopeId: "__workspace__", skillId: "skill-ws-1" },
      { scopeType: "assistant", scopeId: "asst-42", skillId: "skill-asst-1" },
      { scopeType: "assistant", scopeId: "asst-99", skillId: "skill-other" },
    ]);
    const result = await AgentRuntimeFactory.resolveRuntimeSkills({
      workspaceId: 1,
      assistantId: "asst-42",
    });
    expect(result).toContain("skill-ws-1");
    expect(result).toContain("skill-asst-1");
    expect(result).not.toContain("skill-other");
  });

  it("deduplicates skillIds", async () => {
    SkillInstallations.listForWorkspace.mockResolvedValue([
      { scopeType: "workspace", scopeId: "__workspace__", skillId: "skill-x" },
      { scopeType: "workspace", scopeId: "__workspace__", skillId: "skill-x" },
    ]);
    const result = await AgentRuntimeFactory.resolveRuntimeSkills({
      workspaceId: 1,
      assistantId: null,
    });
    expect(result).toEqual(["skill-x"]);
  });

  it("invalid workspaceId → empty array without throwing", async () => {
    const result = await AgentRuntimeFactory.resolveRuntimeSkills({
      workspaceId: NaN,
      assistantId: null,
    });
    expect(result).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// resolveAuthorizationMode
// ─────────────────────────────────────────────────────────────────────────────
describe("AgentRuntimeFactory.resolveAuthorizationMode", () => {
  it('"full_authorize" → "full_authorize"', () => {
    expect(
      AgentRuntimeFactory.resolveAuthorizationMode({
        invocationMetadata: { authorizationMode: "full_authorize" },
      })
    ).toBe("full_authorize");
  });

  it('"full-authorize" (dash) → "full_authorize"', () => {
    expect(
      AgentRuntimeFactory.resolveAuthorizationMode({
        invocationMetadata: { authorizationMode: "full-authorize" },
      })
    ).toBe("full_authorize");
  });

  it('"FULL_AUTHORIZE" (uppercase) → "full_authorize"', () => {
    expect(
      AgentRuntimeFactory.resolveAuthorizationMode({
        invocationMetadata: { authorizationMode: "FULL_AUTHORIZE" },
      })
    ).toBe("full_authorize");
  });

  it("other value → hitl", () => {
    expect(
      AgentRuntimeFactory.resolveAuthorizationMode({
        invocationMetadata: { authorizationMode: "something-else" },
      })
    ).toBe("hitl");
  });

  it("missing authorizationMode → hitl", () => {
    expect(
      AgentRuntimeFactory.resolveAuthorizationMode({
        invocationMetadata: {},
      })
    ).toBe("hitl");
  });

  it("null invocationMetadata → hitl", () => {
    expect(
      AgentRuntimeFactory.resolveAuthorizationMode({
        invocationMetadata: null,
      })
    ).toBe("hitl");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// applyAuthorizationMode
// ─────────────────────────────────────────────────────────────────────────────
describe("AgentRuntimeFactory.applyAuthorizationMode", () => {
  it("full_authorize → permissionMode = BYPASS", () => {
    const pc = { permissionMode: "default", allowedTools: [], autoApprovedTools: [] };
    const result = AgentRuntimeFactory.applyAuthorizationMode({
      permissionConfig: pc,
      authorizationMode: "full_authorize",
    });
    expect(result.permissionMode).toBe(PermissionMode.BYPASS);
  });

  it("hitl + permissionMode was BYPASS → downgrade to DEFAULT", () => {
    const pc = { permissionMode: "bypass", allowedTools: [], autoApprovedTools: [] };
    const result = AgentRuntimeFactory.applyAuthorizationMode({
      permissionConfig: pc,
      authorizationMode: "hitl",
    });
    expect(result.permissionMode).toBe(PermissionMode.DEFAULT);
  });

  it("hitl + permissionMode was non-BYPASS → unchanged", () => {
    const pc = { permissionMode: "acceptEdits", allowedTools: [], autoApprovedTools: [] };
    const result = AgentRuntimeFactory.applyAuthorizationMode({
      permissionConfig: pc,
      authorizationMode: "hitl",
    });
    expect(result.permissionMode).toBe("acceptEdits");
  });

  it("null permissionConfig → creates fallback object with correct mode for full_authorize", () => {
    const result = AgentRuntimeFactory.applyAuthorizationMode({
      permissionConfig: null,
      authorizationMode: "full_authorize",
    });
    expect(result).not.toBeNull();
    expect(result.permissionMode).toBe(PermissionMode.BYPASS);
    expect(Array.isArray(result.allowedTools)).toBe(true);
    expect(Array.isArray(result.autoApprovedTools)).toBe(true);
  });

  it("null permissionConfig → creates fallback object with DEFAULT for hitl", () => {
    const result = AgentRuntimeFactory.applyAuthorizationMode({
      permissionConfig: null,
      authorizationMode: "hitl",
    });
    expect(result).not.toBeNull();
    expect(result.permissionMode).toBe(PermissionMode.DEFAULT);
  });
});
