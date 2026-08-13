import { v4 } from "uuid";
import { safeJsonParse } from "../request";
import { saveAs } from "file-saver";
import { API_BASE } from "../constants";
import { useEffect, useState } from "react";

export const AGENT_SESSION_START = "agentSessionStart";
export const AGENT_SESSION_END = "agentSessionEnd";
export const AGENT_DIAGNOSTICS = "agentDiagnostics"; // Phase L3.1: 自我诊断事件
export const AGENT_DEBUG_EVENT = "agentDebugEvent"; // Phase L: Agent 调试面板事件
export const TOOL_EXECUTION_EVENT = "toolExecutionEvent"; // Phase D: 工具执行事件
export const PLANNING_DECISION_EVENT = "planningDecisionEvent"; // Phase F: Planning 可视化事件
export const STRUCTURED_OUTPUT_EVENT = "structuredOutputEvent"; // Phase J: 结构化输出事件
export const CONVERSATION_SUMMARY_EVENT = "conversationSummaryEvent"; // Phase K: 对话摘要事件
export const FLOW_FAILURE_EVENT = "flowFailureEvent"; // Phase I: Flow 错误恢复事件
export const FLOW_PROGRESS_UUID = "flow-progress-indicator"; // Flow 进度指示器固定 UUID
export const PPT_OUTLINE_EVENT = "pptOutlineEvent"; // Phase PPT: PPT 大纲确认事件
export const PPT_CONTENT_EVENT = "pptContentEvent"; // Phase PPT: PPT 内容确认事件
export const PPT_GENERATED_EVENT = "pptGeneratedEvent"; // Phase PPT: PPT 生成完成事件
export const AGENT_TASK_LIST_MESSAGE_TYPE = "agentTaskList"; // Phase Task List: 嵌入式任务列表消息
const AGENT_VERBOSE_LOG_STORAGE_KEY = "agent_verbose_log";
function agentVerboseLogEnabled() {
  try {
    return (
      typeof window !== "undefined" &&
      window.localStorage?.getItem(AGENT_VERBOSE_LOG_STORAGE_KEY) === "1"
    );
  } catch {
    return false;
  }
}

function verboseAgentLog(...args) {
  if (agentVerboseLogEnabled()) console.log(...args);
}

const handledEvents = [
  "statusResponse",
  "fileDownload",
  "awaitingFeedback",
  "wssFailure",
  "rechartVisualize",
  "agent:diagnostics", // Phase L3.1: 自我诊断
  "agent:debug", // Phase L: Agent 调试面板
  "toolExecution", // Phase D: 工具执行
  "flowProgress", // Flow 执行进度
  "planningDecision", // Phase F: Planning 决策
  "structuredOutput", // Phase J: 结构化输出
  "conversationSummary", // Phase K: 对话摘要
  "flowFailureDialog", // Phase I: Flow 错误恢复对话框
  "pptOutline", // Phase PPT: PPT 大纲确认
  "pptContent", // Phase PPT: PPT 内容确认
  "pptGenerated", // Phase PPT: PPT 生成完成
  // Streaming events
  "reportStreamEvent",
  "reasoningChunk", // Reasoning stream chunks
];

const TaskListStatus = {
  PENDING: "pending",
  RUNNING: "running",
  SUCCESS: "success",
  ERROR: "error",
};

function mapToolStageToTaskListStatus(stage) {
  switch (stage) {
    case "start":
    case "progress":
      return TaskListStatus.RUNNING;
    case "success":
      return TaskListStatus.SUCCESS;
    case "error":
      return TaskListStatus.ERROR;
    default:
      return TaskListStatus.PENDING;
  }
}

function mapFlowProgressToTaskListStatus(status) {
  switch (status) {
    case "running":
      return TaskListStatus.RUNNING;
    case "completed":
      return TaskListStatus.SUCCESS;
    case "failed":
      return TaskListStatus.ERROR;
    default:
      return TaskListStatus.PENDING;
  }
}

function buildTaskListTasksFromPlanSteps(steps = [], existingTasks = []) {
  const existingByIdentifier = new Map(
    existingTasks.filter((t) => !!t?.identifier).map((t) => [t.identifier, t])
  );

  return steps.map((step, idx) => {
    const identifier = step?.identifier ?? null;
    const existing = identifier ? existingByIdentifier.get(identifier) : null;

    return {
      id: step?.id || existing?.id || `plan-step-${idx + 1}`,
      type: step?.type ?? null,
      identifier,
      displayName:
        step?.purpose ||
        existing?.displayName ||
        identifier ||
        `Step ${idx + 1}`,
      status: existing?.status || TaskListStatus.PENDING,
      executionId: existing?.executionId || null,
      durationMs: existing?.durationMs || null,
      error: existing?.error || null,
      activeForm: existing?.activeForm || null,
      updatedAt: Date.now(),
    };
  });
}

export function websocketURI() {
  const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  if (API_BASE === "/api") return `${wsProtocol}//${window.location.host}`;
  return `${wsProtocol}//${new URL(import.meta.env.VITE_API_BASE).host}`;
}

