import { describe, expect, it } from "vitest";
import en from "@/locales/en/common.js";
import zh from "@/locales/zh/common.js";

const REQUIRED_KEYS = [
  ["chat", "llm", "intro"],
  ["chat", "llm", "default_name"],
  ["chat", "llm", "default_description"],
  ["agent", "intro"],
  ["agent", "default_name"],
  ["agent", "default_description"],
  ["agent", "effective", "inherit_chat"],
  ["agent", "effective", "provider_default"],
  ["agent", "effective", "system_default"],
  ["chat_window", "workspace_llm_manager", "target_chat"],
  ["chat_window", "workspace_llm_manager", "target_agent"],
];

function getPath(obj, path) {
  return path.reduce((acc, k) => (acc == null ? undefined : acc[k]), obj);
}

describe("LLM clarity copy keys exist in both locales", () => {
  it.each(REQUIRED_KEYS)("en has %s", (...path) => {
    expect(typeof getPath(en, path)).toBe("string");
  });
  it.each(REQUIRED_KEYS)("zh has %s", (...path) => {
    expect(typeof getPath(zh, path)).toBe("string");
  });
  it("agent.effective.inherit_chat interpolates {{model}} in both locales", () => {
    expect(en.agent.effective.inherit_chat).toContain("{{model}}");
    expect(zh.agent.effective.inherit_chat).toContain("{{model}}");
  });
});

import fs from "node:fs";
import path from "node:path";
const modalSource = fs.readFileSync(
  path.resolve(__dirname, "../components/WorkspaceChat/ChatContainer/PromptInput/LLMSelector/index.jsx"),
  "utf8"
);

describe("LLM selector target badge", () => {
  it("renders a target badge keyed off the agent/chat target", () => {
    expect(modalSource).toContain("chat_window.workspace_llm_manager.target_agent");
    expect(modalSource).toContain("chat_window.workspace_llm_manager.target_chat");
    expect(modalSource).toMatch(/target === LLM_SELECTOR_TARGETS\.AGENT/);
  });
});

const agentModelSource = fs.readFileSync(
  path.resolve(__dirname, "../components/WorkspaceChat/ChatContainer/PromptInput/LLMSelector/effectiveAgentModel.jsx"),
  "utf8"
);

describe("effective agent model hint", () => {
  it("agent model selection renders an effective-model hint", () => {
    expect(agentModelSource).toContain("describeEffectiveAgentModel");
    expect(agentModelSource).toMatch(/agent\.effective\.(inherit_chat|provider_default|system_default)/);
  });
  it("never labels provider-default as inherited from chat", () => {
    // provider_default branch must NOT use the inherit_chat copy
    expect(agentModelSource).toMatch(/PROVIDER_DEFAULT[\s\S]*provider_default/);
  });
});

const chatLlmSource = fs.readFileSync(
  path.resolve(__dirname, "../pages/WorkspaceSettings/ChatSettings/WorkspaceLLMSelection/index.jsx"),
  "utf8"
);
const agentLlmSource = fs.readFileSync(
  path.resolve(__dirname, "../pages/WorkspaceSettings/AgentConfig/AgentLLMSelection/index.jsx"),
  "utf8"
);

describe("settings intros and unified default copy", () => {
  it("chat settings reference intro + unified default copy keys", () => {
    expect(chatLlmSource).toContain("chat.llm.intro");
    expect(chatLlmSource).toContain("chat.llm.default_name");
    expect(chatLlmSource).toContain("chat.llm.default_description");
  });
  it("agent settings reference intro + unified default copy keys", () => {
    expect(agentLlmSource).toContain("agent.intro");
    expect(agentLlmSource).toContain("agent.default_name");
    expect(agentLlmSource).toContain("agent.default_description");
  });
});

// ── Fix A: EffectiveAgentModelHint rendered inside in-chat LLM selector modal ──
describe("in-chat LLM selector modal shows effective-model hint for agent target", () => {
  it("imports and renders EffectiveAgentModelHint guarded by agent target and workspace", () => {
    expect(modalSource).toContain("EffectiveAgentModelHint");
    expect(modalSource).toMatch(/target === LLM_SELECTOR_TARGETS\.AGENT && workspace/);
  });
});

// ── Fix B: open dropdown list uses i18n default copy, not hardcoded name ──
describe("open dropdown list uses i18n copy for default sentinel item", () => {
  it("chat WorkspaceLLMSelection localizes default item inside filteredLLMs.map", () => {
    expect(chatLlmSource).toContain("filteredLLMs.map");
    expect(chatLlmSource).toContain("chat.llm.default_name");
  });
  it("agent AgentLLMSelection localizes default item inside filteredLLMs.map", () => {
    expect(agentLlmSource).toContain("filteredLLMs.map");
    expect(agentLlmSource).toContain("agent.default_name");
  });
});
