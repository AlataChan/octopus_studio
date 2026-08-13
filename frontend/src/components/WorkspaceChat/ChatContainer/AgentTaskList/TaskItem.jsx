/**
 * TaskItem - 单个任务项组件
 *
 * Phase Task List: 任务项渲染（含状态图标、标题、摘要）
 */

import { useState } from "react";
import { CaretDown, CaretUp } from "@phosphor-icons/react";
import StatusIcon, { getStatusLabel, getStatusBgColor } from "./StatusIcon";
import { TaskStatus, requiresUserAction, isTerminalStatus } from "./TaskStatus";

/**
 * 格式化持续时间
 * @param {number} durationMs - 毫秒
 * @returns {string}
 */
function formatDuration(durationMs) {
  if (!durationMs) return "";
  if (durationMs < 1000) return `${durationMs}ms`;
  return `${(durationMs / 1000).toFixed(1)}s`;
}

/**
 * 单个任务项组件
 * @param {Object} props
 * @param {Object} props.task - 任务数据
 * @param {Function} props.onConfirm - 确认回调（HITL 场景）
 * @param {Function} props.onRetry - 重试回调
 * @param {boolean} props.compact - 紧凑模式
 */
export default function TaskItem({
  task,
  onConfirm,
  onRetry,
  compact = false,
}) {
  const [expanded, setExpanded] = useState(false);

  const {
    id,
    executionId,
    displayName,
    toolName,
    purpose,
    status,
    result,
    error,
    durationMs,
    context,
    retryCount,
    maxRetries,
  } = task;

  // 任务标题：优先使用 displayName，fallback 到 toolName 或 purpose
  const title = displayName || toolName || purpose || "未知任务";

  // 是否需要用户操作
  const needsAction = requiresUserAction(status);

  // 是否为终态
  const isTerminal = isTerminalStatus(status);

  // 是否有可展开的详情
  const hasDetails = result || error || context?.message;

  // 摘要文本（仅对关键任务显示）
  const getSummary = () => {
    if (status === TaskStatus.ERROR && error) {
      return error.length > 100 ? error.substring(0, 100) + "..." : error;
    }
    if (status === TaskStatus.DEGRADED && context?.degradeReason) {
      return context.degradeReason;
    }
    if (status === TaskStatus.AWAITING_CONFIRMATION && context?.message) {
      return context.message;
    }
    if (status === TaskStatus.RETRYING && retryCount != null) {
      return `重试中 (${retryCount}/${maxRetries || 2})`;
    }
    return null;
  };

  const summary = getSummary();

  return (
    <div
      className={`
        rounded-lg border transition-all duration-200
        ${needsAction ? "border-yellow-400 bg-yellow-50/50" : "border-theme-border"}
        ${compact ? "p-2" : "p-3"}
        ${!isTerminal && status === TaskStatus.RUNNING ? "shadow-sm" : ""}
      `}
      role="listitem"
      aria-label={`${title}: ${getStatusLabel(status)}`}
    >
      {/* 主行：状态图标 + 标题 + 时长 */}
      <div className="flex items-center gap-2">
        <StatusIcon status={status} size={compact ? 16 : 18} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`
                font-medium truncate
                ${compact ? "text-xs" : "text-sm"}
                ${isTerminal && status !== TaskStatus.SUCCESS ? "text-theme-text-secondary" : "text-theme-text-primary"}
              `}
              title={title}
            >
              {title}
            </span>

            {/* 状态标签（仅在特殊状态时显示） */}
            {(status === TaskStatus.RETRYING ||
              status === TaskStatus.DEGRADED) && (
              <span
                className={`
                  px-1.5 py-0.5 rounded text-xs font-medium
                  ${getStatusBgColor(status)}
                  ${status === TaskStatus.RETRYING ? "text-orange-500" : "text-amber-500"}
                `}
              >
                {status === TaskStatus.RETRYING
                  ? `重试 ${retryCount || 1}/${maxRetries || 2}`
                  : "已降级"}
              </span>
            )}
          </div>

          {/* 摘要（仅关键任务显示） */}
          {summary && (
            <p
              className={`
                mt-0.5 text-xs text-theme-text-secondary truncate
                ${status === TaskStatus.ERROR ? "text-red-500" : ""}
              `}
              title={summary}
            >
              {summary}
            </p>
          )}
        </div>

        {/* 右侧：时长 + 展开按钮 */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {durationMs && isTerminal && (
            <span className="text-xs text-theme-text-secondary">
              {formatDuration(durationMs)}
            </span>
          )}

          {hasDetails && !compact && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="p-1 rounded hover:bg-theme-bg-primary transition-colors"
              aria-label={expanded ? "收起详情" : "展开详情"}
              aria-expanded={expanded}
            >
              {expanded ? (
                <CaretUp size={14} className="text-gray-400" />
              ) : (
                <CaretDown size={14} className="text-gray-400" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* 展开的详情区域 */}
      {expanded && hasDetails && (
        <div className="mt-2 pt-2 border-t border-theme-border">
          {error && (
            <div className="text-xs text-red-500 bg-red-50/50 rounded p-2 mb-2">
              <strong>错误：</strong>
              <pre className="mt-1 whitespace-pre-wrap font-mono">{error}</pre>
            </div>
          )}

          {result && !error && (
            <div className="text-xs text-theme-text-primary bg-theme-bg-secondary rounded p-2">
              <strong>结果：</strong>
              <pre className="mt-1 whitespace-pre-wrap font-mono overflow-x-auto">
                {typeof result === "string"
                  ? result
                  : JSON.stringify(result, null, 2)}
              </pre>
            </div>
          )}

          {context?.message && !error && !result && (
            <p className="text-xs text-theme-text-primary">{context.message}</p>
          )}
        </div>
      )}

      {/* HITL 操作按钮（等待确认状态） */}
      {needsAction && onConfirm && (
        <div className="mt-3 pt-2 border-t border-yellow-200 flex gap-2">
          <button
            onClick={() => onConfirm(task, "confirm")}
            className="px-3 py-1.5 text-xs font-medium text-theme-text-primary bg-primary-button hover:bg-primary-button-hover rounded transition-colors"
          >
            确认
          </button>
          <button
            onClick={() => onConfirm(task, "modify")}
            className="px-3 py-1.5 text-xs font-medium text-theme-text-primary bg-theme-bg-secondary hover:bg-theme-bg-primary rounded transition-colors"
          >
            修改
          </button>
        </div>
      )}

      {/* 错误状态重试按钮 */}
      {status === TaskStatus.ERROR && onRetry && (
        <div className="mt-2 pt-2 border-t border-red-200">
          <button
            onClick={() => onRetry(task)}
            className="px-3 py-1 text-xs font-medium text-red-500 hover:bg-red-50/50 rounded transition-colors"
          >
            重试
          </button>
        </div>
      )}
    </div>
  );
}