export default function handleSocketResponse(socket, event, setChatHistory) {
  const data = safeJsonParse(event.data, null);
  if (data === null) return;

  const payload = data.content ?? data.data;

  // 【调试】打印收到的 WebSocket 消息
  verboseAgentLog("[Agent] WebSocket message received:", {
    hasType: data.hasOwnProperty("type"),
    type: data.type,
    hasSources: !!data.sources,
    sourcesLength: data.sources?.length || 0,
    contentPreview: payload?.substring?.(0, 50) || payload,
  });

  // No message type is defined then this is a generic message
  // that we need to print to the user as a system response.
  //
  // DeepSeek  Provider  `supportsAgentStreaming = true`
  //  Agent Flow  directOutput  agent
  //  AIBitat  WebSocket   { from, to, content }
  //   `type` 
  //   supportsAgentStreaming  true 
  //   ->    
  //   ->  handleSocketResponse  
  //
  //   type 
  //   streaming   agent 
  //   -  type: "reportStreamEvent" 
  //   -  type  
  //
  // :   type  message 
  //   `supportsAgentStreaming`  true 
  //  ->  agent.js 
  //       `!data.hasOwnProperty("type") && !socket.supportsAgentStreaming`
  //       
  //
  // :   " type " 
  //                  assistant  bubble 
  if (!data.hasOwnProperty("type")) {
    verboseAgentLog(
      "[Agent] Processing message without type - sources:",
      data.sources?.length || 0
    );
    return setChatHistory((prev) => {
      // 查找最后一条相同内容的 AI 消息
      const lastAssistantMsgIndex = prev.findLastIndex(
        (msg) => msg.role === "assistant" && msg.content === data.content
      );

      // 【修复】如果找到相同内容的消息，更新它的 sources（而不是跳过）
      if (lastAssistantMsgIndex !== -1) {
        const existingMsg = prev[lastAssistantMsgIndex];
        // 只有当新消息有 sources 且现有消息没有时才更新
        if (
          data.sources?.length > 0 &&
          (!existingMsg.sources || existingMsg.sources.length === 0)
        ) {
          verboseAgentLog(
            "[Agent] Updating existing message with sources:",
            data.sources.length
          );
          const updatedHistory = [...prev];
          updatedHistory[lastAssistantMsgIndex] = {
            ...existingMsg,
            sources: data.sources,
          };
          return updatedHistory;
        }
        verboseAgentLog(
          "[Agent] Skipping duplicate message (already has sources or no new sources)"
        );
        return prev;
      }

      const newMessage = {
        uuid: v4(),
        content: data.content,
        role: "assistant",
        sources: data.sources || [], // 【修复】使用消息中的 sources
        closed: true,
        error: null,
        animate: false,
        pending: false,
      };
      verboseAgentLog(
        "[Agent] Adding new message with sources:",
        newMessage.sources?.length || 0
      );

      return [...prev.filter((msg) => !!msg.content), newMessage];
    });
  }

  // 处理 Flow 执行进度（提前处理，避免被 handledEvents 检查拦截）
  if (data.type === "flowProgress" && payload) {
    setChatHistory((prev) => {
      // 查找已存在的进度消息
      const existingIndex = prev.findIndex(
        (msg) => msg.uuid === FLOW_PROGRESS_UUID
      );

      const progressMessage = {
        uuid: FLOW_PROGRESS_UUID,
        type: "flowProgress",
        content: payload,
        role: "assistant",
        sources: [],
        closed: false,
        error: null,
        animate: true,
        pending: false,
      };

      const updateTaskListForFlow = (history) => {
        const taskListIndex = history.findLastIndex(
          (msg) => msg.type === AGENT_TASK_LIST_MESSAGE_TYPE
        );
        if (taskListIndex < 0) return history;

        const taskListMsg = history[taskListIndex];
        const tasks = Array.isArray(taskListMsg?.content?.tasks)
          ? taskListMsg.content.tasks
          : [];
        if (tasks.length === 0) return history;

        const flowTaskIndex = tasks.findIndex(
          (t) =>
            t?.type === "flow" &&
            ![TaskListStatus.SUCCESS, TaskListStatus.ERROR].includes(t.status)
        );
        if (flowTaskIndex < 0) return history;

        const nextTasks = [...tasks];
        nextTasks[flowTaskIndex] = {
          ...nextTasks[flowTaskIndex],
          status: mapFlowProgressToTaskListStatus(payload.status),
          activeForm: payload?.stepLabel || nextTasks[flowTaskIndex].activeForm,
          updatedAt: Date.now(),
        };

        const nextHistory = [...history];
        nextHistory[taskListIndex] = {
          ...taskListMsg,
          content: {
            ...taskListMsg.content,
            tasks: nextTasks,
          },
        };
        return nextHistory;
      };

      if (existingIndex >= 0) {
        // 更新已存在的进度消息
        let newHistory = [...prev];
        newHistory[existingIndex] = progressMessage;
        return updateTaskListForFlow(newHistory);
      } else {
        // 添加新的进度消息
        const next = [...prev.filter((msg) => !!msg.content), progressMessage];
        return updateTaskListForFlow(next);
      }
    });
    return; // 重要：处理完 flowProgress 后返回，不继续处理其他逻辑
  }

  // 处理推理流式块（reasoningChunk）：coalesce 到单条 reasoning 过程消息
  // 提前处理，因为 truncated:true 时 payload 为 undefined，会被下方 guard 拦截
  if (data.type === "reasoningChunk") {
    const REASONING_UUID_PREFIX = "reasoning-stream-";
    setChatHistory((prev) => {
      // 找到末尾的 reasoningChunk 消息（如已存在则追加，否则新建）
      const lastReasoningIndex = prev.findLastIndex(
        (msg) =>
          msg.type === "reasoningChunk" &&
          msg.uuid?.startsWith(REASONING_UUID_PREFIX)
      );

      if (data.truncated) {
        // 截断标记：在已有消息末尾追加提示，或新建一条
        const truncationNote = "（推理已截断）";
        if (lastReasoningIndex >= 0) {
          const updated = [...prev];
          updated[lastReasoningIndex] = {
            ...updated[lastReasoningIndex],
            content:
              (updated[lastReasoningIndex].content || "") + truncationNote,
            truncated: true,
          };
          return updated;
        }
        return [
          ...prev.filter((msg) => !!msg.content),
          {
            uuid: `${REASONING_UUID_PREFIX}${v4()}`,
            type: "reasoningChunk",
            content: truncationNote,
            truncated: true,
            role: "assistant",
            sources: [],
            closed: true,
            error: null,
            animate: false,
            pending: false,
          },
        ];
      }

      // 普通文本 chunk：追加到已有推理消息，否则新建
      const chunkText = payload ?? "";
      if (lastReasoningIndex >= 0) {
        const updated = [...prev];
        updated[lastReasoningIndex] = {
          ...updated[lastReasoningIndex],
          content: (updated[lastReasoningIndex].content || "") + chunkText,
        };
        return updated;
      }

      return [
        ...prev.filter((msg) => !!msg.content),
        {
          uuid: `${REASONING_UUID_PREFIX}${v4()}`,
          type: "reasoningChunk",
          content: chunkText,
          role: "assistant",
          sources: [],
          closed: true,
          error: null,
          animate: false,
          pending: false,
        },
      ];
    });
    return;
  }

  // 兼容新旧 Envelope：允许 payload 来自 content 或 data
  if (!handledEvents.includes(data.type) || payload == null) return;

  if (data.type === "reportStreamEvent") {
    // Enable agent streaming for the next message so we can handle streaming or non-streaming responses
    // If we get this message we know the provider supports agentic streaming
    socket.supportsAgentStreaming = true;

    return setChatHistory((prev) => {
      if (data.content.type === "removeStatusResponse")
        return [...prev.filter((msg) => msg.uuid !== data.content.uuid)];

      const knownMessage = data.content.uuid
        ? prev.find((msg) => msg.uuid === data.content.uuid)
        : null;
      if (!knownMessage) {
        if (data.content.type === "fullTextResponse") {
          return [
            ...prev.filter((msg) => !!msg.content),
            {
              uuid: data.content.uuid,
              type: "textResponse",
              content: data.content.content,
              role: "assistant",
              sources: data.content.sources || data.sources || [], // 【修复】使用消息中的 sources
              closed: true,
              error: null,
              animate: false,
              pending: false,
            },
          ];
        }

        // Handle textResponseChunk initialization as textResponse instead of statusResponse.
        // Without this the first chunk creates a statusResponse (thought bubble) by falling through to the default case.
        // Providers like Gemini send large chunks and can complete in a single chunk before the update logic can convert it.
        // Other providers send many small chunks so the second chunk triggers the update logic to fix the type.
        if (data.content.type === "textResponseChunk") {
          return [
            ...prev.filter((msg) => !!msg.content),
            {
              uuid: data.content.uuid,
              type: "textResponse",
              content: data.content.content,
              role: "assistant",
              sources: data.content.sources || data.sources || [], // 【修复】使用消息中的 sources
              closed: true,
              error: null,
              animate: false,
              pending: false,
            },
          ];
        }

        return [
          ...prev.filter((msg) => !!msg.content),
          {
            uuid: data.content.uuid,
            type: "statusResponse",
            content: data.content.content,
            role: "assistant",
            sources: [],
            closed: true,
            error: null,
            animate: false,
            pending: false,
          },
        ];
      } else {
        const { type, content, uuid } = data.content;
        // For tool call invocations, we need to update the existing message entirely since it is accumulated
        // and we dont know if the function will have arguments or not while streaming - so replace the existing message entirely
        if (type === "toolCallInvocation") {
          const knownMessage = prev.find((msg) => msg.uuid === uuid);
          if (!knownMessage)
            return [...prev, { uuid, type: "toolCallInvocation", content }]; // If the message is not known, add it to the end of the list
          return [
            ...prev.filter((msg) => msg.uuid !== uuid),
            { ...knownMessage, content },
          ]; // If the message is known, replace it with the new content
        }

        if (type === "textResponseChunk") {
          return prev
            .map((msg) =>
              msg.uuid === uuid
                ? {
                    ...msg,
                    type: "textResponse",
                    content: msg.content + content,
                  }
                : msg?.content
                  ? msg
                  : null
            )
            .filter((msg) => !!msg);
        }

        // Generic text response - will be put in the agent thought bubble
        return prev.map((msg) =>
          msg.uuid === data.content.uuid
            ? { ...msg, content: msg.content + data.content.content }
            : msg
        );
      }
    });
  }

  if (data.type === "fileDownload") {
    try {
      // 将 Data URL 转换为 Blob
      const dataURL = payload.b64Content;
      const parts = dataURL.split(",");
      const mimeMatch = parts[0].match(/:(.*?);/);
      const mime = mimeMatch ? mimeMatch[1] : "application/octet-stream";
      const bstr = atob(parts[1]);
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
      }
      const blob = new Blob([u8arr], { type: mime });
      saveAs(blob, payload.filename ?? "unknown.txt");
    } catch (error) {
      console.error("[fileDownload] Failed to process file download:", error);
    }
    return;
  }

  if (data.type === "rechartVisualize") {
    return setChatHistory((prev) => {
      return [
        ...prev.filter((msg) => !!msg.content),
        {
          type: "rechartVisualize",
          uuid: v4(),
          content: payload,
          role: "assistant",
          sources: data.sources || [], // 【修复】使用消息中的 sources
          closed: true,
          error: null,
          animate: false,
          pending: false,
        },
      ];
    });
  }

  if (data.type === "wssFailure") {
    return setChatHistory((prev) => {
      return [
        ...prev.filter((msg) => !!msg.content),
        {
          uuid: v4(),
          content: payload,
          role: "assistant",
          sources: [], // 错误消息不需要 sources
          closed: true,
          error: payload,
          animate: false,
          pending: false,
        },
      ];
    });
  }

  // Phase L3.1: 处理自我诊断事件
  if (data.type === "agent:diagnostics") {
    // 通过自定义事件通知 ChatContainer 显示诊断对话框
    window.dispatchEvent(
      new CustomEvent(AGENT_DIAGNOSTICS, { detail: payload })
    );
    // 不添加到聊天历史，由对话框组件处理
    return;
  }

  // Phase L: 处理 Agent 调试面板事件
  if (data.type === "agent:debug") {
    // 通过自定义事件通知 AgentDebugPanel 更新调试数据
    window.dispatchEvent(
      new CustomEvent(AGENT_DEBUG_EVENT, { detail: payload ?? data })
    );
    // 不添加到聊天历史，由调试面板组件处理
    return;
  }

  // Phase D: 处理工具执行事件
  if (data.type === "toolExecution") {
    // 调试日志：确认收到 toolExecution 事件
    verboseAgentLog("[Agent] toolExecution event received:", payload);
    // 通过自定义事件通知 ToolExecutionPanel 更新工具执行状态
    window.dispatchEvent(
      new CustomEvent(TOOL_EXECUTION_EVENT, { detail: payload })
    );
    // 同步更新嵌入式 Task List（如果存在）
    setChatHistory((prev) => {
      const sessionId = payload?.sessionId || null;
      const taskListIndex =
        sessionId != null
          ? prev.findIndex(
              (msg) =>
                msg.type === AGENT_TASK_LIST_MESSAGE_TYPE &&
                msg?.content?.sessionId === sessionId
            )
          : -1;

      const fallbackIndex =
        taskListIndex >= 0
          ? taskListIndex
          : prev.findLastIndex(
              (msg) => msg.type === AGENT_TASK_LIST_MESSAGE_TYPE
            );
      if (fallbackIndex < 0) return prev;

      const taskListMsg = prev[fallbackIndex];
      const tasks = Array.isArray(taskListMsg?.content?.tasks)
        ? taskListMsg.content.tasks
        : [];
      if (tasks.length === 0) return prev;

      const toolName = payload?.toolName;
      const status = mapToolStageToTaskListStatus(payload?.stage);

      const targetTaskIndex = tasks.findIndex(
        (t) => t?.identifier === toolName
      );
      if (targetTaskIndex < 0) return prev;

      const nextTasks = [...tasks];
      nextTasks[targetTaskIndex] = {
        ...nextTasks[targetTaskIndex],
        status,
        executionId:
          payload?.executionId || nextTasks[targetTaskIndex].executionId,
        durationMs:
          payload?.durationMs != null
            ? payload.durationMs
            : nextTasks[targetTaskIndex].durationMs,
        error: payload?.error || null,
        activeForm:
          status === TaskListStatus.RUNNING
            ? toolName
            : nextTasks[targetTaskIndex].activeForm,
        updatedAt: Date.now(),
      };

      const next = [...prev];
      next[fallbackIndex] = {
        ...taskListMsg,
        content: {
          ...taskListMsg.content,
          tasks: nextTasks,
        },
      };
      return next;
    });
    // 不添加到聊天历史，由工具执行面板组件处理
    return;
  }

  // Phase F: 处理 Planning 决策事件
  if (data.type === "planningDecision") {
    // 通过自定义事件通知 PlanningPanel 显示 Planning 决策
    window.dispatchEvent(
      new CustomEvent(PLANNING_DECISION_EVENT, { detail: payload })
    );
    // 嵌入消息流：创建 Task List 消息（标题来自 planningDecision.steps）
    setChatHistory((prev) => {
      const sessionId = payload?.sessionId || v4();
      const uuid = `agent-task-list-${sessionId}`;
      const existingIndex = prev.findIndex((msg) => msg.uuid === uuid);
      const existingTasks =
        existingIndex >= 0 && Array.isArray(prev[existingIndex]?.content?.tasks)
          ? prev[existingIndex].content.tasks
          : [];

      const tasks = buildTaskListTasksFromPlanSteps(
        payload?.steps || [],
        existingTasks
      );

      const taskListMessage = {
        uuid,
        type: AGENT_TASK_LIST_MESSAGE_TYPE,
        content: {
          sessionId,
          tasks,
          createdAt: prev[existingIndex]?.content?.createdAt || Date.now(),
        },
        role: "assistant",
        sources: [],
        closed: true,
        error: null,
        animate: false,
        pending: false,
      };

      if (existingIndex >= 0) {
        const next = [...prev];
        next[existingIndex] = taskListMessage;
        return next;
      }

      return [...prev.filter((msg) => !!msg.content), taskListMessage];
    });
    // 不添加常规聊天气泡
    return;
  }

  // Phase J: 处理结构化输出事件
  if (data.type === "structuredOutput") {
    // 通过自定义事件通知 StructuredOutput 组件渲染
    window.dispatchEvent(
      new CustomEvent(STRUCTURED_OUTPUT_EVENT, { detail: payload })
    );
    // 不添加到聊天历史，由结构化输出组件处理
    return;
  }

  // Phase K: 处理对话摘要事件
  if (data.type === "conversationSummary") {
    // 通过自定义事件通知 ConversationSummary 组件显示
    window.dispatchEvent(
      new CustomEvent(CONVERSATION_SUMMARY_EVENT, { detail: payload })
    );
    // 不添加到聊天历史，由摘要组件处理
    return;
  }

  // Phase I: 处理 Flow 错误恢复对话框
  if (data.type === "flowFailureDialog") {
    // 通过自定义事件通知 FlowFailureDialog 显示
    window.dispatchEvent(
      new CustomEvent(FLOW_FAILURE_EVENT, { detail: payload })
    );
    // 不添加到聊天历史，由对话框组件处理
    return;
  }

  // Phase PPT: 处理 PPT 大纲确认事件
  if (data.type === "pptOutline") {
    window.dispatchEvent(
      new CustomEvent(PPT_OUTLINE_EVENT, { detail: payload })
    );
    // 不添加到聊天历史，由 PPT 确认面板处理
    return;
  }

  // Phase PPT: 处理 PPT 内容确认事件
  if (data.type === "pptContent") {
    window.dispatchEvent(
      new CustomEvent(PPT_CONTENT_EVENT, { detail: payload })
    );
    // 不添加到聊天历史，由 PPT 确认面板处理
    return;
  }

  // Phase PPT: 处理 PPT 生成完成事件
  if (data.type === "pptGenerated") {
    window.dispatchEvent(
      new CustomEvent(PPT_GENERATED_EVENT, { detail: payload })
    );
    // 不添加到聊天历史，由 PPT 确认面板处理
    return;
  }

  return setChatHistory((prev) => {
    // statusResponse 是临时状态消息，不应移除 flowProgress 进度指示器
    // 只有最终结果消息（textResponse 等）才移除进度指示器
    const shouldRemoveFlowProgress = data.type !== "statusResponse";

    const filtered = prev.filter((msg) => {
      if (!msg.content) return false;
      // 只有非 statusResponse 消息才移除 flowProgress
      if (shouldRemoveFlowProgress && msg.uuid === FLOW_PROGRESS_UUID)
        return false;
      return true;
    });

    return [
      ...filtered,
      {
        uuid: v4(),
        type: data.type,
        content: payload,
        role: "assistant",
        sources: data.sources || [], // 【修复】使用消息中的 sources
        closed: true,
        error: null,
        animate: data?.animate || false,
        pending: false,
      },
    ];
  });
}

