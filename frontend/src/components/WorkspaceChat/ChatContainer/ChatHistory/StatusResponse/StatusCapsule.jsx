import React, { useMemo } from "react";
import {
  Brain,
  Wrench,
  MagnifyingGlass,
  PencilSimple,
  CircleNotch,
  Lightning,
} from "@phosphor-icons/react";

/**
 * 状态类型定义
 * @typedef {'thinking' | 'tool-calling' | 'searching' | 'writing' | 'unknown'} StatusType
 */

/**
 * 状态配置映射
 */
const STATUS_CONFIG = {
  thinking: {
    icon: Brain,
    label: "思考中",
    labelEn: "Thinking",
    bgColor: "bg-blue-500/10",
    borderColor: "border-blue-500/30",
    textColor: "text-blue-400",
    iconColor: "text-blue-400",
  },
  "tool-calling": {
    icon: Wrench,
    label: "调用工具",
    labelEn: "Calling Tool",
    bgColor: "bg-purple-500/10",
    borderColor: "border-purple-500/30",
    textColor: "text-purple-400",
    iconColor: "text-purple-400",
  },
  searching: {
    icon: MagnifyingGlass,
    label: "搜索中",
    labelEn: "Searching",
    bgColor: "bg-green-500/10",
    borderColor: "border-green-500/30",
    textColor: "text-green-400",
    iconColor: "text-green-400",
  },
  writing: {
    icon: PencilSimple,
    label: "生成中",
    labelEn: "Writing",
    bgColor: "bg-orange-500/10",
    borderColor: "border-orange-500/30",
    textColor: "text-orange-400",
    iconColor: "text-orange-400",
  },
  unknown: {
    icon: Lightning,
    label: "处理中",
    labelEn: "Processing",
    bgColor: "bg-gray-500/10",
    borderColor: "border-gray-500/30",
    textColor: "text-theme-text-secondary",
    iconColor: "text-theme-text-secondary",
  },
};

/**
 * 状态检测关键词映射
 */
const STATUS_KEYWORDS = {
  thinking: [
    "thinking",
    "analyzing",
    "考虑",
    "分析",
    "思考",
    "理解",
    "判断",
    "evaluating",
    "planning",
    "规划",
  ],
  "tool-calling": [
    "calling",
    "executing",
    "running",
    "调用",
    "执行",
    "使用工具",
    "tool",
    "function",
    "invoke",
    "@@",
  ],
  searching: [
    "searching",
    "looking",
    "finding",
    "querying",
    "搜索",
    "查找",
    "检索",
    "browse",
    "web",
    "google",
    "bing",
  ],
  writing: [
    "writing",
    "generating",
    "composing",
    "creating",
    "生成",
    "编写",
    "撰写",
    "输出",
    "drafting",
  ],
};

/**
 * 从消息内容中检测状态类型
 * @param {string} content - 消息内容
 * @returns {StatusType} 检测到的状态类型
 */
export function detectStatusType(content) {
  if (!content || typeof content !== "string") return "unknown";

  const lowerContent = content.toLowerCase();

  for (const [statusType, keywords] of Object.entries(STATUS_KEYWORDS)) {
    if (
      keywords.some((keyword) => lowerContent.includes(keyword.toLowerCase()))
    ) {
      return statusType;
    }
  }

  return "unknown";
}

/**
 * 获取状态配置
 * @param {StatusType} statusType - 状态类型
 * @returns {Object} 状态配置对象
 */
export function getStatusConfig(statusType) {
  return STATUS_CONFIG[statusType] || STATUS_CONFIG.unknown;
}

/**
 * StatusCapsule 组件
 *
 * @description 显示 Agent 当前状态的胶囊样式组件
 * 支持 4 种核心状态：thinking/tool-calling/searching/writing
 *
 * @param {Object} props
 * @param {string} props.content - 状态消息内容
 * @param {StatusType} [props.statusType] - 强制指定状态类型（可选，默认自动检测）
 * @param {boolean} [props.isActive=false] - 是否处于活动状态（显示动画）
 * @param {boolean} [props.compact=false] - 是否使用紧凑模式
 */
export default function StatusCapsule({
  content,
  statusType: forcedType,
  isActive = false,
  compact = false,
}) {
  const detectedType = useMemo(
    () => forcedType || detectStatusType(content),
    [content, forcedType]
  );

  const config = useMemo(() => getStatusConfig(detectedType), [detectedType]);
  const IconComponent = config.icon;

  return (
    <div
      className={`inline-flex items-center gap-x-1.5 px-2.5 py-1 rounded-full border ${config.bgColor} ${config.borderColor} transition-all duration-200`}
    >
      {/* 图标 */}
      <div className={`flex-shrink-0 ${config.iconColor}`}>
        {isActive ? (
          <CircleNotch size={compact ? 12 : 14} className="animate-spin" />
        ) : (
          <IconComponent size={compact ? 12 : 14} weight="duotone" />
        )}
      </div>

      {/* 标签 */}
      <span
        className={`font-medium ${config.textColor} ${compact ? "text-xs" : "text-sm"}`}
      >
        {config.label}
      </span>
    </div>
  );
}

/**
 * 导出状态类型常量，供外部使用
 */
export const STATUS_TYPES = {
  THINKING: "thinking",
  TOOL_CALLING: "tool-calling",
  SEARCHING: "searching",
  WRITING: "writing",
  UNKNOWN: "unknown",
};
