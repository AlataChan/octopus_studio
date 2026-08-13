import { describe, expect, it } from "vitest";
import {
  buildLLMSelectorWorkspaceUpdate,
  LLM_SELECTOR_TARGETS,
  resolveLLMSelectorSelection,
  describeEffectiveAgentModel,
  EFFECTIVE_AGENT_SOURCES,
} from "@/components/WorkspaceChat/ChatContainer/PromptInput/LLMSelector";

describe("LLM selector target routing", () => {
  it("uses explicit agent model settings when targeting an agent", () => {
    const selection = resolveLLMSelectorSelection({
      target: LLM_SELECTOR_TARGETS.AGENT,
      workspace: {
        chatProvider: "aihubmix",
        chatModel: "kimi-k2.6",
        agentProvider: "openrouter",
        agentModel: "anthropic/claude-sonnet-4",
      },
      systemSettings: {
        LLMProvider: "deepseek",
        LLMModel: "deepseek-chat",
      },
    });

    expect(selection).toEqual({
      provider: "openrouter",
      model: "anthropic/claude-sonnet-4",
    });
  });

  it("falls back to workspace chat model when no agent override exists", () => {
    const selection = resolveLLMSelectorSelection({
      target: LLM_SELECTOR_TARGETS.AGENT,
      workspace: {
        chatProvider: "aihubmix",
        chatModel: "kimi-k2.6",
      },
      systemSettings: {
        LLMProvider: "deepseek",
        LLMModel: "deepseek-chat",
      },
    });

    expect(selection).toEqual({
      provider: "aihubmix",
      model: "kimi-k2.6",
    });
  });

  it("keeps chat selector updates separate from agent selector updates", () => {
    expect(
      buildLLMSelectorWorkspaceUpdate({
        target: LLM_SELECTOR_TARGETS.CHAT,
        provider: "deepseek",
        model: "deepseek-v4-flash",
      })
    ).toEqual({
      chatProvider: "deepseek",
      chatModel: "deepseek-v4-flash",
    });

    expect(
      buildLLMSelectorWorkspaceUpdate({
        target: LLM_SELECTOR_TARGETS.AGENT,
        provider: "deepseek",
        model: "deepseek-v4-flash",
      })
    ).toEqual({
      agentProvider: "deepseek",
      agentModel: "deepseek-v4-flash",
    });
  });
});

describe("describeEffectiveAgentModel", () => {
  const systemSettings = { LLMProvider: "deepseek", LLMModel: "deepseek-chat" };

  it("uses the explicit agent model when set", () => {
    const r = describeEffectiveAgentModel({
      workspace: { agentProvider: "openrouter", agentModel: "anthropic/claude-sonnet-4" },
      systemSettings,
    });
    expect(r).toEqual({
      source: EFFECTIVE_AGENT_SOURCES.EXPLICIT,
      provider: "openrouter",
      model: "anthropic/claude-sonnet-4",
    });
  });

  it("inherits chat pair only when both chatProvider and chatModel exist", () => {
    const r = describeEffectiveAgentModel({
      workspace: { agentProvider: "none", chatProvider: "aihubmix", chatModel: "kimi-k2.6" },
      systemSettings,
    });
    expect(r).toEqual({
      source: EFFECTIVE_AGENT_SOURCES.INHERIT_CHAT,
      provider: "aihubmix",
      model: "kimi-k2.6",
    });
  });

  it("returns provider default (model null) when agent provider set but agent model empty", () => {
    const r = describeEffectiveAgentModel({
      workspace: { agentProvider: "openrouter", agentModel: "", chatProvider: "aihubmix", chatModel: "kimi-k2.6" },
      systemSettings,
    });
    expect(r).toEqual({
      source: EFFECTIVE_AGENT_SOURCES.PROVIDER_DEFAULT,
      provider: "openrouter",
      model: null,
    });
  });

  it("falls back to system default when no agent provider and chat is incomplete", () => {
    const r = describeEffectiveAgentModel({
      workspace: { agentProvider: "none", chatProvider: "aihubmix", chatModel: "" },
      systemSettings,
    });
    expect(r).toEqual({
      source: EFFECTIVE_AGENT_SOURCES.SYSTEM_DEFAULT,
      provider: "deepseek",
      model: "deepseek-chat",
    });
  });
});