export function useIsAgentSessionActive() {
  const [activeSession, setActiveSession] = useState(false);
  useEffect(() => {
    if (!window) return;

    const handleStart = () => setActiveSession(true);
    const handleEnd = () => setActiveSession(false);

    window.addEventListener(AGENT_SESSION_START, handleStart);
    window.addEventListener(AGENT_SESSION_END, handleEnd);

    // 清理函数：组件卸载时移除事件监听器
    return () => {
      window.removeEventListener(AGENT_SESSION_START, handleStart);
      window.removeEventListener(AGENT_SESSION_END, handleEnd);
    };
  }, []);

  return activeSession;
}

/**
 * Phase L: Agent 调试数据 Hook
 * 收集并管理 Agent 执行过程中的调试事件和指标
 */
export function useAgentDebugData() {
  const [debugData, setDebugData] = useState({ events: [], metrics: null });

  useEffect(() => {
    if (!window) return;

    const handleDebugEvent = (event) => {
      const { event: debugEvent, metrics } = event.detail || {};
      if (debugEvent) {
        setDebugData((prev) => ({
          events: [...prev.events, debugEvent],
          metrics: metrics || prev.metrics,
        }));
      }
    };

    const handleSessionEnd = () => {
      // 会话结束时清空调试数据
      setDebugData({ events: [], metrics: null });
    };

    window.addEventListener(AGENT_DEBUG_EVENT, handleDebugEvent);
    window.addEventListener(AGENT_SESSION_END, handleSessionEnd);

    return () => {
      window.removeEventListener(AGENT_DEBUG_EVENT, handleDebugEvent);
      window.removeEventListener(AGENT_SESSION_END, handleSessionEnd);
    };
  }, []);

  return debugData;
}

