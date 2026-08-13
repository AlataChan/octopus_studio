import { useState, useEffect, useContext, useRef } from "react";
import ChatHistory from "./ChatHistory";
import { CLEAR_ATTACHMENTS_EVENT, DndUploaderContext } from "./DnDWrapper";
import PromptInput, {
  PROMPT_INPUT_EVENT,
  PROMPT_INPUT_ID,
} from "./PromptInput";
import { getResponseStyle } from "./PromptInput/ResponseStyleButton";
import Workspace from "@/models/workspace";
import WorkflowConfirmation from "@/models/workflowConfirmation";
import handleChat, { ABORT_STREAM_EVENT } from "@/utils/chat";
import { isMobile } from "react-device-detect";
import { SidebarMobileHeader } from "../../Sidebar";
import { useParams, useSearchParams, useLocation } from "react-router-dom";
import { v4 } from "uuid";
import handleSocketResponse, {
  websocketURI,
  AGENT_SESSION_END,
  AGENT_SESSION_START,
  AGENT_DIAGNOSTICS,
} from "@/utils/chat/agent";
import DnDFileUploaderWrapper from "./DnDWrapper";
import ConfirmationCard from "../../ConfirmationCard";
import SpeechRecognition, {
  useSpeechRecognition,
} from "react-speech-recognition";
import { ChatTooltips } from "./ChatTooltips";
import { MetricsProvider } from "./ChatHistory/HistoricalMessage/Actions/RenderMetrics";
import AssistantSelector from "@/components/AssistantSelector";
import WorkspaceAssistant from "@/models/workspaceAssistant";
import AgentGuidanceDialog from "@/components/AgentGuidanceDialog";
import { AuthContext } from "@/AuthContext";
import AuthorizationModeToggle from "./AuthorizationModeToggle";
import Molt from "@/models/molt";
import { useTranslation } from "react-i18next";
import {
  appendMoltStreamChunk,
  applyMoltStreamError,
  buildMoltScopeKey,
  finalizeMoltStreamMessage,
  selectPrimaryMoltMention,
  selectPrimaryNativeMention,
  shouldPreserveMoltInput,
} from "./moltChatHelpers";
import { loadWorkspaceChatData } from "@/utils/workspaceChatLoader";

export const WORKSPACE_CHAT_SUBMIT_EVENT = "workspace-chat:submit";

