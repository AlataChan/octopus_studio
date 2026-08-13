import React, { useState, useEffect } from "react";
import { ArrowLeft, ArrowRight } from "@phosphor-icons/react";
import Button from "@/components/Button";
import AgentFlows from "@/models/agentFlows";
import AssistantLibrary from "@/models/assistantLibrary";

/**
 * 可用的内置工具列表
 * 这些工具名称对应 server/utils/agents/aibitat/plugins 中的插件
 */
const AVAILABLE_TOOLS = [
  {
    id: "web-browsing",
    name: "网络搜索",
    description: "搜索互联网获取最新信息",
  },
  { id: "web-scraping", name: "网页抓取", description: "提取网页内容和数据" },
  {
    id: "rag-memory",
    name: "知识库检索",
    description: "从 Workspace 知识库中检索相关内容",
  },
  {
    id: "document-summarizer",
    name: "文档总结",
    description: "总结长文档的关键内容",
  },
  { id: "sql-agent", name: "SQL 查询", description: "查询数据库执行 SQL" },
  { id: "memory", name: "对话记忆", description: "记住对话中的重要信息" },
];

/**
 * 步骤 2: 平台配置
 * 根据选择的平台类型显示不同的配置表单
 */
export default function StepPlatformConfig({
  formData,
  setFormData,
  onNext,
  onBack,
}) {
  const [availableFlows, setAvailableFlows] = useState([]);
  const [loadingFlows, setLoadingFlows] = useState(false);
  const [availableSkills, setAvailableSkills] = useState([]);
  const [loadingSkills, setLoadingSkills] = useState(false);

  // 加载可用的 Agent Flows
  useEffect(() => {
    async function loadFlows() {
      setLoadingFlows(true);
      try {
        const { success, flows } = await AgentFlows.listFlows();
        if (success) {
          setAvailableFlows(flows);
        }
      } catch (error) {
        console.error("Failed to load flows:", error);
      } finally {
        setLoadingFlows(false);
      }
    }
    loadFlows();
  }, []);

  // 加载可用的 Skills
  useEffect(() => {
    async function loadSkills() {
      setLoadingSkills(true);
      try {
        const result = await AssistantLibrary.listSkills();
        if (result.success && result.data?.skills) {
          setAvailableSkills(result.data.skills);
        }
      } catch (error) {
        console.error("Failed to load skills:", error);
      } finally {
        setLoadingSkills(false);
      }
    }
    loadSkills();
  }, []);
  const handlePlatformChange = (platformType) => {
    setFormData({
      ...formData,
      platformType,
      platformConfig: {}, // 重置配置
    });
  };

  const handleConfigChange = (field, value) => {
    setFormData({
      ...formData,
      platformConfig: {
        ...formData.platformConfig,
        [field]: value,
      },
    });
  };

  const handleNext = () => {
    // 验证配置
    if (formData.platformType !== "internal") {
      const config = formData.platformConfig;
      if (formData.platformType === "dify") {
        if (!config.baseUrl || !config.apiKey || !config.appId) {
          alert("请填写所有必填的 Dify 配置");
          return;
        }
      } else if (formData.platformType === "ragflow") {
        if (!config.baseUrl || !config.apiKey || !config.type) {
          alert("请填写所有必填的 RAGFlow 配置");
          return;
        }
      } else if (formData.platformType === "n8n") {
        if (!config.webhookUrl) {
          alert("请填写 n8n Webhook URL");
          return;
        }
      }
    }
    onNext();
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-theme-bg-primary rounded-lg p-6 space-y-6">
        <h2 className="text-xl font-semibold text-theme-text-primary mb-4">
          平台配置
        </h2>

        {/* 平台类型选择 */}
        <div>
          <label className="block text-sm font-medium text-theme-text-primary mb-3">
            选择平台类型 <span className="text-red-500">*</span>
          </label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <PlatformOption
              name="内置 Agent"
              value="internal"
              icon="🤖"
              selected={formData.platformType === "internal"}
              onClick={() => handlePlatformChange("internal")}
            />
            <PlatformOption
              name="Dify"
              value="dify"
              icon="🔷"
              selected={formData.platformType === "dify"}
              onClick={() => handlePlatformChange("dify")}
            />
            <PlatformOption
              name="RAGFlow"
              value="ragflow"
              icon="📊"
              selected={formData.platformType === "ragflow"}
              onClick={() => handlePlatformChange("ragflow")}
            />
            <PlatformOption
              name="n8n"
              value="n8n"
              icon="🔗"
              selected={formData.platformType === "n8n"}
              onClick={() => handlePlatformChange("n8n")}
            />
          </div>
        </div>

        {/* 根据平台类型显示不同的配置表单 */}
        <div className="pt-4">
          {formData.platformType === "internal" && (
            <InternalConfigForm
              formData={formData}
              onChange={setFormData}
              availableFlows={availableFlows}
              loadingFlows={loadingFlows}
              availableSkills={availableSkills}
              loadingSkills={loadingSkills}
            />
          )}
          {formData.platformType === "dify" && (
            <DifyConfigForm
              config={formData.platformConfig}
              onChange={handleConfigChange}
            />
          )}
          {formData.platformType === "ragflow" && (
            <RagflowConfigForm
              config={formData.platformConfig}
              onChange={handleConfigChange}
            />
          )}
          {formData.platformType === "n8n" && (
            <N8nConfigForm
              config={formData.platformConfig}
              onChange={handleConfigChange}
            />
          )}
        </div>

        {/* 导航按钮 */}
        <div className="flex justify-between pt-4">
          <Button
            className="border-theme-border bg-theme-bg-secondary text-theme-text-primary hover:bg-theme-bg-container"
            onClick={onBack}
            variant="secondary"
          >
            <ArrowLeft size={20} weight="bold" />
            <span>上一步</span>
          </Button>
          <Button onClick={handleNext}>
            <span>下一步</span>
            <ArrowRight size={20} weight="bold" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// 平台选项卡片
function PlatformOption({ name, icon, selected, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`p-4 rounded-lg border-2 transition-all duration-300 ${
        selected
          ? "border-theme-accent-primary bg-theme-accent-primary/10"
          : "border-theme-border bg-theme-bg-secondary hover:border-theme-accent-primary/50"
      }`}
    >
      <div className="text-3xl mb-2">{icon}</div>
      <div className="text-sm font-medium text-theme-text-primary">{name}</div>
    </button>
  );
}

/**
 * 内置 Agent 配置表单
 * 允许配置角色提示词、Skills、工具、Agent Flow 和知识模式
 */
function InternalConfigForm({
  formData,
  onChange,
  availableFlows,
  loadingFlows,
  availableSkills,
  loadingSkills,
}) {
  // 获取当前选中的工具列表
  const selectedTools = formData.defaultTools || [];
  // 获取当前选中的 Skills 列表
  const selectedSkills = formData.skills || [];

  // 切换工具选择
  const toggleTool = (toolId) => {
    const newTools = selectedTools.includes(toolId)
      ? selectedTools.filter((t) => t !== toolId)
      : [...selectedTools, toolId];
    onChange({
      ...formData,
      defaultTools: newTools,
    });
  };

  // 切换 Skill 选择
  const toggleSkill = (skillId) => {
    const newSkills = selectedSkills.includes(skillId)
      ? selectedSkills.filter((s) => s !== skillId)
      : [...selectedSkills, skillId];
    onChange({
      ...formData,
      skills: newSkills,
    });
  };

  // 更新知识模式
  const handleKnowledgeModeChange = (mode) => {
    onChange({
      ...formData,
      knowledgeModeTemplate: mode,
    });
  };

  // 更新 Agent Flow
  const handleFlowChange = (flowId) => {
    onChange({
      ...formData,
      agentFlowId: flowId || null,
    });
  };

  // 更新角色提示词
  const handleSystemPromptChange = (value) => {
    onChange({
      ...formData,
      systemPrompt: value,
    });
  };

  return (
    <div className="space-y-6">
      {/* 角色提示词 */}
      <div>
        <label className="block text-sm font-medium text-theme-text-primary mb-2">
          角色提示词（System Prompt）
        </label>
        <textarea
          value={formData.systemPrompt || ""}
          onChange={(e) => handleSystemPromptChange(e.target.value)}
          placeholder="定义 AI 员工的角色、性格、专业领域和行为准则...&#10;&#10;示例：你是一位专业的市场调研分析师，擅长收集和分析市场数据。你的工作风格严谨专业，善于从数据中发现洞察。当用户询问市场相关问题时，你会系统性地分析并给出有依据的建议。"
          rows={6}
          className="w-full px-4 py-2.5 bg-theme-settings-input-bg text-theme-text-primary placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button outline-none border-none resize-none"
        />
        <p className="text-xs text-theme-text-secondary mt-1">
          角色提示词将作为系统消息发送给 LLM，用于定义 AI
          员工的角色定位、专业能力和行为风格
        </p>
      </div>

      {/* 知识模式选择 */}
      <div>
        <label className="block text-sm font-medium text-theme-text-primary mb-3">
          知识模式
        </label>
        <div className="grid grid-cols-2 gap-4">
          <button
            type="button"
            onClick={() => handleKnowledgeModeChange("workspace")}
            className={`p-4 rounded-lg border-2 text-left transition-all duration-300 ${
              formData.knowledgeModeTemplate === "workspace"
                ? "border-theme-accent-primary bg-theme-accent-primary/10"
                : "border-theme-border bg-theme-bg-secondary hover:border-theme-accent-primary/50"
            }`}
          >
            <div className="text-lg mb-1">📚 使用知识库</div>
            <div className="text-xs text-theme-text-secondary">
              从 Workspace 知识库中检索相关内容作为上下文
            </div>
          </button>
          <button
            type="button"
            onClick={() => handleKnowledgeModeChange("none")}
            className={`p-4 rounded-lg border-2 text-left transition-all duration-300 ${
              formData.knowledgeModeTemplate === "none"
                ? "border-theme-accent-primary bg-theme-accent-primary/10"
                : "border-theme-border bg-theme-bg-secondary hover:border-theme-accent-primary/50"
            }`}
          >
            <div className="text-lg mb-1">💡 通用知识</div>
            <div className="text-xs text-theme-text-secondary">
              仅使用 LLM 的通用知识，不依赖知识库
            </div>
          </button>
        </div>
      </div>

      {/* Agent Flow 选择 */}
      <div>
        <label className="block text-sm font-medium text-theme-text-primary mb-2">
          Agent Flow（可选）
        </label>
        <select
          value={formData.agentFlowId || ""}
          onChange={(e) => handleFlowChange(e.target.value)}
          disabled={loadingFlows}
          className="w-full px-4 py-2.5 bg-theme-settings-input-bg text-theme-text-primary text-sm rounded-lg focus:outline-primary-button outline-none border-none"
        >
          <option value="">不使用 Agent Flow</option>
          {availableFlows.map((flow) => (
            <option key={flow.uuid} value={flow.uuid}>
              {flow.name} - {flow.description?.substring(0, 50)}...
            </option>
          ))}
        </select>
        <p className="text-xs text-theme-text-secondary mt-1">
          选择预定义的工作流程，让 AI 员工按步骤完成复杂任务
        </p>
      </div>

      {/* Skills 能力包选择 */}
      <div>
        <label className="block text-sm font-medium text-theme-text-primary mb-3">
          专业能力包
          <span className="text-xs font-normal text-theme-text-secondary ml-2">
            选择此员工具备的专业能力（如文档处理、数据分析）
          </span>
        </label>
        {loadingSkills ? (
          <div className="text-sm text-theme-text-secondary">加载中...</div>
        ) : availableSkills.length === 0 ? (
          <div className="text-sm text-theme-text-secondary">
            暂无可用的能力包
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {availableSkills.map((skill) => (
              <label
                key={skill.id}
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all duration-300 ${
                  selectedSkills.includes(skill.id)
                    ? "border-purple-500 bg-purple-500/10"
                    : "border-theme-border bg-theme-bg-secondary hover:border-purple-500/50"
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedSkills.includes(skill.id)}
                  onChange={() => toggleSkill(skill.id)}
                  className="mt-1 rounded border-theme-border text-purple-500 focus:ring-purple-500"
                />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{skill.icon || "📦"}</span>
                    <span className="text-sm font-medium text-theme-text-primary">
                      {skill.name}
                    </span>
                  </div>
                  <div className="text-xs text-theme-text-secondary mt-1">
                    {skill.description}
                  </div>
                </div>
              </label>
            ))}
          </div>
        )}
        <p className="text-xs text-theme-text-secondary mt-2">
          能力包会为员工注入专业知识和推荐工具，提升特定领域的工作效果
        </p>
      </div>

      {/* 工具选择 */}
      <div>
        <label className="block text-sm font-medium text-theme-text-primary mb-3">
          基础工具
          <span className="text-xs font-normal text-theme-text-secondary ml-2">
            选择此员工可调用的基础工具
          </span>
        </label>
        <div className="grid grid-cols-2 gap-3">
          {AVAILABLE_TOOLS.map((tool) => (
            <label
              key={tool.id}
              className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all duration-300 ${
                selectedTools.includes(tool.id)
                  ? "border-theme-accent-primary bg-theme-accent-primary/10"
                  : "border-theme-border bg-theme-bg-secondary hover:border-theme-accent-primary/50"
              }`}
            >
              <input
                type="checkbox"
                checked={selectedTools.includes(tool.id)}
                onChange={() => toggleTool(tool.id)}
                className="mt-1 rounded border-theme-border text-theme-accent-primary focus:ring-theme-accent-primary"
              />
              <div>
                <div className="text-sm font-medium text-theme-text-primary">
                  {tool.name}
                </div>
                <div className="text-xs text-theme-text-secondary">
                  {tool.description}
                </div>
              </div>
            </label>
          ))}
        </div>
        <p className="text-xs text-theme-text-secondary mt-2">
          选择工具后，AI 员工将自动启用 Agent 模式来调用这些工具
        </p>
      </div>
    </div>
  );
}

// Dify 配置表单
function DifyConfigForm({ config, onChange }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-theme-text-primary mb-2">
          Base URL <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={config.baseUrl || ""}
          onChange={(e) => onChange("baseUrl", e.target.value)}
          placeholder="https://api.dify.ai/v1"
          className="w-full px-4 py-2.5 bg-theme-settings-input-bg text-theme-text-primary placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button outline-none border-none"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-theme-text-primary mb-2">
          API Key <span className="text-red-500">*</span>
        </label>
        <input
          type="password"
          value={config.apiKey || ""}
          onChange={(e) => onChange("apiKey", e.target.value)}
          placeholder="app-..."
          className="w-full px-4 py-2.5 bg-theme-settings-input-bg text-theme-text-primary placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button outline-none border-none"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-theme-text-primary mb-2">
          App ID <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={config.appId || ""}
          onChange={(e) => onChange("appId", e.target.value)}
          placeholder="应用 ID"
          className="w-full px-4 py-2.5 bg-theme-settings-input-bg text-theme-text-primary placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button outline-none border-none"
        />
      </div>
    </div>
  );
}

// RAGFlow 配置表单
function RagflowConfigForm({ config, onChange }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-theme-text-primary mb-2">
          Base URL <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={config.baseUrl || ""}
          onChange={(e) => onChange("baseUrl", e.target.value)}
          placeholder="https://your-ragflow-instance.com"
          className="w-full px-4 py-2.5 bg-theme-settings-input-bg text-theme-text-primary placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button outline-none border-none"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-theme-text-primary mb-2">
          API Key <span className="text-red-500">*</span>
        </label>
        <input
          type="password"
          value={config.apiKey || ""}
          onChange={(e) => onChange("apiKey", e.target.value)}
          placeholder="ragflow-..."
          className="w-full px-4 py-2.5 bg-theme-settings-input-bg text-theme-text-primary placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button outline-none border-none"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-theme-text-primary mb-2">
          类型 <span className="text-red-500">*</span>
        </label>
        <select
          value={config.type || "chat"}
          onChange={(e) => onChange("type", e.target.value)}
          className="w-full px-4 py-2.5 bg-theme-settings-input-bg text-theme-text-primary text-sm rounded-lg focus:outline-primary-button outline-none border-none"
        >
          <option value="chat">Chat</option>
          <option value="agent">Agent</option>
        </select>
      </div>
      {config.type === "chat" && (
        <div>
          <label className="block text-sm font-medium text-theme-text-primary mb-2">
            Chat ID <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={config.chatId || ""}
            onChange={(e) => onChange("chatId", e.target.value)}
            placeholder="Chat ID"
            className="w-full px-4 py-2.5 bg-theme-settings-input-bg text-theme-text-primary placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button outline-none border-none"
          />
        </div>
      )}
      {config.type === "agent" && (
        <div>
          <label className="block text-sm font-medium text-theme-text-primary mb-2">
            Agent ID <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={config.agentId || ""}
            onChange={(e) => onChange("agentId", e.target.value)}
            placeholder="Agent ID"
            className="w-full px-4 py-2.5 bg-theme-settings-input-bg text-theme-text-primary placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button outline-none border-none"
          />
        </div>
      )}
    </div>
  );
}

// n8n 配置表单
function N8nConfigForm({ config, onChange }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-theme-text-primary mb-2">
          Webhook URL <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={config.webhookUrl || ""}
          onChange={(e) => onChange("webhookUrl", e.target.value)}
          placeholder="https://your-n8n-instance.com/webhook/..."
          className="w-full px-4 py-2.5 bg-theme-settings-input-bg text-theme-text-primary placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button outline-none border-none"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-theme-text-primary mb-2">
          HTTP Method
        </label>
        <select
          value={config.method || "POST"}
          onChange={(e) => onChange("method", e.target.value)}
          className="w-full px-4 py-2.5 bg-theme-settings-input-bg text-theme-text-primary text-sm rounded-lg focus:outline-primary-button outline-none border-none"
        >
          <option value="POST">POST</option>
          <option value="GET">GET</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-theme-text-primary mb-2">
          Response Path（可选）
        </label>
        <input
          type="text"
          value={config.responsePath || ""}
          onChange={(e) => onChange("responsePath", e.target.value)}
          placeholder="例如：data.response"
          className="w-full px-4 py-2.5 bg-theme-settings-input-bg text-theme-text-primary placeholder:text-theme-settings-input-placeholder text-sm rounded-lg focus:outline-primary-button outline-none border-none"
        />
        <p className="text-xs text-theme-text-secondary mt-1">
          用于从响应中提取内容的 JSON 路径
        </p>
      </div>
    </div>
  );
}
