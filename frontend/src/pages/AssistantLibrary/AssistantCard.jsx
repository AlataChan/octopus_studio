import React from "react";
import { Sparkle, Briefcase, User } from "@phosphor-icons/react";
import AssistantLibrary from "@/models/assistantLibrary";

const DEFAULT_ICON_COLOR = "#3B82F6";

function buildEmojiAvatarStyle(color) {
  const normalized = typeof color === "string" ? color.trim() : "";
  const hasHexColor = /^#[0-9a-fA-F]{6}$/.test(normalized);

  return {
    backgroundColor: hasHexColor ? `${normalized}20` : undefined,
    borderColor: normalized || DEFAULT_ICON_COLOR,
  };
}

/**
 * AI 员工卡片组件
 * 显示 AI 员工的头像、姓名、职位、技能等信息
 * @param {Object} assistant - AI 员工模板数据
 * @param {Function} onClick - 点击事件处理函数
 * @param {boolean} isHired - P1: 是否已在当前 Workspace 雇佣
 */
export default function AssistantCard({ assistant, onClick, isHired = false }) {
  const {
    avatarUrl,
    icon,
    color,
    vibe,
    employeeName,
    employeeTitle,
    employeeBio,
    category,
    skills,
    certifications,
    platformType,
  } = assistant;

  // 获取完整的头像 URL
  const fullAvatarUrl = AssistantLibrary.getIconUrl(avatarUrl);

  // 解析 JSON 字段（后端已经解析过了，直接使用或提供默认值）
  const skillsList = Array.isArray(skills)
    ? skills
    : skills
      ? JSON.parse(skills)
      : [];
  const certsData = Array.isArray(certifications)
    ? certifications
    : certifications
      ? JSON.parse(certifications)
      : [];

  // 处理认证数据：支持字符串数组和对象数组两种格式
  // 字符串数组格式：["CMO 高级营销官认证", "品牌战略专家"]
  // 对象数组格式：[{ name: "数据科学专家认证", count: 2 }]
  const certsList = certsData.map((cert) =>
    typeof cert === "string" ? cert : cert.name
  );
  const summaryTags = [...skillsList, ...certsList].filter(Boolean);
  const visibleSummaryTags = summaryTags.slice(0, 1);
  const remainingSummaryCount = Math.max(summaryTags.length - 1, 0);

  // 平台类型标识
  const getPlatformBadge = () => {
    if (!platformType || platformType === "internal") return null;

    const platformLabels = {
      dify: "Dify",
      ragflow: "RAGFlow",
      n8n: "n8n",
      coze: "Coze",
      fastgpt: "FastGPT",
    };

    return (
      <div className="absolute right-2.5 top-2.5 rounded-md bg-theme-accent-primary/20 px-1.5 py-0.5 text-[11px] font-semibold text-theme-accent-primary">
        {platformLabels[platformType] || platformType}
      </div>
    );
  };

  return (
    <button
      onClick={() => onClick(assistant)}
      className={`group relative flex h-full flex-col rounded-xl border-2 bg-theme-bg-secondary p-3 text-left transition-all duration-300 hover:bg-theme-bg-container ${
        isHired
          ? "border-green-500/50 hover:border-green-500"
          : "border-theme-sidebar-border hover:border-theme-accent-primary"
      }`}
    >
      {/* P1: 已在本部门标记 - 简化为绿色圆点 + tooltip */}
      {isHired && (
        <div
          className="absolute left-2.5 top-2.5 h-2.5 w-2.5 rounded-full bg-green-500 shadow-lg shadow-green-500/50"
          title="已在本部门"
        />
      )}

      {/* 平台类型标识 */}
      {getPlatformBadge()}

      {/* 头像和基本信息 */}
      <div className="mb-2.5 flex items-start gap-2.5">
        {/* 头像 */}
        <div className="flex-shrink-0">
          {fullAvatarUrl ? (
            <img
              src={fullAvatarUrl}
              alt={assistant.name || employeeName || "Assistant"}
              className="w-10 h-10 rounded-full border-2 border-theme-accent-primary object-cover"
            />
          ) : icon ? (
            <div
              className="flex w-10 h-10 items-center justify-center rounded-full border-2 text-xl"
              style={buildEmojiAvatarStyle(color)}
              aria-label={`${assistant.name || employeeName || "Assistant"} avatar`}
            >
              {icon || "🤖"}
            </div>
          ) : (
            <div className="flex w-10 h-10 items-center justify-center rounded-full border-2 border-theme-accent-primary bg-theme-accent-primary/20">
              <User
                size={20}
                weight="fill"
                className="text-theme-accent-primary"
              />
            </div>
          )}
        </div>

        {/* 姓名和职位 - 使用统一的 EmployeeIdentity 组件 */}
        <div className="flex-1 min-w-0">
          <h3 className="truncate text-base font-bold text-theme-text-primary transition-colors group-hover:text-theme-accent-primary">
            {assistant.name || employeeName}
          </h3>
          {employeeTitle && (
            <div className="mt-0.5 truncate text-[13px] font-medium text-theme-accent-primary">
              {employeeTitle}
            </div>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-theme-text-secondary">
            {employeeName &&
              assistant.name &&
              employeeName !== assistant.name && <span>{employeeName}</span>}
            {category && (
              <span className="inline-flex items-center gap-1.5">
                <Briefcase size={11} />
                <span>{category}</span>
              </span>
            )}
          </div>
        </div>
      </div>

      {vibe && (
        <p className="mb-1.5 line-clamp-1 text-[12px] italic leading-4 text-theme-text-secondary">
          {vibe}
        </p>
      )}

      {/* 简介 */}
      <p className="mb-2.5 line-clamp-2 text-[13px] leading-5 text-theme-text-secondary">
        {employeeBio}
      </p>

      {/* 紧凑摘要标签 */}
      {summaryTags.length > 0 && (
        <div className="mt-auto flex items-center gap-1.5 overflow-hidden">
          {visibleSummaryTags.map((tag, index) => (
            <span
              key={index}
              className="truncate rounded-md bg-theme-accent-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-theme-accent-primary"
            >
              {tag}
            </span>
          ))}
          {remainingSummaryCount > 0 && (
            <span className="shrink-0 px-1 py-0.5 text-[11px] text-theme-text-secondary">
              +{remainingSummaryCount}
            </span>
          )}
        </div>
      )}

      {/* 悬停效果 - 查看详情提示 */}
      <div className="absolute inset-0 flex items-center justify-center bg-theme-accent-primary/5 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
        <div className="flex items-center gap-1.5 text-sm font-medium text-theme-accent-primary">
          <Sparkle size={18} weight="fill" />
          <span>查看员工档案</span>
        </div>
      </div>
    </button>
  );
}

/**
 * AI 员工卡片骨架屏组件
 * 用于加载状态
 */
export function AssistantCardSkeleton() {
  return (
    <div className="flex h-full flex-col rounded-xl border-2 border-theme-sidebar-border bg-theme-bg-secondary p-3 animate-pulse">
      {/* 头像和基本信息骨架 */}
      <div className="mb-2.5 flex items-start gap-2.5">
        {/* 头像骨架 */}
        <div className="h-10 w-10 flex-shrink-0 rounded-full bg-theme-bg-container"></div>

        {/* 姓名和职位骨架 */}
        <div className="flex-1 min-w-0">
          <div className="mb-1.5 h-4 w-2/3 rounded bg-theme-bg-container"></div>
          <div className="mb-1 h-3.5 w-1/2 rounded bg-theme-bg-container"></div>
          <div className="h-3 w-1/3 rounded bg-theme-bg-container"></div>
        </div>
      </div>

      {/* 简介骨架 */}
      <div className="mb-2.5 flex-grow space-y-1.5">
        <div className="h-3 w-full rounded bg-theme-bg-container"></div>
        <div className="h-3 w-5/6 rounded bg-theme-bg-container"></div>
      </div>

      {/* 技能标签骨架 */}
      <div className="mt-auto flex items-center gap-1.5">
        <div className="h-5 w-24 rounded-md bg-theme-bg-container"></div>
        <div className="h-4 w-8 rounded bg-theme-bg-container"></div>
      </div>
    </div>
  );
}