export default function ChatContainer({ workspace, knownHistory = [] }) {
  const { t } = useTranslation();
  const { threadSlug = null } = useParams();
  const location = useLocation();
  const [, setSearchParams] = useSearchParams();

  // 直接从 URL 参数初始化 selectedAssistantId，避免时序问题
  const initialAssistantId = new URLSearchParams(location.search).get(
    "assistantId"
  );

  const [message, setMessage] = useState("");
  const [loadingResponse, setLoadingResponse] = useState(false);
  const [chatHistory, setChatHistory] = useState(knownHistory);
  const [socketId, setSocketId] = useState(null);
  const [websocket, setWebsocket] = useState(null);
  const [selectedAssistantId, setSelectedAssistantId] =
    useState(initialAssistantId);
  const [currentAssistant, setCurrentAssistant] = useState(null); // 缓存当前选中的助手信息
  const [isVoiceMode, setIsVoiceMode] = useState(false); // 语音模式状态
  const [mentionSelections, setMentionSelections] = useState([]);
  const [moltChatWarning, setMoltChatWarning] = useState(null);
  const [moltThreadStale, setMoltThreadStale] = useState(null);
  const { files, parseAttachments } = useContext(DndUploaderContext);
  const { store: authStore } = useContext(AuthContext);
  const currentUser = authStore?.user || null;
  const isAdmin = currentUser?.role === "admin";

  // HitL 确认列表状态
  const [pendingConfirmations, setPendingConfirmations] = useState([]);

  // Authorization mode for agent invocations (HITL vs FULL AUTHORIZE)
  const [authorizationMode, setAuthorizationMode] = useState("hitl");

  // Phase L3.1: AI 员工自我诊断状态
  const [diagnosticsData, setDiagnosticsData] = useState(null);
  const [showGuidanceDialog, setShowGuidanceDialog] = useState(false);

  useEffect(() => {
    setChatHistory(Array.isArray(knownHistory) ? knownHistory : []);
    setLoadingResponse(false);
  }, [workspace?.slug, threadSlug, knownHistory]);

  // 轮询待确认列表，确保 HITL 阻塞时用户能在聊天界面直接批准/拒绝。
  useEffect(() => {
    if (!workspace?.slug) {
      setPendingConfirmations([]);
      return;
    }

    let cancelled = false;
    const pollConfirmations = async () => {
      try {
        const result = await WorkflowConfirmation.listPending(workspace.slug);
        if (cancelled) return;

        const confirmations = Array.isArray(result?.confirmations)
          ? result.confirmations
          : Array.isArray(result?.data?.confirmations)
            ? result.data.confirmations
            : [];

        if (result?.success) setPendingConfirmations(confirmations);
      } catch (error) {
        console.error("Failed to poll confirmations:", error);
      }
    };

    pollConfirmations();
    const interval = setInterval(pollConfirmations, 3000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [workspace?.slug]);

  // 处理确认/拒绝后的回调
  const handleConfirmationResolved = (confirmationId) => {
    setPendingConfirmations((prev) =>
      prev.filter((c) => c.id !== confirmationId)
    );
  };

  // Phase L3.1: 监听 AI 员工自我诊断事件
  useEffect(() => {
    const handleDiagnostics = (event) => {
      const diagnostics = event.detail;
      if (diagnostics && diagnostics.issues?.length > 0) {
        setDiagnosticsData(diagnostics);
        setShowGuidanceDialog(true);
      }
    };

    window.addEventListener(AGENT_DIAGNOSTICS, handleDiagnostics);
    return () => {
      window.removeEventListener(AGENT_DIAGNOSTICS, handleDiagnostics);
    };
  }, []);

  // Phase L3.1: 处理用户提供指导
  const handleProvideGuidance = () => {
    setShowGuidanceDialog(false);
    // 聚焦到输入框，让用户输入指导内容
    const inputEl = document.getElementById(PROMPT_INPUT_ID);
    if (inputEl) {
      inputEl.focus();
      inputEl.placeholder = "请输入您的指导建议...";
    }
  };

  // Phase L3.1: 用户选择继续执行
  const handleContinueExecution = () => {
    setShowGuidanceDialog(false);
    setDiagnosticsData(null);
  };

  // 从 URL 路径提取 workspace slug（比 props 更快更新）
  const workspaceSlugFromUrl =
    location.pathname.match(/\/workspace\/([^/]+)/)?.[1];

  // 记录当前的 workspace slug，用于检测 workspace 切换
  const currentWorkspaceSlugRef = useRef(workspaceSlugFromUrl);

  // 统一处理 URL 参数和 workspace 变化
  // 使用 URL 中的 workspace slug 而不是 props，确保同步
  useEffect(() => {
    const nextSearchParams = new URLSearchParams(location.search);
    const assistantIdFromUrl = nextSearchParams.get("assistantId");
    const workspaceChanged =
      currentWorkspaceSlugRef.current !== workspaceSlugFromUrl;

    // 更新 workspace 记录
    currentWorkspaceSlugRef.current = workspaceSlugFromUrl;

    if (assistantIdFromUrl) {
      // URL 中有 assistantId 参数，设置它
      setSelectedAssistantId(assistantIdFromUrl);
      // 清除 URL 参数
      nextSearchParams.delete("assistantId");
      setSearchParams(nextSearchParams, { replace: true });
    } else if (workspaceChanged) {
      // workspace 变化但没有 URL 参数，重置 selectedAssistantId
      setSelectedAssistantId(null);
    }
  }, [workspaceSlugFromUrl, location.search, setSearchParams]);

  // 获取当前选中助手的完整信息（缓存在 ChatContainer 层面）
  useEffect(() => {
    async function fetchCurrentAssistant() {
      if (!selectedAssistantId || !workspace?.slug) {
        setCurrentAssistant(null);
        return;
      }

      try {
        const result = await WorkspaceAssistant.list(workspace.slug);
        if (result.success) {
          const assistant = result.data.assistants.find(
            (a) => String(a.id) === String(selectedAssistantId)
          );
          setCurrentAssistant(assistant || null);
        }
      } catch (error) {
        console.error("Failed to fetch current assistant:", error);
        setCurrentAssistant(null);
      }
    }

    fetchCurrentAssistant();
  }, [selectedAssistantId, workspace?.slug]);

  // Reload chat history filtered by the selected AI employee whenever selection changes.
  // Guards: workspace must already be loaded; skip the very first mount where knownHistory
  // is supplied by the parent (to avoid a double-load race).
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (!workspace?.slug) return;

    const assistantIdForQuery =
      selectedAssistantId !== undefined ? (selectedAssistantId ?? null) : null;

    loadWorkspaceChatData({
      slug: workspace.slug,
      threadSlug: threadSlug || null,
      assistantId: assistantIdForQuery,
    }).then(({ history }) => {
      setChatHistory(Array.isArray(history) ? history : []);
    });
  }, [selectedAssistantId, workspace?.slug, threadSlug]);

  // Maintain state of message from whatever is in PromptInput
  const handleMessageChange = (event) => {
    setMessage(event.target.value);
  };

  const { listening, resetTranscript } = useSpeechRecognition({
    clearTranscriptOnListen: true,
  });

  /**
   * Emit an update to the state of the prompt input without directly
   * passing a prop in so that it does not re-render constantly.
   * @param {string} messageContent - The message content to set
   * @param {'replace' | 'append'} writeMode - Replace current text or append to existing text (default: replace)
   */
  function setMessageEmit(messageContent = "", writeMode = "replace") {
    if (writeMode === "append") setMessage((prev) => prev + messageContent);
    else setMessage(messageContent ?? "");

    // Push the update to the PromptInput component (same logic as above to keep in sync)
    window.dispatchEvent(
      new CustomEvent(PROMPT_INPUT_EVENT, {
        detail: { messageContent, writeMode },
      })
    );
  }

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!message || message === "") return false;
    const { primary: moltAgent, hasIgnored } =
      selectPrimaryMoltMention(mentionSelections);
    const nativeMention = selectPrimaryNativeMention(mentionSelections);
    const replyUuid = v4();
    setMoltChatWarning(hasIgnored ? t("molt.chat.multi_molt_warning") : null);
    setMoltThreadStale(null);
    const prevChatHistory = [
      ...chatHistory,
      {
        content: message,
        role: "user",
        attachments: parseAttachments(),
        mentions: mentionSelections,
      },
      {
        uuid: replyUuid,
        content: "",
        role: "assistant",
        pending: true,
        userMessage: message,
        animate: true,
        moltAgent,
        assistantIdOverride: nativeMention?.id || null,
      },
    ];

    if (listening) {
      // Stop the mic if the send button is clicked
      endSTTSession();
    }
    setChatHistory(prevChatHistory);
    if (!moltAgent) {
      setMessageEmit("");
      setMentionSelections([]);
    }
    setLoadingResponse(true);
  };

  function endSTTSession() {
    SpeechRecognition.stopListening();
    resetTranscript();
  }

  const regenerateAssistantMessage = (chatId) => {
    const updatedHistory = chatHistory.slice(0, -1);
    const lastUserMessage = updatedHistory.slice(-1)[0];
    Workspace.deleteChats(workspace.slug, [chatId])
      .then(() =>
        sendCommand({
          text: lastUserMessage.content,
          autoSubmit: true,
          history: updatedHistory,
          attachments: lastUserMessage?.attachments,
        })
      )
      .catch((e) => console.error(e));
  };

  /**
   * Send a command to the LLM prompt input.
   * @param {Object} options - Arguments to send to the LLM
   * @param {string} options.text - The text to send to the LLM
   * @param {boolean} options.autoSubmit - Determines if the text should be sent immediately or if it should be added to the message state (default: false)
   * @param {Object[]} options.history - The history of the chat prior to this message for overriding the current chat history
   * @param {Object[import("./DnDWrapper").Attachment]} options.attachments - The attachments to send to the LLM for this message
   * @param {'replace' | 'append'} options.writeMode - Replace current text or append to existing text (default: replace)
   * @returns {void}
   */
  const sendCommand = async ({
    text = "",
    autoSubmit = false,
    history = [],
    attachments = [],
    writeMode = "replace",
  } = {}) => {
    // If we are not auto-submitting, we can just emit the text to the prompt input.
    if (!autoSubmit) {
      setMessageEmit(text, writeMode);
      return;
    }

    // If we are auto-submitting in append mode
    // than we need to update text with whatever is in the prompt input + the text we are sending.
    // @note: `message` will not work here since it is not updated yet.
    // If text is still empty, after this, then we should just return.
    if (writeMode === "append") {
      const currentText = document.getElementById(PROMPT_INPUT_ID)?.value;
      text = currentText + text;
    }

    if (!text || text === "") return false;
    const replyUuid = v4();
    // If we are auto-submitting
    // Then we can replace the current text since this is not accumulating.
    let prevChatHistory;
    if (history.length > 0) {
      // use pre-determined history chain.
      prevChatHistory = [
        ...history,
        {
          uuid: replyUuid,
          content: "",
          role: "assistant",
          pending: true,
          userMessage: text,
          attachments,
          animate: true,
        },
      ];
    } else {
      prevChatHistory = [
        ...chatHistory,
        {
          content: text,
          role: "user",
          attachments,
        },
        {
          uuid: replyUuid,
          content: "",
          role: "assistant",
          pending: true,
          userMessage: text,
          animate: true,
        },
      ];
    }

    setChatHistory(prevChatHistory);
    setMessageEmit("");
    setMentionSelections([]);
    setLoadingResponse(true);
  };

  useEffect(() => {
    function handleWorkspaceChatSubmit(event) {
      const detail = event?.detail || {};
      if (!detail.message) return;

      sendCommand({
        text: detail.message,
        autoSubmit: detail.autoSubmit ?? true,
        attachments: detail.attachments ?? [],
      });
    }

    window.addEventListener(
      WORKSPACE_CHAT_SUBMIT_EVENT,
      handleWorkspaceChatSubmit
    );
    return () =>
      window.removeEventListener(
        WORKSPACE_CHAT_SUBMIT_EVENT,
        handleWorkspaceChatSubmit
      );
  }, [sendCommand]);

  useEffect(() => {
    async function fetchReply() {
      const promptMessage =
        chatHistory.length > 0 ? chatHistory[chatHistory.length - 1] : null;
      const remHistory = chatHistory.length > 0 ? chatHistory.slice(0, -1) : [];
      var _chatHistory = [...remHistory];

      // Override hook for new messages to now go to agents until the connection closes
      if (!!websocket) {
        if (!promptMessage || !promptMessage?.userMessage) return false;
        window.dispatchEvent(new CustomEvent(CLEAR_ATTACHMENTS_EVENT));
        websocket.send(
          JSON.stringify({
            type: "awaitingFeedback",
            feedback: promptMessage?.userMessage,
          })
        );
        return;
      }

      if (!promptMessage || !promptMessage?.userMessage) return false;

      // If running and edit or regeneration, this history will already have attachments
      // so no need to parse the current state.
      const attachments = promptMessage?.attachments ?? parseAttachments();
      window.dispatchEvent(new CustomEvent(CLEAR_ATTACHMENTS_EVENT));

      if (promptMessage?.moltAgent) {
        const replyUuid = promptMessage.uuid;
        const streamErrorRef = { current: null };
        const scopeKey = buildMoltScopeKey(threadSlug);

        const result = await Molt.streamWorkspaceAgent({
          slug: workspace.slug,
          agentId: promptMessage.moltAgent.id,
          payload: {
            message: promptMessage.userMessage,
            scopeKey,
          },
          onChunk: (text) => {
            setChatHistory((prev) =>
              appendMoltStreamChunk(prev, replyUuid, text)
            );
          },
          onDone: (metadata) => {
            setChatHistory((prev) =>
              finalizeMoltStreamMessage(prev, replyUuid, metadata)
            );
          },
          onError: (error) => {
            streamErrorRef.current = error;
          },
        });

        if (!result?.success) {
          const error = streamErrorRef.current || result || {};
          const errorMessage =
            error?.code === "molt_offline"
              ? t("molt.chat.offline_error", {
                  agent: promptMessage.moltAgent.name,
                })
              : error?.message ||
                error?.error ||
                t("molt.chat.send_error_generic");
          const threadStale = error?.code === "thread_stale";
          setChatHistory((prev) => {
            const next = applyMoltStreamError(prev, replyUuid, {
              ...error,
              message: errorMessage,
            });
            return next.history;
          });
          if (threadStale) {
            setMoltThreadStale(promptMessage.moltAgent);
          }
          if (shouldPreserveMoltInput(error)) {
            setMessageEmit(promptMessage.userMessage);
            setMentionSelections(promptMessage.mentions || []);
          }
        } else {
          setMessageEmit("");
          setMentionSelections([]);
        }

        setLoadingResponse(false);
        return;
      }

      await Workspace.multiplexStream({
        workspaceSlug: workspace.slug,
        threadSlug,
        prompt: promptMessage.userMessage,
        chatHandler: (chatResult) =>
          handleChat(
            chatResult,
            setLoadingResponse,
            setChatHistory,
            remHistory,
            _chatHistory,
            setSocketId
          ),
        attachments,
        assistantId: promptMessage.assistantIdOverride || selectedAssistantId,
        responseStyle: getResponseStyle(), // 获取当前会话的回复风格
        authorizationMode,
      });
      return;
    }
    loadingResponse === true && fetchReply();
  }, [loadingResponse, chatHistory, workspace]);

  // TODO: Simplify this WSS stuff
  useEffect(() => {
    function handleWSS() {
      try {
        if (!socketId || !!websocket) return;
        const wsUrl = `${websocketURI()}/api/agent-invocation/${socketId}`;
        console.log("[Agent WebSocket] Connecting to:", wsUrl);
        const socket = new WebSocket(wsUrl);
        socket.supportsAgentStreaming = false;

        // 中止事件处理器 - 使用当前 socket 而非 websocket 状态变量
        const abortHandler = () => {
          console.log("[Agent WebSocket] Abort event received, closing socket");
          window.dispatchEvent(new CustomEvent(AGENT_SESSION_END));
          socket.close();
        };
        window.addEventListener(ABORT_STREAM_EVENT, abortHandler);

        socket.addEventListener("message", (event) => {
          setLoadingResponse(true);
          try {
            handleSocketResponse(socket, event, setChatHistory);
          } catch (e) {
            console.error("Failed to parse data");
            window.dispatchEvent(new CustomEvent(AGENT_SESSION_END));
            socket.close();
          }
          setLoadingResponse(false);
        });

        socket.addEventListener("close", (_event) => {
          // 移除中止事件监听器，避免内存泄漏
          window.removeEventListener(ABORT_STREAM_EVENT, abortHandler);
          window.dispatchEvent(new CustomEvent(AGENT_SESSION_END));
          // 不再添加 "Agent session complete." 状态消息
          // 对话已完成，无需额外的技术性提示
          setLoadingResponse(false);
          setWebsocket(null);
          setSocketId(null);
        });
        setWebsocket(socket);
        window.dispatchEvent(new CustomEvent(AGENT_SESSION_START));
        window.dispatchEvent(new CustomEvent(CLEAR_ATTACHMENTS_EVENT));
      } catch (e) {
        setChatHistory((prev) => [
          ...prev.filter((msg) => !!msg.content),
          {
            uuid: v4(),
            type: "abort",
            content: e.message,
            role: "assistant",
            sources: [],
            closed: true,
            error: e.message,
            animate: false,
            pending: false,
          },
        ]);
        setLoadingResponse(false);
        setWebsocket(null);
        setSocketId(null);
      }
    }
    handleWSS();
  }, [socketId]);

  return (
    <div
      className="transition-all duration-500 relative bg-theme-bg-chat w-full h-full flex flex-col border-l border-theme-border-subtle z-base"
    >
      {isMobile && <SidebarMobileHeader />}
      {/* 助手选择器 - 固定在顶部 */}
      <div className="flex-shrink-0 sticky top-0 z-sticky bg-theme-bg-secondary/95 backdrop-blur-sm border-b border-theme-border-subtle pt-3 pb-2">
        <div className="chat-column">
          <AssistantSelector
            workspaceSlug={workspaceSlugFromUrl || workspace.slug}
            selectedAssistantId={selectedAssistantId}
            onSelect={setSelectedAssistantId}
            onVoiceModeChange={setIsVoiceMode}
          />
          <AuthorizationModeToggle
            value={authorizationMode}
            onChange={setAuthorizationMode}
            isAdmin={isAdmin}
          />
        </div>
      </div>
      <DnDFileUploaderWrapper>
        <div className="flex-1 min-h-0 flex flex-col">
          <MetricsProvider>
            <ChatHistory
              history={chatHistory}
              workspace={workspace}
              sendCommand={sendCommand}
              updateHistory={setChatHistory}
              regenerateAssistantMessage={regenerateAssistantMessage}
              hasAttachments={files.length > 0}
              currentAssistant={currentAssistant}
            />
          </MetricsProvider>
        </div>

        {/* HitL 确认卡片区域 - 显示在输入框上方 */}
        {pendingConfirmations.length > 0 && (
          <div className="flex-shrink-0 px-4 py-2 max-h-[300px] overflow-y-auto">
            {pendingConfirmations.map((confirmation) => (
              <ConfirmationCard
                key={confirmation.id}
                confirmation={confirmation}
                workspaceSlug={workspace.slug}
                onConfirmed={handleConfirmationResolved}
                onRejected={handleConfirmationResolved}
              />
            ))}
          </div>
        )}

        {moltChatWarning && (
          <div
            role="status"
            className="mx-auto mb-2 w-full max-w-chat rounded-lg border border-yellow-400/30 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-100"
          >
            {moltChatWarning}
          </div>
        )}

        {moltThreadStale && (
          <div className="mx-auto mb-2 w-full max-w-chat rounded-lg border border-blue-400/30 bg-blue-500/10 px-3 py-2 text-xs text-blue-100">
            <div className="font-medium">
              {t("molt.chat.thread_stale_title")}
            </div>
            <button
              type="button"
              className="mt-2 rounded-md bg-blue-500/20 px-2 py-1 text-blue-50 hover:bg-blue-500/30"
              onClick={() => setMoltThreadStale(null)}
            >
              {t("molt.chat.thread_stale_action")}
            </button>
          </div>
        )}

        <div className="flex-shrink-0">
          <PromptInput
            submit={handleSubmit}
            onChange={handleMessageChange}
            isStreaming={loadingResponse}
            sendCommand={sendCommand}
            attachments={files}
            selectedAssistantId={selectedAssistantId}
            workspaceSlug={workspaceSlugFromUrl || workspace.slug}
            isVoiceMode={isVoiceMode}
            mentionSelections={mentionSelections}
            onMentionSelectionsChange={setMentionSelections}
          />
        </div>
      </DnDFileUploaderWrapper>
      <ChatTooltips />

      {/* Phase L3.1: AI 员工自我诊断指导对话框 */}
      <AgentGuidanceDialog
        isOpen={showGuidanceDialog}
        onClose={() => setShowGuidanceDialog(false)}
        diagnostics={diagnosticsData}
        onProvideGuidance={handleProvideGuidance}
        onContinue={handleContinueExecution}
      />
    </div>
  );
}
