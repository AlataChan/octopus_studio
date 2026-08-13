import React, { memo } from "react";
import { Info, Warning } from "@phosphor-icons/react";
import UserIcon from "../../../../UserIcon";
import Actions from "./Actions";
import renderMarkdown from "@/utils/chat/markdown";
import { userFromStorage } from "@/utils/request";
import Citations from "../Citation";
import { v4 } from "uuid";
import DOMPurify from "@/utils/chat/purify";
import { EditMessageForm, useEditMessage } from "./Actions/EditMessage";
import { useWatchDeleteMessage } from "./Actions/DeleteMessage";
import TTSMessage from "./Actions/TTSButton";
import {
  THOUGHT_REGEX_CLOSE,
  THOUGHT_REGEX_COMPLETE,
  THOUGHT_REGEX_OPEN,
  ThoughtChainComponent,
} from "../ThoughtContainer";
import paths from "@/utils/paths";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { chatQueryRefusalResponse } from "@/utils/chat";
import AgentRoleTag, { extractAgentRoles } from "../AgentRoleTag";
import AssistantLibrary from "@/models/assistantLibrary";
import { MoltBubbleLabel } from "../../moltChatHelpers";

const HistoricalMessage = ({
  uuid = v4(),
  message,
  role,
  workspace,
  sources = [],
  attachments = [],
  error = false,
  feedbackScore = null,
  userRating = null,
  chatId = null,
  isLastMessage = false,
  regenerateMessage,
  saveEditedMessage,
  forkThread,
  metrics = {},
  alignmentCls = "",
  response = null, // 新增：完整的响应对象，用于提取 metadata
  currentAssistant = null, // 修改：接收完整的助手对象
  moltAgent = null,
}) => {
  const { t } = useTranslation();
  const { isEditing } = useEditMessage({ chatId, role });
  const { isDeleted, completeDelete, onEndAnimation } = useWatchDeleteMessage({
    chatId,
    role,
  });
  const adjustTextArea = (event) => {
    const element = event.target;
    element.style.height = "auto";
    element.style.height = element.scrollHeight + "px";
  };

  const isRefusalMessage =
    role === "assistant" && message === chatQueryRefusalResponse(workspace);

  // 提取 Agent 角色信息（仅对 assistant 消息）
  const agentRoles = role === "assistant" ? extractAgentRoles(response) : null;

  if (!!error) {
    return (
      <div
        key={uuid}
        className={`flex justify-center items-end w-full bg-theme-bg-chat`}
      >
        <div className="py-8 w-full flex gap-x-5 flex-col">
          <div className={`flex gap-x-5 ${alignmentCls}`}>
            <ProfileImage role={role} workspace={workspace} />
            <div className="p-2 rounded-lg bg-red-50 text-red-500">
              <span className="inline-block">
                <Warning className="h-4 w-4 mb-1 inline-block" /> Could not
                respond to message.
              </span>
              <p className="text-xs font-mono mt-2 border-l-2 border-red-300 pl-2 bg-red-200 p-2 rounded-sm">
                {error}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (completeDelete) return null;

  return (
    <div
      key={uuid}
      onAnimationEnd={onEndAnimation}
      className={`${
        isDeleted ? "animate-remove" : ""
      } flex justify-center items-end w-full group bg-theme-bg-chat`}
    >
      <div className="py-8 w-full flex gap-x-5 flex-col">
        <div className={`flex gap-x-5 ${alignmentCls}`}>
          <div className="flex flex-col items-center">
            <ProfileImage
              role={role}
              workspace={workspace}
              currentAssistant={currentAssistant}
            />
            <div className="mt-1 -mb-10">
              {role === "assistant" && (
                <TTSMessage
                  slug={workspace?.slug}
                  chatId={chatId}
                  message={message}
                />
              )}
            </div>
          </div>
          {isEditing ? (
            <EditMessageForm
              role={role}
              chatId={chatId}
              message={message}
              attachments={attachments}
              adjustTextArea={adjustTextArea}
              saveChanges={saveEditedMessage}
            />
          ) : (
            <div
              className={`break-words ${
                role === "user"
                  ? "bg-[var(--theme-accent-soft)] border border-[var(--theme-accent-border-soft)] rounded-xl px-4 py-3 shadow-sm"
                  : ""
              }`}
            >
              <MoltBubbleLabel agent={moltAgent} t={t} />
              <RenderChatContent
                role={role}
                message={message}
                expanded={isLastMessage}
              />
              {isRefusalMessage && (
                <Link
                  data-tooltip-id="query-refusal-info"
                  data-tooltip-content={`${t("chat.refusal.tooltip-description")}`}
                  className="!no-underline group !flex w-fit mt-2"
                  to={paths.chatModes()}
                  target="_blank"
                >
                  <div className="flex flex-row items-center gap-x-1 group-hover:opacity-100 opacity-60 w-fit">
                    <Info className="text-theme-text-secondary" />
                    <p className="!m-0 !p-0 text-theme-text-secondary !no-underline text-xs cursor-pointer">
                      {t("chat.refusal.tooltip-title")}
                    </p>
                  </div>
                </Link>
              )}
              <ChatAttachments attachments={attachments} />
              {/* 显示 Agent 角色标签（仅对 assistant 消息且有角色信息时） */}
              {role === "assistant" && agentRoles && (
                <AgentRoleTag agentRoles={agentRoles} />
              )}
            </div>
          )}
        </div>
        <div className="flex gap-x-5 ml-14">
          <Actions
            message={message}
            feedbackScore={feedbackScore}
            userRating={userRating}
            chatId={chatId}
            slug={workspace?.slug}
            isLastMessage={isLastMessage}
            regenerateMessage={regenerateMessage}
            isEditing={isEditing}
            role={role}
            forkThread={forkThread}
            metrics={metrics}
            alignmentCls={alignmentCls}
          />
        </div>
        {role === "assistant" && <Citations sources={sources} />}
      </div>
    </div>
  );
};

function ProfileImage({ role, workspace, currentAssistant }) {
  // 优先级：助手头像 > workspace 头像 > 默认图标
  if (role === "assistant") {
    // 如果有助手头像（URL）
    if (currentAssistant?.template?.avatarUrl) {
      const avatarUrl = AssistantLibrary.getIconUrl(
        currentAssistant.template.avatarUrl
      );
      return (
        <div className="relative w-[35px] h-[35px] rounded-full flex-shrink-0 overflow-hidden">
          <img
            src={avatarUrl}
            alt="Assistant avatar"
            className="absolute top-0 left-0 w-full h-full object-cover rounded-full bg-white"
          />
        </div>
      );
    }

    // 如果有助手图标（emoji）
    if (currentAssistant?.template?.icon) {
      return (
        <div className="relative w-[35px] h-[35px] rounded-full flex-shrink-0 overflow-hidden flex items-center justify-center bg-theme-bg-primary">
          <span className="text-xl">{currentAssistant.template.icon}</span>
        </div>
      );
    }

    // 回退到 workspace 头像
    if (workspace.pfpUrl) {
      return (
        <div className="relative w-[35px] h-[35px] rounded-full flex-shrink-0 overflow-hidden">
          <img
            src={workspace.pfpUrl}
            alt="Workspace profile picture"
            className="absolute top-0 left-0 w-full h-full object-cover rounded-full bg-white"
          />
        </div>
      );
    }
  }

  // 默认图标
  return (
    <UserIcon
      user={{
        uid: role === "user" ? userFromStorage()?.username : workspace.slug,
      }}
      role={role}
    />
  );
}

export default memo(
  HistoricalMessage,
  // Skip re-render the historical message:
  // if the content is the exact same AND (not streaming)
  // the lastMessage status is the same (regen icon)
  // and the chatID matches between renders. (feedback icons)
  (prevProps, nextProps) => {
    return (
      prevProps.message === nextProps.message &&
      prevProps.isLastMessage === nextProps.isLastMessage &&
      prevProps.chatId === nextProps.chatId
    );
  }
);

function ChatAttachments({ attachments = [] }) {
  if (!attachments.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {attachments.map((item) => (
        <img
          key={item.name}
          src={item.contentString}
          className="max-w-[300px] rounded-md"
        />
      ))}
    </div>
  );
}

const RenderChatContent = memo(
  ({ role, message, expanded = false }) => {
    // If the message is not from the assistant, we can render it directly
    // as normal since the user cannot think (lol)
    if (role !== "assistant")
      return (
        <span
          className="flex flex-col gap-y-1"
          dangerouslySetInnerHTML={{
            __html: DOMPurify.sanitize(renderMarkdown(message)),
          }}
        />
      );
    let thoughtChain = null;
    let msgToRender = message;
    if (!message) return null;

    // If the message is a perfect thought chain, we can render it directly
    // Complete == open and close tags match perfectly.
    if (message.match(THOUGHT_REGEX_COMPLETE)) {
      thoughtChain = message.match(THOUGHT_REGEX_COMPLETE)?.[0];
      msgToRender = message.replace(THOUGHT_REGEX_COMPLETE, "");
    }

    // If the message is a thought chain but not a complete thought chain (matching opening tags but not closing tags),
    // we can render it as a thought chain if we can at least find a closing tag
    // This can occur when the assistant starts with <thinking> and then <response>'s later.
    if (
      message.match(THOUGHT_REGEX_OPEN) &&
      message.match(THOUGHT_REGEX_CLOSE)
    ) {
      const closingTag = message.match(THOUGHT_REGEX_CLOSE)?.[0];
      const closingTagIdx = closingTag ? message.indexOf(closingTag) : -1;
      if (closingTag && closingTagIdx !== -1) {
        // NOTE: do not use `message.split(closingTag)[1]` — if the closing tag appears
        // multiple times (e.g., malformed output with repeated `</think>`), it will truncate
        // everything after the 2nd occurrence.
        thoughtChain = message.slice(0, closingTagIdx + closingTag.length);
        msgToRender = message.slice(closingTagIdx + closingTag.length);
      }
    }

    return (
      <>
        {thoughtChain && (
          <ThoughtChainComponent content={thoughtChain} expanded={expanded} />
        )}
        <span
          className="flex flex-col gap-y-1"
          dangerouslySetInnerHTML={{
            __html: DOMPurify.sanitize(renderMarkdown(msgToRender)),
          }}
        />
      </>
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.role === nextProps.role &&
      prevProps.message === nextProps.message &&
      prevProps.expanded === nextProps.expanded
    );
  }
);