/**
 * Phase D: 工具执行数据 Hook
 * 收集并管理工具调用状态
 *
 * Phase Task List 更新:
 * - 使用 executionId 关联同一工具调用的 start/success/error
 * - 清空策略改为 AGENT_SESSION_START（而非 END）
 */
export function useToolExecutionData() {
  const [toolExecutions, setToolExecutions] = useState([]);

  useEffect(() => {
    if (!window) return;

    const handleToolEvent = (event) => {
      const toolData = event.detail;
      verboseAgentLog("[useToolExecutionData] Received tool event:", toolData);
      if (!toolData) return;

      setToolExecutions((prev) => {
        // 优先使用 executionId 关联，fallback 到 toolName + timestamp
        const existingIndex = prev.findIndex((t) => {
          // 新版本：使用 executionId 精确匹配
          if (toolData.executionId && t.executionId) {
            return t.executionId === toolData.executionId;
          }
          // 兼容旧版本：使用 toolName + timestamp
          return (
            t.toolName === toolData.toolName &&
            t.timestamp === toolData.timestamp
          );
        });

        if (existingIndex >= 0) {
          // 更新现有记录（保留原始 timestamp，更新其他字段）
          const updated = [...prev];
          updated[existingIndex] = {
            ...updated[existingIndex],
            ...toolData,
            // 保留原始开始时间
            startTimestamp:
              updated[existingIndex].startTimestamp ||
              updated[existingIndex].timestamp,
          };
          return updated;
        }

        // 添加新记录（标记开始时间）
        return [
          ...prev,
          {
            ...toolData,
            startTimestamp: toolData.timestamp,
          },
        ];
      });
    };

    const handleSessionStart = () => {
      // 新会话开始时清空上一次的工具执行数据
      setToolExecutions([]);
    };

    // 注意：改为在 SESSION_START 清空，而非 SESSION_END
    // 这样用户可以在会话结束后仍然看到执行历史
    window.addEventListener(TOOL_EXECUTION_EVENT, handleToolEvent);
    window.addEventListener(AGENT_SESSION_START, handleSessionStart);

    return () => {
      window.removeEventListener(TOOL_EXECUTION_EVENT, handleToolEvent);
      window.removeEventListener(AGENT_SESSION_START, handleSessionStart);
    };
  }, []);

  return toolExecutions;
}

