const { v4: uuidv4 } = require("uuid");
const { DocumentManager } = require("../DocumentManager");
const { WorkspaceChats } = require("../../models/workspaceChats");
const { WorkspaceParsedFiles } = require("../../models/workspaceParsedFiles");
const { getVectorDbClass } = require("../helpers");
const { getRoutedLLMConnector } = require("./routedLLMConnector");
const { writeResponseChunk } = require("../helpers/chat/responses");
const { grepAgents } = require("./agents");
const {
  grepCommand,
  VALID_COMMANDS,
  chatPrompt,
  recentChatHistory,
  sourceIdentifier,
} = require("./index");
const { WorkspaceAssistant } = require("../../models/workspaceAssistant");
const { safeJsonParse } = require("../http");
const { handleExternalPlatformChat } = require("./externalPlatformHandler");
const { resolveKnowledgeMode } = require("./knowledgeModeResolver");
const { calculateContextAllocation } = require("./contextAllocation");
const { Metrics } = require("../../models/metrics");
const {
  getGraphContextForChat,
  getConversationSummaryContext,
} = require("./contextEnhancer");
const { BillingService } = require("../billing");
const { getMessageLimit } = require("./config");
const { applyHybridRetrieval } = require("./hybridRetrieval");
const { applyOctopusKbRetrieval } = require("../octopusKb/retrievalMerge");
const { isTeamTrigger } = require("../agents/orchestration/teamTrigger");
const {
  handleTeamOrchestration,
} = require("../agents/orchestration/handleTeamChat");
const { checkChatInput, redactForPersist } = require("./chatGuardrail");
const { createVideoSummaryCache } = require("../../models/videoSummaryCache");
const { NoVideoProviderError } = require("../VideoProviders/errors");
const crypto = require("crypto");
const fs = require("fs");

const VALID_CHAT_MODE = ["chat", "query"];
const videoSummaryCache = createVideoSummaryCache();

/**
 * 根据回复风格生成提示词片段
 * @param {string|null} responseStyle - 回复风格 (quick/normal/thinking)
 * @returns {string} 提示词片段
 */
function getResponseStylePrompt(responseStyle) {
  const stylePrompts = {
    quick:
      "\n\n【回复风格指示】请保持回复简洁，直接给出答案，省略不必要的解释和背景信息。",
    normal: "", // 默认风格，不添加额外提示
    thinking:
      "\n\n【回复风格指示】请提供详细的解释和背景信息，深入分析问题，给出全面、深入的回答。",
  };
  return stylePrompts[responseStyle] || "";
}

async function prepareVideoBypassContext({
  attachments = [],
  contextTexts = [],
  provider = null,
  cache = videoSummaryCache,
  videoUnderstandingEnabled = null,
} = {}) {
  if (!attachments.length) return { attachments, contextTexts };

  const passthroughAttachments = [];
  const nextContextTexts = [...contextTexts];
  let activeProvider = provider;
  let enabled = videoUnderstandingEnabled;

  for (const attachment of attachments) {
    if (!isVideoAttachment(attachment)) {
      passthroughAttachments.push(attachment);
      continue;
    }

    if (enabled === null) {
      const { SystemSettings } = require("../../models/systemSettings");
      enabled = await SystemSettings.videoUnderstandingEnabled();
    }

    if (!enabled) {
      throw new NoVideoProviderError(
        "Video understanding is disabled. Ask an admin to enable Video Understanding before uploading videos."
      );
    }

    if (!activeProvider) {
      const {
        getVideoProvider,
        hasVideoProvider,
      } = require("../VideoProviders");
      if (!(await hasVideoProvider())) {
        throw new NoVideoProviderError(
          "Video understanding is enabled, but no supported video provider is configured. Configure Moonshot or another video provider before uploading videos."
        );
      }
      activeProvider = await getVideoProvider();
    }

    const cacheKey = await videoAttachmentCacheKey(attachment);
    let summary = await readVideoSummaryCache(cache, cacheKey);

    if (!summary) {
      const { sourceRef } = await activeProvider.uploadVideo({
        data: await videoAttachmentBytes(attachment),
        mimeType: attachment.mimeType || attachment.mime,
        filename: attachment.filename || attachment.name,
      });
      summary = await activeProvider.understand({ sourceRef });
      await writeVideoSummaryCache(cache, cacheKey, summary);
    }

    nextContextTexts.push(formatVideoSummaryContext({ attachment, summary }));
  }

  return {
    attachments: passthroughAttachments,
    contextTexts: nextContextTexts,
  };
}

