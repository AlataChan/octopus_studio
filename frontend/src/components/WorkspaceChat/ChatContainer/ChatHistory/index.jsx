import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import HistoricalMessage from "./HistoricalMessage";
import PromptReply from "./PromptReply";
import AgentProcessGroup from "./AgentProcessGroup";
import { useManageWorkspaceModal } from "../../../Modals/ManageWorkspace";
import ManageWorkspace from "../../../Modals/ManageWorkspace";
import { ArrowDown, ChatCircleDots } from "@phosphor-icons/react";
import debounce from "lodash.debounce";
import useUser from "@/hooks/useUser";
import Chartable from "./Chartable";
import Workspace from "@/models/workspace";
import { useNavigate, useParams } from "react-router-dom";
import paths from "@/utils/paths";
import Appearance from "@/models/appearance";
import useTextSize from "@/hooks/useTextSize";
import { v4 } from "uuid";
import { useTranslation } from "react-i18next";
import { useChatMessageAlignment } from "@/hooks/useChatMessageAlignment";

const SCROLL_BOTTOM_TOLERANCE_PX = 4;
const USER_SCROLL_THRESHOLD_PX = 10;

export function isChatScrolledToBottom(
  { scrollHeight, scrollTop, clientHeight },
  tolerancePx = SCROLL_BOTTOM_TOLERANCE_PX
) {
  return scrollHeight - scrollTop - clientHeight < tolerancePx;
}

export function getChatScrollState({
  scrollHeight,
  scrollTop,
  clientHeight,
  lastScrollTop,
  isUserScrolling,
  bottomTolerancePx = SCROLL_BOTTOM_TOLERANCE_PX,
  userScrollThresholdPx = USER_SCROLL_THRESHOLD_PX,
}) {
  const isAtBottom = isChatScrolledToBottom(
    { scrollHeight, scrollTop, clientHeight },
    bottomTolerancePx
  );
  const userMovedScroll =
    Math.abs(scrollTop - lastScrollTop) > userScrollThresholdPx;

  return {
    isAtBottom,
    isUserScrolling: userMovedScroll ? !isAtBottom : isUserScrolling,
    lastScrollTop: scrollTop,
  };
}

export function shouldAutoScrollChat({
  isAtBottom,
  isUserScrolling,
  isStreaming,
}) {
  return Boolean(isStreaming) || (!isUserScrolling && isAtBottom);
}