/**
 * Phase F: Planning 决策数据 Hook
 * 收集并管理 Planning 决策信息用于可视化展示
 *
 * Phase Task List 更新:
 * - 清空策略改为 AGENT_SESSION_START（而非 END）
 */
export function usePlanningData() {
  const [planningData, setPlanningData] = useState(null);

  useEffect(() => {
    if (!window) return;

    const handlePlanningEvent = (event) => {
      const data = event.detail;
      if (data) {
        setPlanningData(data);
      }
    };

    const handleSessionStart = () => {
      // 新会话开始时清空上一次的 Planning 数据
      setPlanningData(null);
    };

    // 注意：改为在 SESSION_START 清空，而非 SESSION_END
    window.addEventListener(PLANNING_DECISION_EVENT, handlePlanningEvent);
    window.addEventListener(AGENT_SESSION_START, handleSessionStart);

    return () => {
      window.removeEventListener(PLANNING_DECISION_EVENT, handlePlanningEvent);
      window.removeEventListener(AGENT_SESSION_START, handleSessionStart);
    };
  }, []);

  return planningData;
}

/**
 * Phase J: 结构化输出数据 Hook
 * 收集并管理结构化输出用于可视化渲染
 */
export function useStructuredOutputData() {
  const [outputs, setOutputs] = useState([]);

  useEffect(() => {
    if (!window) return;

    const handleOutputEvent = (event) => {
      const data = event.detail;
      if (data) {
        setOutputs((prev) => [...prev, data]);
      }
    };

    const handleSessionEnd = () => {
      // 会话结束时清空结构化输出
      setOutputs([]);
    };

    window.addEventListener(STRUCTURED_OUTPUT_EVENT, handleOutputEvent);
    window.addEventListener(AGENT_SESSION_END, handleSessionEnd);

    return () => {
      window.removeEventListener(STRUCTURED_OUTPUT_EVENT, handleOutputEvent);
      window.removeEventListener(AGENT_SESSION_END, handleSessionEnd);
    };
  }, []);

  return outputs;
}

