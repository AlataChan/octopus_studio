import { memo, useRef, useEffect } from "react";
import { Warning } from "@phosphor-icons/react";
import UserIcon from "../../../../UserIcon";
import renderMarkdown from "@/utils/chat/markdown";
import DOMPurify from "@/utils/chat/purify";
import Citations from "../Citation";
import {
  THOUGHT_REGEX_CLOSE,
  THOUGHT_REGEX_COMPLETE,
  THOUGHT_REGEX_OPEN,
  ThoughtChainComponent,
} from "../ThoughtContainer";
import AssistantLibrary from "@/models/assistantLibrary";
import { useTranslation } from "react-i18next";
import { MoltBubbleLabel } from "../../moltChatHelpers";

const PromptReply = ({
  uuid,
  reply,
  pending,
  error,
  workspace,
  sources = [],
  closed = true,
  currentAssistant = null, // 修改：接收完整的助手对象
  moltAgent = null,
}) => {
  const { t } = useTranslation();
  const assistantBackgroundColor = "bg-theme-bg-chat";

  if (!reply && sources.length === 0 && !pending && !error) return null;

  if (pending) {
    return (
      <div
        className={`flex justify-center items-end w-full ${assistantBackgroundColor}`}
      >
        <div className="py-6 px-4 w-full flex gap-x-5 md:max-w-[80%] flex-col">
          <div className="flex gap-x-5">
            <WorkspaceProfileImage
              workspace={workspace}
              currentAssistant={currentAssistant}
            />
            <div className="mt-3 ml-5 dot-falling light:invert"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={`flex justify-center items-end w-full ${assistantBackgroundColor}`}
      >
        <div className="py-6 px-4 w-full flex gap-x-5 md:max-w-[80%] flex-col">
          <div className="flex gap-x-5">
            <WorkspaceProfileImage
              workspace={workspace}
              currentAssistant={currentAssistant}
            />
            <span
              className={`inline-block p-2 rounded-lg bg-red-50 text-red-500`}
            >
              <Warning className="h-4 w-4 mb-1 inline-block" /> Could not
              respond to message.
              <span className="text-xs">Reason: {error || "unknown"}</span>
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      key={uuid}
      className={`flex justify-center items-end w-full ${assistantBackgroundColor}`}
    >
      <div className="py-8 px-4 w-full flex gap-x-5 md:max-w-[80%] flex-col">
        <div className="flex gap-x-5">
          <WorkspaceProfileImage
            workspace={workspace}
            currentAssistant={currentAssistant}
          />
          <div className="min-w-0">
            <MoltBubbleLabel agent={moltAgent} t={t} />
            <RenderAssistantChatContent
              key={`${uuid}-prompt-reply-content`}
              message={reply}
              closed={closed}
            />
          </div>
        </div>
        <Citations sources={sources} />
      </div>
    </div>
  );
};

export function WorkspaceProfileImage({ workspace, currentAssistant = null }) {
  // 优先级：助手头像 > workspace 头像 > 默认图标
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
          className="absolute top-0 left-0 w-full h-full object-cover rounded-full bg-theme-bg-primary"
        />
      </div>
      );
      }

      return <UserIcon user={{ uid: workspace.slug }} role="assistant" />;
      }
function getStableMarkdownSplitIndex(markdownText = "", startIndex = 0) {
  const text = String(markdownText || "");
  if (text.length === 0) return 0;

  let stableIndex = Math.max(0, startIndex);
  let cursor = Math.max(0, startIndex);
  let inFence = false;
  /** @type {"```" | "~~~" | null} */
  let fenceMarker = null;

  while (cursor < text.length) {
    let lineEnd = text.indexOf("\n", cursor);
    const hasNewline = lineEnd !== -1;
    if (!hasNewline) lineEnd = text.length;

    const line = text.slice(cursor, lineEnd);
    const nextCursor = hasNewline ? lineEnd + 1 : lineEnd;

    const trimmed = line.trim();
    const isFenceLine = trimmed.startsWith("```") || trimmed.startsWith("~~~");

    if (isFenceLine) {
      const marker = trimmed.startsWith("~~~") ? "~~~" : "```";

      if (!inFence) {
        inFence = true;
        fenceMarker = marker;
      } else if (fenceMarker && trimmed.startsWith(fenceMarker)) {
        inFence = false;
        fenceMarker = null;
        stableIndex = nextCursor;
      }

      cursor = nextCursor;
      continue;
    }

    if (!inFence && trimmed.length === 0) {
      stableIndex = nextCursor;
    }

    cursor = nextCursor;
  }

  return stableIndex;
}

function RenderAssistantChatContent({ message, closed = true }) {
  const thoughtChainRef = useRef(null);
  const stableIndexRef = useRef(0);
  const stableTextRef = useRef("");
  const stableHtmlRef = useRef("");

  useEffect(() => {
    const thinking =
      message.match(THOUGHT_REGEX_OPEN) && !message.match(THOUGHT_REGEX_CLOSE);

    if (thinking && thoughtChainRef.current) {
      thoughtChainRef.current.updateContent(message);
      return;
    }

    const completeThoughtChain = message.match(THOUGHT_REGEX_COMPLETE)?.[0];
    if (completeThoughtChain && thoughtChainRef.current) {
      thoughtChainRef.current.updateContent(completeThoughtChain);
    }
  }, [message]);

  const thinking =
    message.match(THOUGHT_REGEX_OPEN) && !message.match(THOUGHT_REGEX_CLOSE);
  if (thinking)
    return (
      <ThoughtChainComponent ref={thoughtChainRef} content="" expanded={true} />
    );

  const hasCompleteThoughtChain = Boolean(
    message.match(THOUGHT_REGEX_COMPLETE)
  );
  const msgToRender = message.replace(THOUGHT_REGEX_COMPLETE, "");

  const html = (() => {
    if (closed) {
      stableIndexRef.current = 0;
      stableTextRef.current = "";
      stableHtmlRef.current = "";
      return DOMPurify.sanitize(renderMarkdown(msgToRender));
    }

    if (
      stableIndexRef.current > msgToRender.length ||
      (stableTextRef.current && !msgToRender.startsWith(stableTextRef.current))
    ) {
      stableIndexRef.current = 0;
      stableTextRef.current = "";
      stableHtmlRef.current = "";
    }

    const stableIndex = getStableMarkdownSplitIndex(
      msgToRender,
      stableIndexRef.current
    );
    stableIndexRef.current = stableIndex;
    const stableText = msgToRender.slice(0, stableIndex);
    const tailText = msgToRender.slice(stableIndex);

    if (stableText !== stableTextRef.current) {
      stableTextRef.current = stableText;
      stableHtmlRef.current = stableText
        ? DOMPurify.sanitize(renderMarkdown(stableText))
        : "";
    }

    const tailHtml = tailText
      ? DOMPurify.sanitize(renderMarkdown(tailText))
      : "";
    return stableHtmlRef.current + tailHtml;
  })();

  return (
    <div className="flex flex-col gap-y-1">
      {hasCompleteThoughtChain && (
        <ThoughtChainComponent
          ref={thoughtChainRef}
          content=""
          expanded={true}
        />
      )}
      <span
        className="break-words"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}

export default memo(PromptReply);
