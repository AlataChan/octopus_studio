import React, { useState } from "react";
import {
  CaretDown,
  CaretUp,
  FileText,
  Lightning,
  Clock,
  ChatCircleDots,
} from "@phosphor-icons/react";

/**
 * 对话摘要组件
 *
 * Phase K: 增量摘要策略 - 前端显示
 *
 * 显示对话历史的智能摘要：
 * - 折叠/展开摘要内容
 * - 显示压缩比例和统计信息
 * - 高亮关键信息（决策、偏好、结论）
 */
export default function ConversationSummary({ summaryData }) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!summaryData?.summary) return null;

  const { summary, compressionRatio } = summaryData;
  const {
    content,
    messageCount,
    tokenCount,
    originalTokenCount,
    keyInfo,
    isIncremental,
    createdAt,
  } = summary;

  const compressionPercent = ((1 - compressionRatio) * 100).toFixed(0);

  return (
    <div className="bg-zinc-800/60 border border-theme-modal-border rounded-lg mb-4 overflow-hidden">
      {/* 摘要头部 - 可点击展开/折叠 */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-zinc-700/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="p-1.5 bg-blue-500/20 rounded-lg">
            <FileText className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-left">
            <h4 className="text-sm font-medium text-theme-text-primary flex items-center gap-2">
              对话摘要
              {isIncremental && (
                <span className="text-xs px-1.5 py-0.5 bg-green-500/20 text-green-400 rounded">
                  增量更新
                </span>
              )}
            </h4>
            <p className="text-xs text-theme-text-secondary">
              {messageCount} 条消息已压缩 {compressionPercent}%
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* 统计信息 */}
          <div className="hidden sm:flex items-center gap-4 text-xs text-zinc-500">
            <span className="flex items-center gap-1">
              <ChatCircleDots className="w-3.5 h-3.5" />
              {messageCount} 消息
            </span>
            <span className="flex items-center gap-1">
              <Lightning className="w-3.5 h-3.5" />
              {tokenCount} / {originalTokenCount} tokens
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              {new Date(createdAt).toLocaleTimeString("zh-CN", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>

          {/* 展开/折叠图标 */}
          {isExpanded ? (
            <CaretUp className="w-5 h-5 text-theme-text-secondary" />
          ) : (
            <CaretDown className="w-5 h-5 text-theme-text-secondary" />
          )}
        </div>
      </button>

      {/* 摘要内容 */}
      {isExpanded && (
        <div className="px-4 pb-4 space-y-4">
          {/* 摘要正文 */}
          <div className="bg-zinc-900/50 rounded-lg p-3 max-h-64 overflow-y-auto">
            <pre className="text-sm text-theme-text-secondary whitespace-pre-wrap font-sans">
              {content}
            </pre>
          </div>

          {/* 关键信息高亮 */}
          {keyInfo && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* 重要决策 */}
              {keyInfo.decisions?.length > 0 && (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
                  <h5 className="text-xs font-medium text-amber-400 mb-2 flex items-center gap-1">
                    <Lightning className="w-3.5 h-3.5" />
                    重要决策 ({keyInfo.decisions.length})
                  </h5>
                  <ul className="space-y-1">
                    {keyInfo.decisions.slice(0, 3).map((decision, idx) => (
                      <li
                        key={idx}
                        className="text-xs text-amber-200/80 truncate"
                        title={decision.snippet}
                      >
                        • {decision.snippet}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 用户偏好 */}
              {keyInfo.userPreferences?.length > 0 && (
                <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-3">
                  <h5 className="text-xs font-medium text-purple-400 mb-2 flex items-center gap-1">
                    <ChatCircleDots className="w-3.5 h-3.5" />
                    用户偏好 ({keyInfo.userPreferences.length})
                  </h5>
                  <ul className="space-y-1">
                    {keyInfo.userPreferences.slice(0, 3).map((pref, idx) => (
                      <li
                        key={idx}
                        className="text-xs text-purple-200/80 truncate"
                        title={pref}
                      >
                        • {pref}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 主题关键词 */}
              {keyInfo.topics?.length > 0 && (
                <div className="sm:col-span-2 bg-zinc-700/30 rounded-lg p-3">
                  <h5 className="text-xs font-medium text-theme-text-secondary mb-2">
                    主题关键词
                  </h5>
                  <div className="flex flex-wrap gap-2">
                    {keyInfo.topics.map((topic, idx) => (
                      <span
                        key={idx}
                        className="text-xs px-2 py-1 bg-zinc-600/50 text-theme-text-secondary rounded"
                      >
                        {topic}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