function isVideoAttachment(attachment) {
  const mimeType = attachment?.mimeType || attachment?.mime;
  return typeof mimeType === "string" && mimeType.startsWith("video/");
}

async function videoAttachmentCacheKey(attachment) {
  const bytes = await videoAttachmentBytes(attachment);
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

async function readVideoSummaryCache(cache, key) {
  if (!cache || typeof cache.get !== "function") return null;
  return cache.get(key);
}

async function writeVideoSummaryCache(cache, key, summary) {
  if (!cache || typeof cache.set !== "function") return;
  await cache.set(key, summary);
}

async function videoAttachmentBytes(attachment) {
  if (attachment?.data) {
    return Buffer.isBuffer(attachment.data)
      ? attachment.data
      : Buffer.from(attachment.data);
  }

  if (attachment?.contentString) {
    return decodeAttachmentContentString(attachment.contentString);
  }

  if (attachment?.path) {
    return fs.promises.readFile(attachment.path);
  }

  throw new Error("Video attachment is missing data, contentString, or path.");
}

function decodeAttachmentContentString(contentString) {
  const marker = ";base64,";
  const markerIndex = contentString.indexOf(marker);
  const encoded =
    markerIndex >= 0
      ? contentString.slice(markerIndex + marker.length)
      : contentString;
  return Buffer.from(encoded, "base64");
}

function formatVideoSummaryContext({ attachment, summary }) {
  const filename = attachment.filename || attachment.name || "uploaded video";
  const lines = [
    "Video understanding summary",
    `[VIDEO UNDERSTANDING: ${filename}]`,
    `Provider: ${summary?.meta?.provider || "unknown"}`,
    `Source: ${summary?.meta?.sourceRef || "unknown"}`,
    "Transcript:",
    summary?.transcript || "",
    "Scene timeline:",
  ];

  const timeline = Array.isArray(summary?.sceneTimeline)
    ? summary.sceneTimeline
    : [];
  if (timeline.length) {
    for (const scene of timeline) {
      lines.push(
        `- ${scene.tStart ?? 0}s-${scene.tEnd ?? 0}s: ${scene.description || ""}`
      );
    }
  } else {
    lines.push("- No scene timeline extracted.");
  }

  lines.push("Key observations:");
  const observations = Array.isArray(summary?.keyObservations)
    ? summary.keyObservations
    : [];
  if (observations.length) {
    for (const observation of observations) lines.push(`- ${observation}`);
  } else {
    lines.push("- No key observations extracted.");
  }

  lines.push("[END VIDEO UNDERSTANDING]");
  return lines.join("\n");
}

async function persistChat({
  workspaceId,
  prompt,
  response,
  redactor = redactForPersist,
  ...rest
}) {
  const redactedPrompt = await redactor(prompt, { workspaceId });
  let redactedResponse = response;
  if (response && Object.prototype.hasOwnProperty.call(response, "text")) {
    redactedResponse = {
      ...response,
      text: await redactor(response.text, { workspaceId }),
    };
  }

  return WorkspaceChats.new({
    workspaceId,
    prompt: redactedPrompt,
    response: redactedResponse,
    ...rest,
  });
}

async function streamChatWithWorkspace(
  response,
  workspace,
  message,
  chatMode = "chat",
  user = null,
  thread = null,
  attachments = [],
  assistantId = null,
  responseStyle = null,
  authorizationMode = null
) {
  const uuid = uuidv4();
  const startTime = Date.now(); // 记录开始时间
  const updatedMessage = await grepCommand(message, user);

  // 【团队编排分流】flag 关时 isTeamTrigger 直接返回 false → 普通链路零影响
  if (isTeamTrigger({ message: updatedMessage, assistantId })) {
    try {
      const handled = await handleTeamOrchestration({
        response,
        workspace,
        message: updatedMessage,
        user,
        thread,
        assistantId,
        uuid,
      });
      if (handled) return;
    } catch (e) {
      console.error("[Chat] Team orchestration error:", e);
      // 出错回退普通链路(不中断用户)
    }
  }

  const _gi = await checkChatInput(updatedMessage, {
    workspaceId: workspace.id,
  });
  if (_gi.blocked) {
    writeResponseChunk(response, {
      id: uuid,
      type: "textResponse",
      textResponse: "输入被安全策略拦截（疑似提示注入）。",
      sources: [],
      close: true,
      error: null,
    });
    return;
  }

  // 【新增】解析知识模式
  const {
    mode: knowledgeMode,
    template,
    instance,
  } = await resolveKnowledgeMode(assistantId, workspace.id);

  console.log(
    `[Chat] Knowledge mode: ${knowledgeMode}, assistant: ${assistantId || "none"}`
  );

  // 【分支 1】platform 模式：委托给外部平台
  if (knowledgeMode === "platform") {
    try {
      // T-platform: successful platform handlers persist internally and are
      // outside chat guardrail v1; input blocking above still applies.
      const handled = await handleExternalPlatformChat({
        response,
        workspace,
        message: updatedMessage,
        template,
        assistant: instance,
        user,
        thread,
        attachments,
        chatMode,
      });

      if (handled) {
        console.log(
          `[Chat] External platform ${template.platformType} handled successfully`
        );
        return;
      }
    } catch (error) {
      // 外部平台调用失败，直接向用户报错，不回退到 workspace 模式
      console.error("[Chat] External platform error:", error);
      writeResponseChunk(response, {
        id: uuid,
        type: "abort",
        textResponse: null,
        sources: [],
        close: true,
        error: `外部平台调用失败：${error.message}。请检查平台配置或联系管理员。`,
      });

      // 保存错误记录
      await persistChat({
        workspaceId: workspace.id,
        prompt: message,
        response: {
          text: `外部平台调用失败：${error.message}`,
          sources: [],
          type: chatMode,
          attachments,
          metadata: {
            knowledgeMode: "platform",
            error: error.message,
            platformType: template?.platformType,
          },
        },
        threadId: thread?.id || null,
        include: false,
        user,
      });

      // 记录错误指标
      const responseTime = Date.now() - startTime;
      await Metrics.recordChat({
        workspaceId: workspace.id,
        userId: user?.id || null,
        assistantId,
        knowledgeMode: "platform",
        responseTime,
        tokensUsed: 0,
        hasError: true,
        metadata: {
          error: error.message,
          platformType: template?.platformType,
        },
      });

      return;
    }
  }

  // 【分支 2】none 模式：跳过知识检索，但保留工具调用能力
  if (knowledgeMode === "none") {
    console.log("[Chat] Knowledge mode is 'none', skipping vector search");

    // 先检查是否有 Agent 调用（MCP/Tools）
    const isAgentChat = await grepAgents({
      uuid,
      response,
      message: updatedMessage,
      user,
      workspace,
      thread,
      assistantId,
      attachments, // 传递附件给 Agent
      authorizationMode,
    });

    if (isAgentChat) {
      // Agent 流程已接管，直接返回
      return;
    }

    // 如果没有 agent 调用，走普通 LLM 对话流程（不使用知识库）
    const prompt = await chatPrompt(workspace, user);
    const stylePrompt = getResponseStylePrompt(responseStyle);
    const { chatHistory } = await recentChatHistory({
      user,
      workspace,
      thread,
      messageLimit: getMessageLimit(workspace),
    });

    const messages = [
      { role: "system", content: prompt + stylePrompt },
      ...chatHistory,
      { role: "user", content: updatedMessage },
    ];

    const LLMConnector = await getRoutedLLMConnector({
      workspace,
      message: updatedMessage,
      history: chatHistory,
      attachments,
      exit: "E1",
    });

    const stream = await LLMConnector.streamGetChatCompletion(messages, {
      temperature: workspace?.openAiTemp ?? LLMConnector.defaultTemp,
    });

    const completeText = await LLMConnector.handleStream(response, stream, {
      uuid,
      sources: [],
    });

    // 保存聊天记录（metadata 中标记 knowledgeMode）
    const { chat } = await persistChat({
      workspaceId: workspace.id,
      prompt: message,
      response: {
        text: completeText,
        sources: [],
        type: chatMode,
        attachments,
        metadata: { knowledgeMode: "none" },
      },
      threadId: thread?.id || null,
      assistantId,
      user,
    });

    // 发送 finalizeResponseStream 消息，让前端知道响应已完成
    writeResponseChunk(response, {
      uuid,
      type: "finalizeResponseStream",
      close: true,
      error: false,
      chatId: chat.id,
    });

    return;
  }

  // 【分支 3】workspace 模式（默认）：走现有 RAG 流程
  // 加载助手配置（如果有）
  let assistantConfig = null;
  if (instance && template) {
    // 辅助函数：安全地获取对象或解析 JSON
    const getObjectOrParse = (value, fallback = {}) => {
      if (!value) return fallback;
      if (typeof value === "object") return value;
      if (typeof value === "string") return safeJsonParse(value, fallback);
      return fallback;
    };

    assistantConfig = {
      systemPrompt: template.systemPrompt || null,
      agentFlowId: template.agentFlowId || null,
      tools: getObjectOrParse(template.defaultTools, {}),
      mcpServers: getObjectOrParse(template.defaultMCPServers, {}),
      recommendedModel: template.recommendedModel || null,
      // Merge custom config from instance
      ...getObjectOrParse(instance.customConfig, {}),
    };

    // Record usage
    await WorkspaceAssistant.recordUsage(assistantId);

    console.log(
      `[Assistant] Using assistant: ${instance.instanceName || template.name} (${assistantId})`
    );
  }

  if (Object.keys(VALID_COMMANDS).includes(updatedMessage)) {
    const data = await VALID_COMMANDS[updatedMessage](
      workspace,
      message,
      uuid,
      user,
      thread
    );
    writeResponseChunk(response, data);
    return;
  }

  // If is agent enabled chat we will exit this flow early.
  const isAgentChat = await grepAgents({
    uuid,
    response,
    message: updatedMessage,
    user,
    workspace,
    thread,
    assistantId, // 传递选中的AI员工ID
    attachments, // 传递附件给 Agent
    authorizationMode,
  });
  if (isAgentChat) return;

  const LLMConnector = await getRoutedLLMConnector({
    workspace,
    message: updatedMessage,
    history: [],
    attachments,
    exit: "E2",
  });
  const VectorDb = getVectorDbClass();

  const messageLimit = getMessageLimit(workspace);
  const hasVectorizedSpace = await VectorDb.hasNamespace(workspace.slug);
  const embeddingsCount = await VectorDb.namespaceCount(workspace.slug);

  // User is trying to query-mode chat a workspace that has no data in it - so
  // we should exit early as no information can be found under these conditions.
  if ((!hasVectorizedSpace || embeddingsCount === 0) && chatMode === "query") {
    const textResponse =
      workspace?.queryRefusalResponse ??
      "There is no relevant information in this workspace to answer your query.";
    writeResponseChunk(response, {
      id: uuid,
      type: "textResponse",
      textResponse,
      sources: [],
      attachments,
      close: true,
      error: null,
    });
    await persistChat({
      workspaceId: workspace.id,
      prompt: message,
      response: {
        text: textResponse,
        sources: [],
        type: chatMode,
        attachments,
      },
      threadId: thread?.id || null,
      include: false,
      user,
    });
    return;
  }

  // If we are here we know that we are in a workspace that is:
  // 1. Chatting in "chat" mode and may or may _not_ have embeddings
  // 2. Chatting in "query" mode and has at least 1 embedding
  let completeText;
  let metrics = {};
  let contextTexts = [];
  let sources = [];
  let pinnedDocIdentifiers = [];
  const { rawHistory, chatHistory } = await recentChatHistory({
    user,
    workspace,
    thread,
    messageLimit,
  });

  // Look for pinned documents and see if the user decided to use this feature. We will also do a vector search
  // as pinning is a supplemental tool but it should be used with caution since it can easily blow up a context window.
  // However we limit the maximum of appended context to 80% of its overall size, mostly because if it expands beyond this
  // it will undergo prompt compression anyway to make it work. If there is so much pinned that the context here is bigger than
  // what the model can support - it would get compressed anyway and that really is not the point of pinning. It is really best
  // suited for high-context models.
  await new DocumentManager({
    workspace,
    maxTokens: LLMConnector.promptWindowLimit(),
  })
    .pinnedDocs()
    .then((pinnedDocs) => {
      pinnedDocs.forEach((doc) => {
        const { pageContent, ...metadata } = doc;
        pinnedDocIdentifiers.push(sourceIdentifier(doc));
        contextTexts.push(doc.pageContent);
        sources.push({
          text:
            pageContent.slice(0, 1_000) +
            "...continued on in source document...",
          ...metadata,
        });
      });
    });

  // Inject any parsed files for this workspace/thread/user
  const parsedFiles = await WorkspaceParsedFiles.getContextFiles(
    workspace,
    thread || null,
    user || null
  );
  parsedFiles.forEach((doc) => {
    const { pageContent, ...metadata } = doc;
    contextTexts.push(doc.pageContent);
    sources.push({
      text:
        pageContent.slice(0, 1_000) + "...continued on in source document...",
      ...metadata,
    });
  });

  // 【新增】计算上下文窗口分配
  const allocation = calculateContextAllocation({
    modelName: workspace?.chatModel,
    hasGraphContext: knowledgeMode === "workspace",
    hasVectorContext: embeddingsCount !== 0,
  });

  console.log("[ContextAllocation]", {
    model: workspace?.chatModel,
    totalBudget: allocation.totalBudget,
    allocation: allocation.allocation,
    metadata: allocation.metadata,
  });

  const vectorSearchResults =
    embeddingsCount !== 0
      ? await VectorDb.performSimilaritySearch({
          namespace: workspace.slug,
          input: updatedMessage,
          LLMConnector,
          similarityThreshold: workspace?.similarityThreshold,
          topN: workspace?.topN,
          filterIdentifiers: pinnedDocIdentifiers,
          rerank: workspace?.vectorSearchMode === "rerank",
        })
      : {
          contextTexts: [],
          sources: [],
          message: null,
        };

  // Failed similarity search if it was run at all and failed.
  if (!!vectorSearchResults.message) {
    writeResponseChunk(response, {
      id: uuid,
      type: "abort",
      textResponse: null,
      sources: [],
      close: true,
      error: vectorSearchResults.message,
    });
    return;
  }

  // 【Phase 0】注入对话摘要上下文
  let summaryInjected = false;
  const summaryContext = getConversationSummaryContext(thread);
  if (summaryContext) {
    contextTexts.unshift(summaryContext); // 摘要放在最前面，提供对话背景
    summaryInjected = true;
    console.log("[ContextEnhancer] Summary injected for thread:", thread?.id);
  }

  // 【Phase 0】搜索并总结图谱上下文 (仅在 workspace 模式下)
  // 使用统一的 getGraphContextForChat 函数
  let graphContextSummary = null;
  if (knowledgeMode === "workspace") {
    const graphResult = await getGraphContextForChat({
      workspaceId: workspace.id,
      query: updatedMessage,
      tokenBudget: allocation.allocation.graphContext,
      limit: 50,
    });

    if (graphResult?.summary) {
      graphContextSummary = graphResult.summary;
      contextTexts.push(graphContextSummary);

      // 添加图谱来源标记
      sources.push({
        text: `知识图谱上下文 (${graphResult.nodeCount} 个节点, ${graphResult.edgeCount} 条关系)`,
        title: "知识图谱",
        type: "graph",
        metadata: {
          nodeCount: graphResult.nodeCount,
          edgeCount: graphResult.edgeCount,
          tokenCount: graphResult.tokenCount,
        },
      });
    }
  }

  // 【Phase 0】应用混合检索重排序
  const hybridResults = applyHybridRetrieval({
    sources: vectorSearchResults.sources,
    contextTexts: vectorSearchResults.contextTexts,
    enabled: true,
  });

  const { fillSourceWindow } = require("../helpers/chat");
  const filledSources = fillSourceWindow({
    nDocs: workspace?.topN || 4,
    searchResults: hybridResults.sources, // 使用混合检索重排序后的结果
    history: rawHistory,
    filterIdentifiers: pinnedDocIdentifiers,
  });

  // Why does contextTexts get all the info, but sources only get current search?
  // This is to give the ability of the LLM to "comprehend" a contextual response without
  // populating the Citations under a response with documents the user "thinks" are irrelevant
  // due to how we manage backfilling of the context to keep chats with the LLM more correct in responses.
  // If a past citation was used to answer the question - that is visible in the history so it logically makes sense
  // and does not appear to the user that a new response used information that is otherwise irrelevant for a given prompt.
  // TLDR; reduces GitHub issues for "LLM citing document that has no answer in it" while keep answers highly accurate.
  contextTexts = [...contextTexts, ...filledSources.contextTexts];
  sources = [...sources, ...hybridResults.sources]; // 使用混合检索重排序后的结果

  const kbRetrieval = await applyOctopusKbRetrieval({
    workspace,
    query: updatedMessage,
    contextTexts,
    sources,
    graphSummary: graphContextSummary,
  });
  contextTexts = kbRetrieval.contextTexts;
  sources = kbRetrieval.sources;

  // If in query mode and no context chunks are found from search, backfill, or pins -  do not
  // let the LLM try to hallucinate a response or use general knowledge and exit early
  if (chatMode === "query" && contextTexts.length === 0) {
    const textResponse =
      workspace?.queryRefusalResponse ??
      "There is no relevant information in this workspace to answer your query.";
    writeResponseChunk(response, {
      id: uuid,
      type: "textResponse",
      textResponse,
      sources: [],
      close: true,
      error: null,
    });

    await persistChat({
      workspaceId: workspace.id,
      prompt: message,
      response: {
        text: textResponse,
        sources: [],
        type: chatMode,
        attachments,
      },
      threadId: thread?.id || null,
      include: false,
      user,
    });
    return;
  }

  // Compress & Assemble message to ensure prompt passes token limit with room for response
  // and build system messages based on inputs and history.
  // If assistant is configured, use its systemPrompt instead of workspace default
  const baseSystemPrompt = assistantConfig?.systemPrompt
    ? assistantConfig.systemPrompt
    : await chatPrompt(workspace, user);

  // 注入回复风格提示词
  const stylePrompt = getResponseStylePrompt(responseStyle);
  const systemPrompt = baseSystemPrompt + stylePrompt;
  const videoBypass = await prepareVideoBypassContext({
    attachments,
    contextTexts,
  });
  contextTexts = videoBypass.contextTexts;
  const modelAttachments = videoBypass.attachments;

  const messages = await LLMConnector.compressMessages(
    {
      systemPrompt,
      userPrompt: updatedMessage,
      contextTexts,
      chatHistory,
      attachments: modelAttachments,
    },
    rawHistory
  );

  // If streaming is not explicitly enabled for connector
  // we do regular waiting of a response and send a single chunk.
  if (LLMConnector.streamingEnabled() !== true) {
    console.log(
      `\x1b[31m[STREAMING DISABLED]\x1b[0m Streaming is not available for ${LLMConnector.constructor.name}. Will use regular chat method.`
    );
    const { textResponse, metrics: performanceMetrics } =
      await LLMConnector.getChatCompletion(messages, {
        temperature: workspace?.openAiTemp ?? LLMConnector.defaultTemp,
      });

    completeText = textResponse;
    metrics = performanceMetrics;
    writeResponseChunk(response, {
      uuid,
      sources,
      type: "textResponseChunk",
      textResponse: completeText,
      close: true,
      error: false,
      metrics,
    });
  } else {
    const stream = await LLMConnector.streamGetChatCompletion(messages, {
      temperature: workspace?.openAiTemp ?? LLMConnector.defaultTemp,
    });
    completeText = await LLMConnector.handleStream(response, stream, {
      uuid,
      sources,
    });
    metrics = stream.metrics;
  }

  if (completeText?.length > 0) {
    // 构建响应对象，包含 metadata（如果有 Agent Flow 执行）
    const responseData = {
      text: completeText,
      sources,
      type: chatMode,
      attachments,
      metrics,
      metadata: {
        knowledgeMode: "workspace",
        assistantId: assistantId || null,
        contextAllocation: allocation.allocation,
        graphContextUsed: !!graphContextSummary,
        summaryInjected, // 【Phase 0】记录是否注入了对话摘要
        hybridRetrievalApplied: hybridResults.hybridApplied, // 【Phase 0】记录是否应用了混合检索
        octopusKbRetrieval: kbRetrieval.metadata,
      },
    };

    // 如果使用了 assistant 并且有 agentFlowId，可能会有角色元数据
    // 这里预留 metadata 字段，实际的角色信息会在 Agent Flow 执行时填充
    // TODO: 在 Agent Flow 集成时，从 flow 执行结果中提取 metadata

    const { chat } = await persistChat({
      workspaceId: workspace.id,
      prompt: message,
      response: responseData,
      threadId: thread?.id || null,
      assistantId,
      user,
    });

    // 记录指标
    const responseTime = Date.now() - startTime;
    await Metrics.recordChat({
      workspaceId: workspace.id,
      userId: user?.id || null,
      assistantId,
      knowledgeMode,
      responseTime,
      tokensUsed: metrics?.totalTokens || 0,
      hasError: false,
      metadata: {
        chatMode,
        sources: sources.length,
        graphContext: sources.some((s) => s.type === "graph"),
        octopusKbRetrieval: kbRetrieval.metadata,
      },
    });

    // 【计费系统】记录 Token 消耗并扣费
    if (metrics?.prompt_tokens || metrics?.completion_tokens) {
      await BillingService.postCharge({
        userId: user?.id || null,
        workspaceId: workspace.id,
        assistantId,
        modelName:
          workspace?.chatModel || process.env.LLM_PROVIDER || "unknown",
        inputTokens: metrics?.prompt_tokens || 0,
        outputTokens: metrics?.completion_tokens || 0,
        apiEndpoint: "/workspace/stream-chat",
      });
    }

    writeResponseChunk(response, {
      uuid,
      type: "finalizeResponseStream",
      close: true,
      error: false,
      chatId: chat.id,
      metrics,
    });
    return;
  }

  // 记录指标 (无 chat 保存的情况)
  const responseTime = Date.now() - startTime;
  await Metrics.recordChat({
    workspaceId: workspace.id,
    userId: user?.id || null,
    assistantId,
    knowledgeMode,
    responseTime,
    tokensUsed: metrics?.totalTokens || 0,
    hasError: false,
    metadata: {
      chatMode,
      sources: sources.length,
    },
  });

  // 【计费系统】记录 Token 消耗并扣费
  if (metrics?.prompt_tokens || metrics?.completion_tokens) {
    await BillingService.postCharge({
      userId: user?.id || null,
      workspaceId: workspace.id,
      assistantId,
      modelName: workspace?.chatModel || process.env.LLM_PROVIDER || "unknown",
      inputTokens: metrics?.prompt_tokens || 0,
      outputTokens: metrics?.completion_tokens || 0,
      apiEndpoint: "/workspace/stream-chat",
    });
  }

  writeResponseChunk(response, {
    uuid,
    type: "finalizeResponseStream",
    close: true,
    error: false,
    metrics,
  });
  return;
}

module.exports = {
  VALID_CHAT_MODE,
  prepareVideoBypassContext,
  persistChat,
  streamChatWithWorkspace,
};