/**
 * Phase K: 对话摘要数据 Hook
 * 收集并管理对话摘要
 */
export function useConversationSummary() {
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    if (!window) return;

    const handleSummaryEvent = (event) => {
      const data = event.detail;
      if (data) {
        setSummary(data);
      }
    };

    const handleSessionEnd = () => {
      // 会话结束时保留摘要（用户可能需要回顾）
    };

    window.addEventListener(CONVERSATION_SUMMARY_EVENT, handleSummaryEvent);
    window.addEventListener(AGENT_SESSION_END, handleSessionEnd);

    return () => {
      window.removeEventListener(
        CONVERSATION_SUMMARY_EVENT,
        handleSummaryEvent
      );
      window.removeEventListener(AGENT_SESSION_END, handleSessionEnd);
    };
  }, []);

  return [summary, setSummary];
}

/**
 * Phase I: Flow 错误恢复 Hook
 * 管理 Flow 执行失败时的用户交互
 */
export function useFlowFailureDialog() {
  const [failureData, setFailureData] = useState(null);

  useEffect(() => {
    if (!window) return;

    const handleFailureEvent = (event) => {
      const data = event.detail;
      if (data) {
        setFailureData(data);
      }
    };

    const handleSessionEnd = () => {
      // 会话结束时清空错误数据
      setFailureData(null);
    };

    window.addEventListener(FLOW_FAILURE_EVENT, handleFailureEvent);
    window.addEventListener(AGENT_SESSION_END, handleSessionEnd);

    return () => {
      window.removeEventListener(FLOW_FAILURE_EVENT, handleFailureEvent);
      window.removeEventListener(AGENT_SESSION_END, handleSessionEnd);
    };
  }, []);

  /**
   * 响应 Flow 失败的用户选择
   * @param {string} choice - 用户选择：'retry' | 'skip' | 'abort'
   * @param {WebSocket} socket - WebSocket 连接实例
   */
  const respond = (choice, socket = null) => {
    const checkpointId = failureData?.checkpointId;

    // 发送用户选择到后端
    if (socket && checkpointId) {
      socket.send(
        JSON.stringify({
          type: "flowFailureResponse",
          checkpointId,
          choice,
        })
      );
    }

    // 清空当前错误数据
    setFailureData(null);
    return choice;
  };

  return [failureData, respond];
}

