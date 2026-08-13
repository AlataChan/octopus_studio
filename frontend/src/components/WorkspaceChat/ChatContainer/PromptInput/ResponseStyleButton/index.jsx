import React, { useState, useEffect } from "react";
import { Lightning, ChatCircle, Brain } from "@phosphor-icons/react";
import { Tooltip } from "react-tooltip";
import { useTranslation } from "react-i18next";

/**
 * 回复风格选项
 * - quick: 快速模式，简洁回答
 * - normal: 常规模式，适中回答
 * - thinking: 思考模式，详细回答
 */
const RESPONSE_STYLES = [
  {
    key: "quick",
    icon: Lightning,
    label: "快速",
    description: "简洁直接的回答",
    promptHint: "请保持回复简洁，直接给出答案，省略不必要的解释。",
  },
  {
    key: "normal",
    icon: ChatCircle,
    label: "常规",
    description: "适中的回答",
    promptHint: "", // 默认模式，不添加额外提示
  },
  {
    key: "thinking",
    icon: Brain,
    label: "思考",
    description: "详细深入的回答",
    promptHint: "请提供详细的解释和背景信息，深入分析问题，给出全面的回答。",
  },
];

// 事件名称，用于通知其他组件风格变化
export const RESPONSE_STYLE_CHANGE_EVENT = "response_style_change";

/**
 * 获取当前会话的回复风格
 * @returns {string} 风格 key
 */
export function getResponseStyle() {
  return sessionStorage.getItem("response_style") || "normal";
}

/**
 * 获取当前风格的提示词
 * @returns {string} 提示词片段
 */
export function getResponseStylePromptHint() {
  const currentStyle = getResponseStyle();
  const style = RESPONSE_STYLES.find((s) => s.key === currentStyle);
  return style?.promptHint || "";
}

/**
 * 回复风格切换按钮
 * 循环切换：快速 → 常规 → 思考 → 快速...
 */
export default function ResponseStyleButton() {
  const { t } = useTranslation();
  const [currentStyleIndex, setCurrentStyleIndex] = useState(1); // 默认常规模式

  // 初始化时从 sessionStorage 读取
  useEffect(() => {
    const savedStyle = sessionStorage.getItem("response_style");
    if (savedStyle) {
      const index = RESPONSE_STYLES.findIndex((s) => s.key === savedStyle);
      if (index !== -1) {
        setCurrentStyleIndex(index);
      }
    }
  }, []);

  const currentStyle = RESPONSE_STYLES[currentStyleIndex];
  const IconComponent = currentStyle.icon;

  /**
   * 循环切换到下一个风格
   */
  const handleClick = () => {
    const nextIndex = (currentStyleIndex + 1) % RESPONSE_STYLES.length;
    setCurrentStyleIndex(nextIndex);

    const nextStyle = RESPONSE_STYLES[nextIndex];
    sessionStorage.setItem("response_style", nextStyle.key);

    // 触发事件通知其他组件
    window.dispatchEvent(
      new CustomEvent(RESPONSE_STYLE_CHANGE_EVENT, {
        detail: nextStyle,
      })
    );
  };

  return (
    <>
      <button
        type="button"
        data-tooltip-id="tooltip-response-style"
        data-tooltip-content={`${currentStyle.label}模式：${currentStyle.description}（点击切换）`}
        onClick={handleClick}
        className="border-none flex justify-center items-center opacity-60 hover:opacity-100 light:opacity-100 light:hover:opacity-60 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--theme-accent-primary)] rounded-lg transition-all duration-200"
        aria-label={`回复风格：${currentStyle.label}`}
      >
        <IconComponent
          weight="fill"
          className="w-[22px] h-[22px] pointer-events-none"
          color="var(--theme-sidebar-footer-icon-fill)"
        />
      </button>
      <Tooltip
        id="tooltip-response-style"
        place="top"
        delayShow={300}
        className="tooltip !text-xs z-99"
      />
    </>
  );
}

// 导出风格列表供其他组件使用
export { RESPONSE_STYLES };
