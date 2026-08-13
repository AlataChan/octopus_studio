const AIbitat = require("./aibitat");
const AgentPlugins = require("./aibitat/plugins");
const {
  WorkspaceAgentInvocation,
} = require("../../models/workspaceAgentInvocation");
const { User } = require("../../models/user");
const { WorkspaceChats } = require("../../models/workspaceChats");
const { WorkspaceParsedFiles } = require("../../models/workspaceParsedFiles");
const { safeJsonParse } = require("../http");
const { USER_AGENT, WORKSPACE_AGENT } = require("./defaults");
const ImportedPlugin = require("./imported");
const { AgentFlows } = require("../agentFlows");
const MCPCompatibilityLayer = require("../MCP");
const { AgentOrchestrator, isOrchestratorEnabled } = require("./orchestrator");
const prisma = require("../prisma");
const { Run } = require("../../models/run");
const { runEventEmitter } = require("../liveCanvas/runEventEmitter");
const { SSE_EVENTS } = require("../liveCanvas/types");
const { PermissionMode } = require("../permissions");
const {
  AgentRuntimeFactory,
} = require("./runtime/agentRuntimeFactory");
const {
  attachAgentPlugins,
  parseCallOptions: parseCallOptionsImpl,
} = require("./runtime/attachAgentPlugins");
const {
  applyHistoryCompaction,
  sourceWindowLimit,
} = require("./historyCompaction");

class AgentHandler {
  #invocationUUID;
  #funcsToLoad = [];
  #socket = null; // Phase L: 保存 WebSocket 引用用于 DebugTracer
  invocation = null;
  aibitat = null;
  channel = null;
  provider = null;
  model = null;

  constructor({ uuid }) {
    this.#invocationUUID = uuid;
  }

  log(text, ...args) {
    console.log(`\x1b[36m[AgentHandler]\x1b[0m ${text}`, ...args);
  }

  closeAlert() {
    this.log(`End ${this.#invocationUUID}::${this.provider}:${this.model}`);
  }