// ========================================
// Phase Task List: Agent 任务追踪
// ========================================

// Agent Task List 事件常量
export const AGENT_TASK_START_EVENT = "agentTaskStartEvent";
export const AGENT_TASK_STATUS_EVENT = "agentTaskStatusEvent";
export const AGENT_PLAN_EVENT = "agentPlanEvent";

/**
 * Phase Task List: Agent 任务数据 Hook
 * 整合 Planning 数据和工具执行数据，提供统一的任务列表
 *
 * 特性：
 * - 在 AGENT_SESSION_START 时清空（而非 END）
 * - 使用 executionId 关联工具调用状态
 * - 支持 HITL 状态（awaiting_confirmation）
 */
export function useAgentTasks() {
  const [tasks, setTasks] = useState([]);
  const [sessionId, setSessionId] = useState(null);

  useEffect(() => {
    if (!window) return;

    // 处理计划初始化事件
    const handlePlanEvent = (event) => {
      const data = event.detail;
      if (!data) return;

      setSessionId(data.sessionId);
      // 将计划步骤转换为 pending 任务
      const planTasks = (data.steps || []).map((step, idx) => ({
        id: step.id || `plan-${idx}`,
        type: step.type,
        identifier: step.identifier,
        displayName: step.purpose || step.identifier,
        purpose: step.purpose,
        status: "pending",
        isHITL: step.isHITL || false,
        planType: data.planType,
        timestamp: Date.now(),
      }));

      setTasks(planTasks);
    };

    // 处理任务开始事件
    const handleTaskStart = (event) => {
      const data = event.detail;
      if (!data) return;

      setTasks((prev) => {
        // 查找是否有匹配的 pending 任务
        const existingIdx = prev.findIndex(
          (t) => t.id === data.taskId || t.identifier === data.toolName
        );

        const newTask = {
          id: data.taskId || data.executionId,
          executionId: data.executionId,
          toolName: data.toolName,
          displayName: data.displayName || data.toolName,
          status: "running",
          startTime: data.startTime || Date.now(),
          timestamp: Date.now(),
        };

        if (existingIdx >= 0) {
          // 更新现有任务
          const updated = [...prev];
          updated[existingIdx] = { ...updated[existingIdx], ...newTask };
          return updated;
        }

        // 添加新任务
        return [...prev, newTask];
      });
    };

    // 处理任务状态更新事件
    const handleTaskStatus = (event) => {
      const data = event.detail;
      if (!data) return;

      setTasks((prev) => {
        const existingIdx = prev.findIndex(
          (t) =>
            t.id === data.taskId ||
            t.executionId === data.executionId ||
            (t.toolName && t.toolName === data.toolName)
        );

        if (existingIdx >= 0) {
          const updated = [...prev];
          updated[existingIdx] = {
            ...updated[existingIdx],
            status: data.status,
            result: data.result,
            error: data.error,
            durationMs: data.duration,
            context: data.context,
            retryCount: data.context?.retryCount,
            maxRetries: data.context?.maxRetries,
          };
          return updated;
        }

        // 如果没找到匹配的任务，创建一个新的
        return [
          ...prev,
          {
            id: data.taskId || data.executionId,
            executionId: data.executionId,
            status: data.status,
            result: data.result,
            error: data.error,
            durationMs: data.duration,
            context: data.context,
            timestamp: Date.now(),
          },
        ];
      });
    };

    // 新会话开始时清空任务列表
    const handleSessionStart = () => {
      setTasks([]);
      setSessionId(null);
    };

    // 会话结束时标记未完成任务为 aborted
    const handleSessionEnd = () => {
      setTasks((prev) =>
        prev.map((task) => {
          if (task.status === "running" || task.status === "pending") {
            return { ...task, status: "aborted" };
          }
          return task;
        })
      );
    };

    // 注册事件监听
    window.addEventListener(AGENT_PLAN_EVENT, handlePlanEvent);
    window.addEventListener(AGENT_TASK_START_EVENT, handleTaskStart);
    window.addEventListener(AGENT_TASK_STATUS_EVENT, handleTaskStatus);
    window.addEventListener(AGENT_SESSION_START, handleSessionStart);
    window.addEventListener(AGENT_SESSION_END, handleSessionEnd);

    return () => {
      window.removeEventListener(AGENT_PLAN_EVENT, handlePlanEvent);
      window.removeEventListener(AGENT_TASK_START_EVENT, handleTaskStart);
      window.removeEventListener(AGENT_TASK_STATUS_EVENT, handleTaskStatus);
      window.removeEventListener(AGENT_SESSION_START, handleSessionStart);
      window.removeEventListener(AGENT_SESSION_END, handleSessionEnd);
    };
  }, []);

  return { tasks, sessionId, setTasks };
}