export default function ChatHistory({
  history = [],
  workspace,
  sendCommand,
  updateHistory,
  regenerateAssistantMessage,
  hasAttachments = false,
  currentAssistant = null, // 修改：传递完整的助手对象而不是 ID
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const lastScrollTopRef = useRef(0);
  const isUserScrollingRef = useRef(false);
  const { user } = useUser();
  const { threadSlug = null } = useParams();
  const { showing, showModal, hideModal } = useManageWorkspaceModal();
  const [isAtBottom, setIsAtBottom] = useState(true);
  const chatHistoryRef = useRef(null);
  const [isUserScrolling, setIsUserScrolling] = useState(false);
  const isStreaming = Boolean(history[history.length - 1]?.animate);
  const { showScrollbar } = Appearance.getSettings();
  const { textSizeClass } = useTextSize();
  const { getMessageAlignment } = useChatMessageAlignment();

  useEffect(() => {
    if (shouldAutoScrollChat({ isAtBottom, isUserScrolling, isStreaming })) {
      scrollToBottom(false); // Use instant scroll for auto-scrolling
    }
  }, [history, isAtBottom, isStreaming, isUserScrolling]);

  const setUserScrollingState = (value) => {
    isUserScrollingRef.current = value;
    setIsUserScrolling(value);
  };

  const handleScroll = (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.target;
    const nextScrollState = getChatScrollState({
      scrollTop,
      scrollHeight,
      clientHeight,
      lastScrollTop: lastScrollTopRef.current,
      isUserScrolling: isUserScrollingRef.current,
    });

    setUserScrollingState(nextScrollState.isUserScrolling);
    setIsAtBottom(nextScrollState.isAtBottom);
    lastScrollTopRef.current = nextScrollState.lastScrollTop;
  };

  const debouncedScroll = useMemo(() => debounce(handleScroll, 100), []);

  useEffect(() => {
    const chatHistoryElement = chatHistoryRef.current;
    if (chatHistoryElement) {
      chatHistoryElement.addEventListener("scroll", debouncedScroll);
      return () => {
        chatHistoryElement.removeEventListener("scroll", debouncedScroll);
        debouncedScroll.cancel();
      };
    }
  }, []);

  const scrollToBottom = (smooth = false) => {
    if (chatHistoryRef.current) {
      chatHistoryRef.current.scrollTo({
        top: chatHistoryRef.current.scrollHeight,

        // Smooth is on when user clicks the button but disabled during auto scroll
        // We must disable this during auto scroll because it causes issues with
        // detecting when we are at the bottom of the chat.
        ...(smooth ? { behavior: "smooth" } : {}),
      });
    }
  };

  // When the user picks a different AI employee, jump straight to the latest
  // messages so they never have to scroll down manually. Reset the scroll state
  // and scroll after the DOM settles (selection may also swap in new history).
  useEffect(() => {
    setUserScrollingState(false);
    setIsAtBottom(true);
    const timer = setTimeout(() => scrollToBottom(false), 50);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentAssistant?.id]);

  const handleSendSuggestedMessage = (heading, message) => {
    sendCommand({ text: `${heading} ${message}`, autoSubmit: true });
  };

  const saveEditedMessage = async ({
    editedMessage,
    chatId,
    role,
    attachments = [],
  }) => {
    if (!editedMessage) return; // Don't save empty edits.

    // if the edit was a user message, we will auto-regenerate the response and delete all
    // messages post modified message
    if (role === "user") {
      // remove all messages after the edited message
      // technically there are two chatIds per-message pair, this will split the first.
      const updatedHistory = history.slice(
        0,
        history.findIndex((msg) => msg.chatId === chatId) + 1
      );

      // update last message in history to edited message
      updatedHistory[updatedHistory.length - 1].content = editedMessage;
      // remove all edited messages after the edited message in backend
      await Workspace.deleteEditedChats(workspace.slug, threadSlug, chatId);
      sendCommand({
        text: editedMessage,
        autoSubmit: true,
        history: updatedHistory,
        attachments,
      });
      return;
    }

    // If role is an assistant we simply want to update the comment and save on the backend as an edit.
    if (role === "assistant") {
      const updatedHistory = [...history];
      const targetIdx = history.findIndex(
        (msg) => msg.chatId === chatId && msg.role === role
      );
      if (targetIdx < 0) return;
      updatedHistory[targetIdx].content = editedMessage;
      updateHistory(updatedHistory);
      await Workspace.updateChatResponse(
        workspace.slug,
        threadSlug,
        chatId,
        editedMessage
      );
      return;
    }
  };

  const forkThread = async (chatId) => {
    const newThreadSlug = await Workspace.forkThread(
      workspace.slug,
      threadSlug,
      chatId
    );
    navigate(paths.workspace.thread(workspace.slug, newThreadSlug));
  };

  const compiledHistory = useMemo(
    () =>
      buildMessages({
        workspace,
        history,
        regenerateAssistantMessage,
        saveEditedMessage,
        forkThread,
        getMessageAlignment,
        currentAssistant, // 传递完整的助手对象
      }),
    [
      workspace,
      history,
      regenerateAssistantMessage,
      saveEditedMessage,
      forkThread,
      currentAssistant, // 添加依赖
    ]
  );
  const lastMessageInfo = useMemo(() => getLastMessageInfo(history), [history]);
  const renderProcessGroup = useCallback(
    (item, index) => {
      const isLast = index === compiledHistory.length - 1;
      return (
        <AgentProcessGroup
          key={`process-group-${index}`}
          items={item.items}
          isActive={isLast && lastMessageInfo.isAnimating}
        />
      );
    },
    [compiledHistory.length, lastMessageInfo]
  );

  if (history.length === 0 && !hasAttachments) {
    const defaultSuggestions = [
      {
        heading: t("chat_window.suggestions.intro.heading"),
        message: t("chat_window.suggestions.intro.message"),
      },
      {
        heading: t("chat_window.suggestions.analyze.heading"),
        message: t("chat_window.suggestions.analyze.message"),
      },
      {
        heading: t("chat_window.suggestions.task.heading"),
        message: t("chat_window.suggestions.task.message"),
      },
    ];

    return (
      <div className="flex flex-col h-full md:mt-0 pb-4 w-full justify-center items-center">
        <div className="flex flex-col items-center md:max-w-[600px] w-full px-4 text-center">
          <div className="w-12 h-12 rounded-full bg-[var(--theme-accent-soft)] text-[var(--theme-accent-primary)] flex items-center justify-center mb-6">
            <ChatCircleDots size={24} weight="fill" />
          </div>
          <h2 className="text-theme-text-primary text-lg font-semibold mb-2">
            {t("chat_window.welcome")}
          </h2>
          {!user || user.role !== "default" ? (
            <p className="w-full text-theme-text-secondary text-sm mb-8">
              {t("chat_window.get_started")}
              <span
                className="underline font-medium cursor-pointer mx-1"
                onClick={showModal}
              >
                {t("chat_window.upload")}
              </span>
              {t("chat_window.or")}{" "}
              <b className="font-medium italic">{t("chat_window.send_chat")}</b>
            </p>
          ) : (
            <p className="w-full text-theme-text-secondary text-sm mb-8">
              {t("chat_window.get_started_default")}{" "}
              <b className="font-medium italic">{t("chat_window.send_chat")}</b>
            </p>
          )}
          <WorkspaceChatSuggestions
            suggestions={
              (workspace?.suggestedMessages ?? []).length > 0
                ? workspace.suggestedMessages
                : defaultSuggestions
            }
            sendSuggestion={handleSendSuggestedMessage}
          />
        </div>
        {showing && (
          <ManageWorkspace
            hideModal={hideModal}
            providedSlug={workspace.slug}
          />
        )}
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* 聊天消息区域 - 可滚动 */}
      <div
        className={`markdown text-theme-text-primary font-light ${textSizeClass} flex-1 min-h-0 pb-6 pt-6 md:pt-0 md:pb-6 md:mx-0 overflow-y-scroll flex flex-col justify-start ${showScrollbar ? "show-scrollbar" : "no-scroll"}`}
        id="chat-history"
        ref={chatHistoryRef}
        onScroll={handleScroll}
      >
        <div className="chat-column flex flex-col">
          {compiledHistory.map((item, index) =>
            item && item.__processGroup
              ? renderProcessGroup(item, index)
              : item
          )}
        </div>
        {showing && (
          <ManageWorkspace
            hideModal={hideModal}
            providedSlug={workspace.slug}
          />
        )}
        {!isAtBottom && (
          <div className="fixed bottom-40 right-10 md:right-20 z-50 cursor-pointer animate-pulse">
            <div className="flex flex-col items-center">
              <div
                className="p-1 rounded-full border border-theme-border bg-theme-bg-secondary hover:bg-theme-sidebar-item-hover hover:text-theme-text-primary shadow-lg"
                onClick={() => {
                  scrollToBottom(true);
                  setUserScrollingState(false);
                }}
              >
                <ArrowDown weight="bold" className="text-theme-text-secondary w-5 h-5" />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const getLastMessageInfo = (history) => {
  const lastMessage = history?.[history.length - 1] || {};
  return {
    isAnimating: lastMessage?.animate,
    isStatusResponse: lastMessage?.type === "statusResponse",
  };
};

function WorkspaceChatSuggestions({ suggestions = [], sendSuggestion }) {
  if (suggestions.length === 0) return null;
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-theme-text-primary mt-4 w-full">
      {suggestions.map((suggestion, index) => (
        <button
          key={index}
          className="bg-theme-bg-secondary border border-theme-border rounded-xl p-3 text-left hover:border-[var(--theme-accent-border-soft)] hover:bg-theme-sidebar-item-hover transition-colors cursor-pointer flex flex-col gap-y-1"
          onClick={() => sendSuggestion(suggestion.heading, suggestion.message)}
        >
          <p className="text-theme-text-primary text-sm font-medium">
            {suggestion.heading}
          </p>
          <p className="text-theme-text-secondary text-[10px] leading-[14px]">
            {suggestion.message}
          </p>
        </button>
      ))}
    </div>
  );
}

/**
 * Builds the history of messages for the chat.
 * This is mostly useful for rendering the history in a way that is easy to understand.
 * as well as compensating for agent thinking and other messages that are not part of the history, but
 * are still part of the chat.
 *
 * @param {Object} param0 - The parameters for building the messages.
 * @param {Array} param0.history - The history of messages.
 * @param {Object} param0.workspace - The workspace object.
 * @param {Function} param0.regenerateAssistantMessage - The function to regenerate the assistant message.
 * @param {Function} param0.saveEditedMessage - The function to save the edited message.
 * @param {Function} param0.forkThread - The function to fork the thread.
 * @param {Function} param0.getMessageAlignment - The function to get the alignment of the message (returns class).
 * @param {string|null} param0.selectedAssistantId - The ID of the currently selected assistant.
 * @returns {Array} The compiled history of messages.
 */
function buildMessages({
  history,
  workspace,
  regenerateAssistantMessage,
  saveEditedMessage,
  forkThread,
  getMessageAlignment,
  currentAssistant, // 修改：接收完整的助手对象
}) {
  return history.reduce((acc, props, index) => {
    const isLastBotReply =
      index === history.length - 1 && props.role === "assistant";

    // Agent 过程块（思考/状态、流程进度、任务列表）折叠为一个连续分组，
    // 由 AgentProcessGroup 默认收起成一行摘要，点击才展开详情。
    const lastEntry = acc.length > 0 ? acc[acc.length - 1] : null;
    const ensureProcessGroup = () => {
      if (lastEntry && lastEntry.__processGroup) return lastEntry;
      const group = { __processGroup: true, items: [] };
      acc.push(group);
      return group;
    };

    if (props?.type === "statusResponse" && !!props.content) {
      const group = ensureProcessGroup();
      const lastItem = group.items[group.items.length - 1];
      if (lastItem && lastItem.kind === "status") {
        lastItem.payload.push(props);
      } else {
        group.items.push({ kind: "status", payload: [props] });
      }
      return acc;
    }

    // Flow 执行进度指示器
    if (props?.type === "flowProgress" && !!props.content) {
      ensureProcessGroup().items.push({ kind: "flow", payload: props.content });
      return acc;
    }

    if (props?.type === "agentTaskList" && !!props.content) {
      ensureProcessGroup().items.push({
        kind: "taskList",
        payload: props.content,
      });
      return acc;
    }

    // Reasoning stream chunks: coalesce into a single "reasoning" item per
    // contiguous run (consecutive chunks are already merged in agent.js, so
    // each chat-history entry is one fully-accumulated reasoning message).
    if (props?.type === "reasoningChunk" && props.content != null) {
      ensureProcessGroup().items.push({
        kind: "reasoning",
        payload: props,
      });
      return acc;
    }

    if (props.type === "rechartVisualize" && !!props.content) {
      acc.push(
        <Chartable key={props.uuid} workspace={workspace} props={props} />
      );
    } else if (isLastBotReply && props.animate) {
      acc.push(
        <PromptReply
          key={props.uuid || v4()}
          uuid={props.uuid}
          reply={props.content}
          pending={props.pending}
          sources={props.sources}
          error={props.error}
          workspace={workspace}
          closed={props.closed}
          currentAssistant={currentAssistant} // 传递完整的助手对象
          moltAgent={props.moltAgent}
        />
      );
    } else {
      acc.push(
        <HistoricalMessage
          key={index}
          message={props.content}
          role={props.role}
          workspace={workspace}
          sources={props.sources}
          feedbackScore={props.feedbackScore}
          userRating={props.userRating}
          chatId={props.chatId}
          error={props.error}
          attachments={props.attachments}
          regenerateMessage={regenerateAssistantMessage}
          isLastMessage={isLastBotReply}
          saveEditedMessage={saveEditedMessage}
          forkThread={forkThread}
          metrics={props.metrics}
          alignmentCls={getMessageAlignment?.(props.role)}
          response={props.response} // 传递完整的响应对象
          currentAssistant={currentAssistant} // 传递完整的助手对象
          moltAgent={props.moltAgent}
        />
      );
    }
    return acc;
  }, []);
}
