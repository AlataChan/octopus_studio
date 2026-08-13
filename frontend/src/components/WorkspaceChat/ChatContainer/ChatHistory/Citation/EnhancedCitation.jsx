/**
 * EnhancedCitation - 增强型知识来源引用组件
 *
 * Phase E: 知识来源富文本展示
 * - 富文本预览
 * - 相似度评分可视化
 * - 一键跳转到原文档
 * - 区分不同知识来源类型
 */

import { useState } from "react";
import {
  File,
  Graph,
  Globe,
  ArrowSquareOut,
  CaretDown,
  CaretUp,
  Lightning,
  Database,
  Info,
} from "@phosphor-icons/react";
import { decode as HTMLDecode } from "he";

/**
 * 获取来源类型图标
 */
function getSourceIcon(type) {
  switch (type) {
    case "vector":
      return <File size={18} className="text-blue-500" />;
    case "graph":
      return <Graph size={18} className="text-purple-500" />;
    case "web":
      return <Globe size={18} className="text-green-500" />;
    case "memory":
      return <Lightning size={18} className="text-yellow-500" />;
    case "database":
      return <Database size={18} className="text-cyan-500" />;
    default:
      return <File size={18} className="text-gray-500" />;
  }
}

/**
 * 获取相似度评分颜色
 */
function getScoreColor(score) {
  if (score >= 0.8)
    return {
      text: "text-green-500",
      bg: "bg-green-500/10",
      bar: "bg-green-500",
    };
  if (score >= 0.6)
    return {
      text: "text-yellow-500",
      bg: "bg-yellow-500/10",
      bar: "bg-yellow-500",
    };
  return {
    text: "text-theme-text-secondary",
    bg: "bg-theme-bg-secondary",
    bar: "bg-theme-border",
  };
}

/**
 * 获取来源类型标签
 */
function getSourceLabel(type, metadata = {}) {
  switch (type) {
    case "vector":
      return "知识库文档";
    case "graph":
      return `图谱节点 • ${metadata.nodeCount || 0} 个关系`;
    case "web":
      return "网络来源";
    case "memory":
      return "记忆片段";
    case "database":
      return "数据库记录";
    default:
      return "文档来源";
  }
}

/**
 * 清理文本中的元数据头部
 */
function cleanText(text) {
  if (!text) return "";
  if (!text.includes("<document_metadata>")) return text;
  return text.split("</document_metadata>")[1]?.trim() || text;
}

/**
 * 截断文本
 */
function truncateText(text, maxLength = 150) {
  if (!text || text.length <= maxLength) return text;
  return text.slice(0, maxLength) + "...";
}

/**
 * 增强型引用卡片
 */
export default function EnhancedCitation({ source }) {
  const [expanded, setExpanded] = useState(false);

  const {
    title = "未命名来源",
    text = "",
    score = null,
    type = "vector",
    chunkSource = null,
    metadata = {},
  } = source;

  const cleanedText = cleanText(text);
  const previewText = truncateText(cleanedText);
  const hasMoreContent = cleanedText.length > 150;
  const scoreStyle = score ? getScoreColor(score) : null;

  // 解析可跳转链接
  const jumpUrl = chunkSource?.startsWith("link://")
    ? chunkSource.replace("link://", "")
    : chunkSource?.startsWith("http")
      ? chunkSource
      : null;

  return (
    <div className="border border-theme-border rounded-lg p-4 hover:shadow-md transition-shadow bg-theme-bg-secondary">
      {/* 头部 */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {getSourceIcon(type)}
          <span className="font-semibold text-sm text-theme-text-primary truncate">
            {title}
          </span>
        </div>

        {/* 相似度评分 */}
        {score !== null && (
          <div
            className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${scoreStyle.bg} ${scoreStyle.text}`}
          >
            <span>相似度</span>
            <span className="font-bold">{(score * 100).toFixed(0)}%</span>
          </div>
        )}
      </div>

      {/* 相似度进度条 */}
      {score !== null && (
        <div className="h-1 bg-theme-border rounded-full overflow-hidden mb-3">
          <div
            className={`h-full ${scoreStyle.bar} transition-all duration-300`}
            style={{ width: `${score * 100}%` }}
          />
        </div>
      )}

      {/* 预览文本 */}
      <div className="mb-3">
        <p className="text-sm text-theme-text-secondary leading-relaxed">
          {expanded ? HTMLDecode(cleanedText) : HTMLDecode(previewText)}
        </p>

        {hasMoreContent && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="mt-2 flex items-center gap-1 text-xs text-blue-500 hover:underline"
          >
            {expanded ? (
              <>
                <CaretUp size={12} />
                收起
              </>
            ) : (
              <>
                <CaretDown size={12} />
                展开全文
              </>
            )}
          </button>
        )}
      </div>

      {/* 元数据和操作 */}
      <div className="flex items-center justify-between text-xs text-theme-text-secondary pt-2 border-t border-theme-border">
        <div className="flex items-center gap-1">
          <Info size={12} />
          <span>{getSourceLabel(type, metadata)}</span>
        </div>

        {/* 跳转链接 */}
        {jumpUrl && (
          <a
            href={jumpUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-blue-500 hover:underline"
          >
            查看原文
            <ArrowSquareOut size={14} />
          </a>
        )}
      </div>

      {/* 图谱关系预览（如果是图谱类型） */}
      {type === "graph" && metadata.relations && (
        <div className="mt-3 pt-3 border-t border-theme-border">
          <div className="text-xs font-medium text-purple-500 mb-2">
            相关实体
          </div>
          <div className="flex flex-wrap gap-1">
            {metadata.relations.slice(0, 5).map((relation, idx) => (
              <span
                key={idx}
                className="px-2 py-0.5 bg-purple-500/10 text-purple-500 rounded text-xs"
              >
                {relation.target || relation}
              </span>
            ))}
            {metadata.relations.length > 5 && (
              <span className="text-xs text-gray-400">
                +{metadata.relations.length - 5} 更多
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
