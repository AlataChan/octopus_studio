import React, { useState, useMemo } from "react";
import { CaretDown } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";

import AgentAnimation from "@/media/animations/agent-animation.webm";
import AgentStatic from "@/media/animations/agent-static.png";
import StatusCapsule, { detectStatusType } from "./StatusCapsule";

/**
 * StatusResponse 组件
 *
 * @description 显示 Agent 状态响应，支持状态胶囊和思考链展开
 *
 * @param {Object} props
 * @param {Array} props.messages - 状态消息数组
 * @param {boolean} props.isThinking - 是否正在思考
 */
export default function StatusResponse({ messages = [], isThinking = false }) {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);
  const currentThought = messages[messages.length - 1];
  const previousThoughts = messages.slice(0, -1);
  const thoughtChainLabel = isExpanded
    ? t("chat_window.hide_thought_chain")
    : t("chat_window.show_thought_chain");

  // 检测当前状态类型
  const currentStatusType = useMemo(
    () => detectStatusType(currentThought?.content),
    [currentThought?.content]
  );

  function handleExpandClick() {
    if (!previousThoughts.length > 0) return;
    setIsExpanded(!isExpanded);
  }

  if (!currentThought) return null;

  return (
    <div className="flex justify-center w-full">
      <div className="w-full max-w-[80%] flex flex-col">
        <div className="w-full max-w-[800px]">
          <div
            onClick={handleExpandClick}
            style={{ borderRadius: "6px" }}
            className={`${!previousThoughts?.length ? "" : `${previousThoughts?.length ? "hover:bg-theme-sidebar-item-hover cursor-pointer" : ""}`} items-start bg-theme-bg-chat-input py-2 px-4 flex gap-x-2`}
          >
            {/* 左侧图标区域 */}
            <div className="w-7 h-7 flex justify-center flex-shrink-0 items-center">
              {isThinking ? (
                <video
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="w-8 h-8 scale-150 transition-opacity duration-200 light:invert light:opacity-50"
                  data-tooltip-id="agent-thinking"
                  data-tooltip-content={t("chat_window.agent_thinking")}
                  aria-label={t("chat_window.agent_thinking")}
                >
                  <source src={AgentAnimation} type="video/webm" />
                </video>
              ) : (
                <img
                  src={AgentStatic}
                  alt={t("chat_window.agent_finished_thinking")}
                  className="w-6 h-6 transition-opacity duration-200 light:invert light:opacity-50"
                  data-tooltip-id="agent-thinking"
                  data-tooltip-content={t(
                    "chat_window.agent_finished_thinking"
                  )}
                  aria-label={t("chat_window.agent_finished_thinking")}
                />
              )}
            </div>

            {/* 内容区域 */}
            <div className="flex-1 min-w-0">
              {/* 状态胶囊 */}
              <div className="mb-1.5">
                <StatusCapsule
                  content={currentThought.content}
                  statusType={currentStatusType}
                  isActive={isThinking}
                  compact={false}
                />
              </div>

              {/* 状态消息内容 */}
              <div
                className={`overflow-hidden transition-all duration-300 ease-in-out ${isExpanded ? "max-h-[420px] overflow-y-auto pr-2" : "max-h-6"}`}
              >
                <div className="text-theme-text-secondary font-mono leading-6 text-sm">
                  {!isExpanded ? (
                    <span className="block w-full truncate">
                      {currentThought.content}
                    </span>
                  ) : (
                    <>
                      {previousThoughts.map((thought, index) => (
                        <div
                          key={`cot-${thought.uuid || index}`}
                          className="mb-2 pb-2 border-b border-theme-sidebar-border/30"
                        >
                          <StatusCapsule
                            content={thought.content}
                            isActive={false}
                            compact={true}
                          />
                          <div className="mt-1">{thought.content}</div>
                        </div>
                      ))}
                      <div>{currentThought.content}</div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* 展开/收起按钮 */}
            <div className="flex items-center gap-x-2">
              {previousThoughts?.length > 0 && (
                <button
                  onClick={handleExpandClick}
                  data-tooltip-id="expand-cot"
                  data-tooltip-content={thoughtChainLabel}
                  className="border-none text-theme-text-secondary hover:text-theme-text-primary transition-colors p-1 rounded-full hover:bg-theme-sidebar-item-hover"
                  aria-label={thoughtChainLabel}
                >
                  <CaretDown
                    className={`w-4 h-4 transform transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
                  />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