  async #chatHistory(limit = 10) {
    try {
      const effectiveLimit = sourceWindowLimit(process.env, limit);
      const rawHistory = (
        await WorkspaceChats.where(
          {
            workspaceId: this.invocation.workspace_id,
            user_id: this.invocation.user_id || null,
            thread_id: this.invocation.thread_id || null,
            api_session_id: null,
            include: true,
          },
          effectiveLimit,
          { id: "desc" }
        )
      ).reverse();

      const agentHistory = [];
      rawHistory.forEach((chatLog) => {
        agentHistory.push(
          {
            from: USER_AGENT.name,
            to: WORKSPACE_AGENT.name,
            content: chatLog.prompt,
            state: "success",
          },
          {
            from: WORKSPACE_AGENT.name,
            to: USER_AGENT.name,
            content: safeJsonParse(chatLog.response)?.text || "",
            state: "success",
          }
        );
      });
      return await applyHistoryCompaction(agentHistory);
    } catch (e) {
      this.log("Error loading chat history", e.message);
      return [];
    }
  }

  checkSetup() {
    switch (this.provider) {
      case "openai":
        if (!process.env.OPEN_AI_KEY)
          throw new Error("OpenAI API key must be provided to use agents.");
        break;
      case "anthropic":
        if (!process.env.ANTHROPIC_API_KEY)
          throw new Error("Anthropic API key must be provided to use agents.");
        break;
      case "lmstudio":
        if (!process.env.LMSTUDIO_BASE_PATH)
          throw new Error("LMStudio base path must be provided to use agents.");
        break;
      case "ollama":
        if (!process.env.OLLAMA_BASE_PATH)
          throw new Error("Ollama base path must be provided to use agents.");
        break;
      case "groq":
        if (!process.env.GROQ_API_KEY)
          throw new Error("Groq API key must be provided to use agents.");
        break;
      case "togetherai":
        if (!process.env.TOGETHER_AI_API_KEY)
          throw new Error("TogetherAI API key must be provided to use agents.");
        break;
      case "azure":
        if (!process.env.AZURE_OPENAI_ENDPOINT || !process.env.AZURE_OPENAI_KEY)
          throw new Error(
            "Azure OpenAI API endpoint and key must be provided to use agents."
          );
        break;
      case "koboldcpp":
        if (!process.env.KOBOLD_CPP_BASE_PATH)
          throw new Error(
            "KoboldCPP must have a valid base path to use for the api."
          );
        break;
      case "localai":
        if (!process.env.LOCAL_AI_BASE_PATH)
          throw new Error(
            "LocalAI must have a valid base path to use for the api."
          );
        break;
      case "openrouter":
        if (!process.env.OPENROUTER_API_KEY)
          throw new Error("OpenRouter API key must be provided to use agents.");
        break;
      case "mistral":
        if (!process.env.MISTRAL_API_KEY)
          throw new Error("Mistral API key must be provided to use agents.");
        break;
      case "generic-openai":
        if (!process.env.GENERIC_OPEN_AI_BASE_PATH)
          throw new Error("API base path must be provided to use agents.");
        break;
      case "aihubmix":
        if (!process.env.AIHUBMIX_API_KEY)
          throw new Error("AiHubMix API key must be provided to use agents.");
        break;
      case "perplexity":
        if (!process.env.PERPLEXITY_API_KEY)
          throw new Error("Perplexity API key must be provided to use agents.");
        break;
      case "textgenwebui":
        if (!process.env.TEXT_GEN_WEB_UI_BASE_PATH)
          throw new Error(
            "TextWebGenUI API base path must be provided to use agents."
          );
        break;
      case "bedrock":
        if (
          !process.env.AWS_BEDROCK_LLM_ACCESS_KEY_ID ||
          !process.env.AWS_BEDROCK_LLM_ACCESS_KEY ||
          !process.env.AWS_BEDROCK_LLM_REGION
        )
          throw new Error(
            "AWS Bedrock Access Keys and region must be provided to use agents."
          );
        break;
      case "fireworksai":
        if (!process.env.FIREWORKS_AI_LLM_API_KEY)
          throw new Error(
            "FireworksAI API Key must be provided to use agents."
          );
        break;
      case "deepseek":
        if (!process.env.DEEPSEEK_API_KEY)
          throw new Error("DeepSeek API Key must be provided to use agents.");
        break;
      case "litellm":
        if (!process.env.LITE_LLM_BASE_PATH)
          throw new Error(
            "LiteLLM API base path and key must be provided to use agents."
          );
        break;
      case "apipie":
        if (!process.env.APIPIE_LLM_API_KEY)
          throw new Error("ApiPie API Key must be provided to use agents.");
        break;
      case "xai":
        if (!process.env.XAI_LLM_API_KEY)
          throw new Error("xAI API Key must be provided to use agents.");
        break;
      case "novita":
        if (!process.env.NOVITA_LLM_API_KEY)
          throw new Error("Novita API Key must be provided to use agents.");
        break;
      case "nvidia-nim":
        if (!process.env.NVIDIA_NIM_LLM_BASE_PATH)
          throw new Error(
            "NVIDIA NIM base path must be provided to use agents."
          );
        break;
      case "ppio":
        if (!process.env.PPIO_API_KEY)
          throw new Error("PPIO API Key must be provided to use agents.");
        break;
      case "gemini":
        if (!process.env.GEMINI_API_KEY)
          throw new Error("Gemini API key must be provided to use agents.");
        break;
      case "dpais":
        if (!process.env.DPAIS_LLM_BASE_PATH)
          throw new Error(
            "Dell Pro AI Studio base path must be provided to use agents."
          );
        if (!process.env.DPAIS_LLM_MODEL_PREF)
          throw new Error(
            "Dell Pro AI Studio model must be set to use agents."
          );
        break;
      case "moonshotai":
        if (!process.env.MOONSHOT_AI_MODEL_PREF)
          throw new Error("Moonshot AI model must be set to use agents.");
        break;

      case "cometapi":
        if (!process.env.COMETAPI_LLM_API_KEY)
          throw new Error("CometAPI API Key must be provided to use agents.");
        break;

      case "foundry":
        if (!process.env.FOUNDRY_BASE_PATH)
          throw new Error("Foundry base path must be provided to use agents.");
        break;

      default:
        throw new Error(
          "No workspace agent provider set. Please set your agent provider in the workspace's settings"
        );
    }
  }

  /**
   * Finds the default model for a given provider. If no default model is set for it's associated ENV then
   * it will return a reasonable base model for the provider if one exists.
   * Thin delegate to AgentRuntimeFactory.providerDefault — logic lives in the factory.
   * @param {string} provider - The provider to find the default model for.
   * @returns {string|null} The default model for the provider.
   */
  providerDefault(provider = this.provider) {
    return AgentRuntimeFactory.providerDefault(provider);
  }

  #providerSetupAndCheck() {
    const { provider, model } = AgentRuntimeFactory.resolveProviderModel({
      workspace: this.invocation.workspace,
    });
    this.provider = provider;
    this.model = model;

    if (!this.provider)
      throw new Error("No valid provider found for the agent.");
    this.log(`Start ${this.#invocationUUID}::${this.provider}:${this.model}`);
    this.checkSetup();
  }

  async #validInvocation() {
    const invocation = await WorkspaceAgentInvocation.getWithWorkspace({
      uuid: String(this.#invocationUUID),
    });
    if (invocation?.closed)
      throw new Error("This agent invocation is already closed");
    this.invocation = invocation ?? null;
  }

  parseCallOptions(args, config = {}, pluginName) {
    return parseCallOptionsImpl(args, config, pluginName, this.log.bind(this));
  }

  async #attachPlugins(args) {
    await attachAgentPlugins({
      aibitat: this.aibitat,
      funcsToLoad: this.#funcsToLoad,
      args,
      log: this.log.bind(this),
    });
  }

  async #loadAgents() {
    // Default User agent and workspace agent
    this.log(`Attaching user and default agent to Agent cluster.`);
    const user = this.invocation.user_id
      ? await User.get({ id: Number(this.invocation.user_id) })
      : null;

    this.log(
      `[Agent] Checking assistant_id: ${this.invocation.assistant_id || "NOT SET"}`
    );

    // 通过工厂装配完整的运行时计划
    const invocationMetadata = safeJsonParse(this.invocation?.metadata, {}) || {};
    const plan = await AgentRuntimeFactory.assemble({
      workspace: this.invocation.workspace,
      user,
      assistantId: this.invocation.assistant_id || null,
      workspaceId: Number(this.invocation.workspace_id),
      invocationMetadata,
      provider: this.provider,
      log: this.log.bind(this),
    });

    // 用计划结果接线（等价原有 aibitat 调用序列）
    this.aibitat.setPermissionConfig(plan.permissionConfig);
    this.assistantConfig = plan.assistantConfig;
    this.runtimeSkillIds = plan.runtimeSkillIds;
    this.authorizationMode = plan.authorizationMode;

    this.aibitat.agent(USER_AGENT.name, plan.userAgentDef);
    this.aibitat.agent(WORKSPACE_AGENT.name, plan.workspaceAgentDef);
    this.#funcsToLoad = plan.funcsToLoad;

    // Debug: Log all loaded functions
    this.log(`[DEBUG] All functions to load (${this.#funcsToLoad.length}):`);
    this.#funcsToLoad.forEach((f) => this.log(`  - ${f}`));
  }

  async init() {
    await this.#validInvocation();
    this.#providerSetupAndCheck();
    return this;
  }

  async createAIbitat(
    args = {
      socket,
    }
  ) {
    // Phase L: 保存 socket 引用用于 DebugTracer
    this.#socket = args.socket;

    // 预加载当前用户信息,用于知识库/审核等插件 (document-review, generate-review-report 等)
    const user =
      this.invocation?.user_id != null
        ? await User.get({ id: Number(this.invocation.user_id) })
        : null;

    // Resolve thread slug for Live Canvas session binding.
    let threadSlug = null;
    if (this.invocation?.thread_id != null) {
      try {
        const thread = await prisma.workspace_threads.findUnique({
          where: { id: Number(this.invocation.thread_id) },
          select: { slug: true },
        });
        threadSlug = thread?.slug || null;
      } catch (error) {
        this.log(`[Agent] Failed to resolve thread slug: ${error.message}`);
      }
    }
    this.threadSlug = threadSlug;

    // Create a Run (Live Canvas) for this agent invocation (MVP: 1 run per invocation).
    // Only create when we have a threadSlug (sessionId in SSE).
    let run = null;
    if (threadSlug) {
      try {
        run = await Run.create({
          threadId: threadSlug,
          workspaceId: this.invocation?.workspace_id,
          triggerType: Run.TRIGGER.UI,
          triggerId: this.invocation?.uuid,
          engine: "mastra",
          metadata: {
            invocationUuid: this.invocation?.uuid,
            assistantId: this.invocation?.assistant_id || null,
            authorizationMode: this.authorizationMode || "hitl",
          },
        });

        this.runId = run.id;

        // Store run linkage on invocation metadata for debugging and for downstream systems.
        await WorkspaceAgentInvocation.updateMetadata(this.invocation?.uuid, {
          runId: run.id,
          threadSlug,
          authorizationMode: this.authorizationMode || "hitl",
        });

        runEventEmitter.emitForSession(threadSlug, SSE_EVENTS.RUN_CREATED, {
          runId: run.id,
          threadId: threadSlug,
          workspaceId: run.workspaceId,
          triggerType: run.triggerType,
          status: run.status,
          createdAt: run.createdAt,
        });

        const runningRun = await Run.updateStatus(run.id, Run.STATUS.RUNNING);
        runEventEmitter.emitForSession(threadSlug, SSE_EVENTS.RUN_UPDATED, {
          runId: runningRun.id,
          status: runningRun.status,
          startedAt: runningRun.startedAt,
        });
      } catch (error) {
        this.log(`[Agent] Failed to create Run: ${error.message}`);
      }
    }

    this.aibitat = new AIbitat({
      provider: this.provider ?? "openai",
      model: this.model ?? "gpt-4o",
      chats: await this.#chatHistory(20),
      handlerProps: {
        invocation: this.invocation,
        workspaceId: this.invocation?.workspace_id,
        workspace: this.invocation?.workspace ?? null,
        user,
        threadSlug,
        runId: run?.id || null,
        authorizationMode: this.authorizationMode || "hitl",
        log: this.log,
        // Agent invocations (websocket) are treated as auto/long-task mode.
        // Enable require-done from the beginning and after any tool usage.
        requireDoneToolOnStart: true,
        requireDoneToolAfterToolUse: true,
      },
    });

    // Attach standard websocket plugin for frontend communication.
    this.log(`Attached ${AgentPlugins.websocket.name} plugin to Agent cluster`);
    this.aibitat.use(
      AgentPlugins.websocket.plugin({
        socket: args.socket,
        muteUserReply: true,
        introspection: true,
      })
    );

    // Attach standard chat-history plugin for message storage.
    this.log(
      `Attached ${AgentPlugins.chatHistory.name} plugin to Agent cluster`
    );
    this.aibitat.use(AgentPlugins.chatHistory.plugin());

    // Load required agents (Default + custom)
    await this.#loadAgents();

    // Attach all required plugins for functions to operate.
    await this.#attachPlugins(args);
  }

  /**
   * 获取用户上传的解析文件内容
   * @returns {Promise<string>} 解析文件的内容
   */
  async #getParsedFilesContent() {
    try {
      // 获取当前用户信息
      const user = this.invocation.user_id
        ? await User.get({ id: Number(this.invocation.user_id) })
        : null;

      // 获取 workspace 对象
      const workspace = this.invocation.workspace;
      if (!workspace) return "";

      // 获取 thread（如果有）
      const thread = this.invocation.thread_id
        ? { id: this.invocation.thread_id }
        : null;

      // 获取解析后的文件
      const parsedFiles = await WorkspaceParsedFiles.getContextFiles(
        workspace,
        thread,
        user
      );

      if (!parsedFiles || parsedFiles.length === 0) {
        return "";
      }

      this.log(`[Agent] Found ${parsedFiles.length} parsed files in context`);

      // 构建文件内容
      const fileParts = parsedFiles.map((doc, index) => {
        const title = doc.title || doc.name || `文档 ${index + 1}`;
        return `\n--- 文档 ${index + 1}: ${title} ---\n${doc.pageContent}\n--- 文档结束 ---\n`;
      });

      return fileParts.join("\n");
    } catch (error) {
      this.log(`[Agent] Error getting parsed files: ${error.message}`);
      return "";
    }
  }

  /**
   * 构建包含附件内容的消息
   * @returns {Promise<string>} 包含附件信息的完整消息
   */
  async #buildMessageWithAttachments() {
    const basePrompt = this.invocation.prompt;
    const attachments = this.invocation.attachments || [];

    // 获取解析后的文件内容（用户上传的文档）
    const parsedFilesContent = await this.#getParsedFilesContent();

    // 处理图片附件
    const imageParts = [];
    for (const attachment of attachments) {
      if (!attachment) continue;

      // 图片附件（有 contentString 是 base64）
      if (attachment.mime?.startsWith("image/") && attachment.contentString) {
        imageParts.push(
          `[图片附件: "${attachment.name}" - 图片内容已作为多模态输入提供]`
        );
        // TODO: 如果 LLM 支持多模态，可以在这里处理图片
      }
    }

    // 组合消息
    const parts = [basePrompt];

    if (parsedFilesContent) {
      parts.push(
        `\n\n用户上传了以下文档，请根据文档内容完成任务：\n${parsedFilesContent}`
      );
    }

    if (imageParts.length > 0) {
      parts.push(`\n\n${imageParts.join("\n")}`);
    }

    const combinedMessage = parts.join("");
    this.log(
      `[Agent] Built message with context, total length: ${combinedMessage.length}`
    );

    return combinedMessage;
  }

  async startAgentCluster() {
    const messageContent = await this.#buildMessageWithAttachments();

    // 检查是否需要强制调用绑定的 Agent Flow
    // 条件：有绑定的 Flow + 消息中包含文档内容
    const hasDocuments = this.#hasDocumentContent(messageContent);
    if (this.assistantConfig?.agentFlowId && hasDocuments) {
      this.log(
        `[Agent] Detected documents in message, will force execute bound Flow`
      );
      return this.#forceExecuteFlow(messageContent);
    }

    // 如果启用了 Orchestrator，先进行 Planning
    if (isOrchestratorEnabled()) {
      const planningResult =
        await this.#runOrchestratorPlanning(messageContent);
      if (planningResult?.shouldSkipLLM) {
        // Orchestrator 决定直接执行 Flow，不需要 LLM 决策
        return planningResult;
      }
      // 否则继续正常的 LLM 执行流程
    }

    return this.aibitat.start({
      from: USER_AGENT.name,
      to: this.channel ?? WORKSPACE_AGENT.name,
      content: messageContent,
    });
  }

  /**
   * 运行 Orchestrator Planning
   * @param {string} messageContent - 用户消息内容
   * @returns {Promise<Object|null>} Planning 结果
   */
  async #runOrchestratorPlanning(messageContent) {
    try {
      this.log(`[Knowledge Orchestrator] Starting planning...`);

      // 获取可用的 Flows
      const availableFlows = AgentFlows.listFlows()
        .filter((f) => f.active !== false)
        .map((f) => ({
          identifier: `@@flow_${f.uuid}`,
          name: f.name,
          description: f.description || "",
        }));

      // 获取当前加载的工具（简化版）
      const availableTools = this.#funcsToLoad.map((func) => ({
        name: func,
        description: "", // 工具描述在 plugins 中
      }));

      // 调试日志：显示加载的工具
      this.log(
        `[Knowledge Orchestrator] Available tools (${this.#funcsToLoad.length}): ${this.#funcsToLoad.slice(0, 10).join(", ")}${this.#funcsToLoad.length > 10 ? "..." : ""}`
      );

      // 创建 Orchestrator 实例
      // 需要获取实际的 Provider 实例，而不是配置对象
      const actualProvider = this.aibitat.getProviderForConfig(
        this.aibitat.defaultProvider
      );
      const orchestrator = new AgentOrchestrator({
        provider: actualProvider,
        introspect: (msg) => this.aibitat.introspect?.(msg),
        log: (msg) => this.log(msg),
        invocationId: this.invocation?.id,
        invocationUuid: this.invocation?.uuid,
        // Phase L: 传递 socket 用于 DebugTracer
        socket: this.#socket,
        enableDebugTracer: process.env.ENABLE_DEBUG_TRACER === "true",
      });

      // 【关键】将 orchestrator 附加到 aibitat,以便 chat-history 插件能访问 blackboard
      this.aibitat._orchestrator = orchestrator;

      // Phase L: 将 DebugTracer 传递给 AIbitat
      this.aibitat.setDebugTracer(orchestrator.getDebugTracer());

      // 初始化 Blackboard（预填充知识上下文）
      const workspace = this.invocation?.workspace;
      const modelName = this.model;
      await orchestrator.initializeBlackboard(
        messageContent,
        workspace,
        modelName
      );

      // 获取知识上下文信息
      const knowledgeContext = orchestrator.getKnowledgeContext();
      const knowledgeCoverage = orchestrator.getKnowledgeCoverage();
      this.log(
        `[Knowledge Orchestrator] Knowledge coverage: ${knowledgeCoverage}`
      );

      // 执行 Planning
      const planResult = await orchestrator.selectExecutionPlan(
        messageContent,
        availableFlows,
        availableTools,
        workspace
      );

      if (!planResult.success) {
        this.log(
          `[Knowledge Orchestrator] Planning failed, falling back to LLM execution`
        );
        return null;
      }

      const plan = planResult.plan;
      this.log(
        `[Knowledge Orchestrator] Planning result: strategy=${plan.strategy}, steps=${plan.steps?.length || 0}`
      );

      // 通知前端 Planning 结果
      this.aibitat.introspect?.(`[编排器] 策略: ${plan.strategy}`);
      this.aibitat.introspect?.(`[编排器] 原因: ${plan.reason}`);
      if (knowledgeContext) {
        this.aibitat.introspect?.(
          `[知识库] 覆盖度: ${knowledgeCoverage}, 图谱节点: ${knowledgeContext.metadata?.graphNodes || 0}, 文档来源: ${knowledgeContext.metadata?.vectorSources || 0}`
        );
      }

      // 如果 Planning 选择了 Flow，直接执行（绕过 LLM 工具选择）
      if (plan.strategy === "flow" && plan.steps?.[0]?.type === "flow") {
        const flowStep = plan.steps[0];
        const flowId = flowStep.identifier?.replace("@@flow_", "");

        if (flowId) {
          this.log(
            `[Knowledge Orchestrator] Selected Flow: ${flowId}, executing directly...`
          );
          const result = await this.#executeOrchestratedFlow(
            flowId,
            messageContent,
            orchestrator
          );
          return { ...result, shouldSkipLLM: true };
        }
      }

      // 其他策略（direct/multi_flow）暂时回退到 LLM 执行
      return null;
    } catch (error) {
      this.log(`[Knowledge Orchestrator] Error: ${error.message}`);
      console.error(error);
      return null; // 出错时回退到正常 LLM 流程
    }
  }

  /**
   * 执行 Orchestrator 选择的 Flow
   * @param {string} flowId - Flow UUID
   * @param {string} messageContent - 用户消息
   * @param {AgentOrchestrator} orchestrator - Orchestrator 实例
   * @returns {Promise<Object>}
   */
  async #executeOrchestratedFlow(flowId, messageContent, orchestrator) {
    this.log(`[Knowledge Orchestrator] Executing orchestrated Flow: ${flowId}`);

    try {
      // 【关键】确保 orchestrator 已附加到 aibitat
      if (!this.aibitat._orchestrator) {
        this.aibitat._orchestrator = orchestrator;
      }

      // 从 Blackboard 获取上下文
      const context = orchestrator.blackboard?.getAll() || {};

      const result = await AgentFlows.executeFlow(
        flowId,
        {
          project_materials: messageContent,
          ...context,
        },
        this.aibitat
      );

      this.log(
        `[Knowledge Orchestrator] Flow execution completed. Success: ${result.success}`
      );

      if (result.success && result.directOutput) {
        await this.aibitat.newMessage({
          from: WORKSPACE_AGENT.name,
          to: USER_AGENT.name,
          content: result.directOutput,
          state: "success",
        });
        return { success: true, output: result.directOutput };
      } else if (!result.success) {
        const errorMsg = result.results?.[0]?.error || "工作流程执行失败";
        await this.aibitat.newMessage({
          from: WORKSPACE_AGENT.name,
          to: USER_AGENT.name,
          content: `⚠️ 工作流程执行失败：${errorMsg}`,
          state: "error",
        });
        return { success: false, error: errorMsg };
      }

      // Flow 成功但没有直接输出，继续 LLM 处理
      return { success: true, shouldSkipLLM: false };
    } catch (error) {
      this.log(
        `[Knowledge Orchestrator] Flow execution error: ${error.message}`
      );
      return { success: false, error: error.message, shouldSkipLLM: false };
    }
  }

  /**
   * 检查消息内容是否包含文档
   * @param {string} messageContent - 消息内容
   * @returns {boolean}
   */
  #hasDocumentContent(messageContent) {
    // 检查是否包含文档标记（在 #buildMessageWithAttachments 中添加的）
    return (
      messageContent.includes("--- 文档") ||
      messageContent.includes("用户上传了以下文档")
    );
  }

  /**
   * 强制执行绑定的 Agent Flow（绕过 LLM 决策）
   * @param {string} messageContent - 用户消息内容（包含文档）
   * @returns {Promise<Object>}
   */
  async #forceExecuteFlow(messageContent) {
    const flowId = this.assistantConfig.agentFlowId;
    const assistantName = this.assistantConfig.name;

    this.log(
      `[Agent] Force executing bound Flow: ${flowId} for assistant: ${assistantName}`
    );

    // 通知前端正在执行 Flow
    this.aibitat.introspect?.(`正在执行 ${assistantName} 的专属工作流程...`);

    try {
      const { AgentFlows } = require("../agentFlows");
      const result = await AgentFlows.executeFlow(
        flowId,
        { project_materials: messageContent },
        this.aibitat
      );

      this.log(`[Agent] Flow execution completed. Success: ${result.success}`);

      if (result.success && result.directOutput) {
        // Flow 有直接输出，发送到前端
        await this.aibitat.newMessage({
          from: WORKSPACE_AGENT.name,
          to: USER_AGENT.name,
          content: result.directOutput,
          state: "success",
        });
        return { success: true, output: result.directOutput };
      } else if (!result.success) {
        const errorMsg = result.results?.[0]?.error || "工作流程执行失败";
        await this.aibitat.newMessage({
          from: WORKSPACE_AGENT.name,
          to: USER_AGENT.name,
          content: `⚠️ 工作流程执行失败：${errorMsg}`,
          state: "error",
        });
        return { success: false, error: errorMsg };
      }

      return result;
    } catch (error) {
      this.log(`[Agent] Flow execution error: ${error.message}`);
      await this.aibitat.newMessage({
        from: WORKSPACE_AGENT.name,
        to: USER_AGENT.name,
        content: `⚠️ 工作流程执行出错：${error.message}`,
        state: "error",
      });
      return { success: false, error: error.message };
    }
  }
}

module.exports.AgentHandler = AgentHandler;