// ========================================
// Phase PPT: PPT 生成 HITL 确认
// ========================================

/**
 * PPT 确认状态
 */
export const PPTConfirmStatus = {
  IDLE: "idle",
  OUTLINE_PENDING: "outline_pending",
  CONTENT_PENDING: "content_pending",
  GENERATING: "generating",
  COMPLETED: "completed",
};

/**
 * Phase PPT: PPT 确认数据 Hook
 * 管理 PPT 大纲和内容的 HITL 确认流程
 *
 * 流程：
 * 1. 收到 pptOutline 事件 → status = outline_pending
 * 2. 用户确认大纲 → 发送确认消息
 * 3. 收到 pptContent 事件 → status = content_pending
 * 4. 用户确认内容 → 发送确认消息
 * 5. 收到 pptGenerated 事件 → status = completed
 */
export function usePPTConfirmation() {
  const [status, setStatus] = useState(PPTConfirmStatus.IDLE);
  const [outlineData, setOutlineData] = useState(null);
  const [contentData, setContentData] = useState(null);
  const [generatedData, setGeneratedData] = useState(null);

  useEffect(() => {
    if (!window) return;

    // 处理大纲事件
    const handleOutlineEvent = (event) => {
      const data = event.detail;
      if (data && data.status === "pending_confirmation") {
        setOutlineData(data.outline);
        setStatus(PPTConfirmStatus.OUTLINE_PENDING);
      }
    };

    // 处理内容事件
    const handleContentEvent = (event) => {
      const data = event.detail;
      if (data) {
        setContentData(data.dsl);
        if (data.status === "pending_confirmation") {
          setStatus(PPTConfirmStatus.CONTENT_PENDING);
        } else if (data.status === "generating") {
          setStatus(PPTConfirmStatus.GENERATING);
        }
      }
    };

    // 处理生成完成事件
    const handleGeneratedEvent = (event) => {
      const data = event.detail;
      if (data) {
        setGeneratedData(data);
        setStatus(PPTConfirmStatus.COMPLETED);
      }
    };

    // 新会话开始时重置状态
    const handleSessionStart = () => {
      setStatus(PPTConfirmStatus.IDLE);
      setOutlineData(null);
      setContentData(null);
      setGeneratedData(null);
    };

    window.addEventListener(PPT_OUTLINE_EVENT, handleOutlineEvent);
    window.addEventListener(PPT_CONTENT_EVENT, handleContentEvent);
    window.addEventListener(PPT_GENERATED_EVENT, handleGeneratedEvent);
    window.addEventListener(AGENT_SESSION_START, handleSessionStart);

    return () => {
      window.removeEventListener(PPT_OUTLINE_EVENT, handleOutlineEvent);
      window.removeEventListener(PPT_CONTENT_EVENT, handleContentEvent);
      window.removeEventListener(PPT_GENERATED_EVENT, handleGeneratedEvent);
      window.removeEventListener(AGENT_SESSION_START, handleSessionStart);
    };
  }, []);

  /**
   * 重置状态
   */
  const reset = () => {
    setStatus(PPTConfirmStatus.IDLE);
    setOutlineData(null);
    setContentData(null);
    setGeneratedData(null);
  };

  return {
    status,
    outlineData,
    contentData,
    generatedData,
    reset,
    isWaitingConfirmation:
      status === PPTConfirmStatus.OUTLINE_PENDING ||
      status === PPTConfirmStatus.CONTENT_PENDING,
  };
}
