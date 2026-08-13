/**
 * AgentTaskList - Agent 任务列表组件（紧凑模式）
 *
 * Phase Task List: 主组件
 * - 默认紧凑模式：一行显示进度和当前任务
 * - 点击展开查看完整任务列表
 * - 支持工具名称国际化
 */

import { useState, useMemo } from "react";
import {
  CircleNotch,
  CheckCircle,
  XCircle,
  CaretDown,
  CaretUp,
  Clock,
} from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { TaskStatus, mapToolStageToTaskStatus } from "./TaskStatus";

/**
 * 格式化持续时间
 */
function formatDuration(ms) {
  if (!ms) return "";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * 获取工具的国际化显示名称
 * @param {Function} t - i18n 翻译函数
 * @param {string} toolName - 工具原始名称
 * @returns {string} 显示名称
 */
function getToolDisplayName(t, toolName) {
  if (!toolName) return t("tool_names.unknown", "未知工具");
  // 尝试获取翻译，如果没有则返回原始名称
  const translated = t(`tool_names.${toolName}`, { defaultValue: null });
  return translated || toolName;
}

/**
 * Agent 任务列表组件（紧凑模式）
 */
export default function AgentTaskList({
  tasks: externalTasks = [],
  toolExecutions = [],
  planningData = null,
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  // 合并外部任务和工具执行数据
  const tasks = useMemo(() => {
    const toolTasks = toolExecutions.map((exec) => ({
      id: exec.executionId || `tool-${exec.toolName}-${exec.timestamp}`,
      executionId: exec.executionId,
      toolName: exec.toolName,
      status: mapToolStageToTaskStatus(exec.stage),
      durationMs: exec.durationMs,
      timestamp: exec.startTimestamp || exec.timestamp,
    }));

    // 使用 executionId 去重，保留最新状态
    const taskMap = new Map();
    for (const task of [...externalTasks, ...toolTasks]) {
      const key = task.executionId || task.id;
      taskMap.set(key, task);
    }

    return Array.from(taskMap.values());
  }, [externalTasks, toolExecutions]);

  // 统计
  const stats = useMemo(() => {
    const completed = tasks.filter(
      (t) => t.status === TaskStatus.SUCCESS
    ).length;
    const failed = tasks.filter(
      (t) => t.status === TaskStatus.ERROR || t.status === TaskStatus.TIMEOUT
    ).length;
    const running = tasks.filter(
      (t) => t.status === TaskStatus.RUNNING || t.status === TaskStatus.RETRYING
    ).length;
    return { total: tasks.length, completed, failed, running };
  }, [tasks]);

  // 当前正在执行的任务
  const currentTask = useMemo(() => {
    return tasks.find(
      (t) => t.status === TaskStatus.RUNNING || t.status === TaskStatus.RETRYING
    );
  }, [tasks]);

  // 计算总耗时
  const totalDuration = useMemo(() => {
    return tasks.reduce((sum, t) => sum + (t.durationMs || 0), 0);
  }, [tasks]);

  // 没有任务时不显示
  if (tasks.length === 0) return null;

  const isAllComplete = stats.running === 0;
  const hasError = stats.failed > 0;

  return (
    <div className="bg-theme-bg-secondary/80 border border-theme-sidebar-border rounded-lg overflow-hidden">
      {/* 紧凑头部 - 始终显示 */}
      <div
        className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-white/5 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {/* 状态图标 */}
          {stats.running > 0 ? (
            <CircleNotch
              size={16}
              className="text-blue-400 animate-spin flex-shrink-0"
            />
          ) : hasError ? (
            <XCircle size={16} className="text-red-400 flex-shrink-0" />
          ) : (
            <CheckCircle size={16} className="text-green-400 flex-shrink-0" />
          )}

          {/* 进度 */}
          <span className="text-xs font-medium text-white/80">
            {stats.completed}/{stats.total}
          </span>

          {/* 分隔符 */}
          <span className="text-white/20">|</span>

          {/* 当前任务或完成状态 */}
          {currentTask ? (
            <span className="text-xs text-blue-400 truncate">
              {getToolDisplayName(t, currentTask.toolName)}
            </span>
          ) : isAllComplete ? (
            <span className="text-xs text-green-400">
              {t("agent_task.completed", "已完成")}
            </span>
          ) : (
            <span className="text-xs text-white/50">
              {t("agent_task.waiting", "等待中")}
            </span>
          )}

          {/* 耗时（完成后显示） */}
          {isAllComplete && totalDuration > 0 && (
            <>
              <span className="text-white/20">|</span>
              <span className="text-xs text-white/40 flex items-center gap-1">
                <Clock size={12} />
                {formatDuration(totalDuration)}
              </span>
            </>
          )}
        </div>

        {/* 展开/收起按钮 */}
        <button className="text-white/40 hover:text-white/60 p-1">
          {expanded ? <CaretUp size={14} /> : <CaretDown size={14} />}
        </button>
      </div>

      {/* 展开的任务列表 */}
      {expanded && (
        <div className="px-3 pb-2 border-t border-white/5 space-y-1 mt-1">
          {tasks.map((task) => (
            <div
              key={task.id || task.executionId}
              className="flex items-center gap-2 text-xs py-1"
            >
              {/* 状态图标 */}
              {task.status === TaskStatus.RUNNING ||
              task.status === TaskStatus.RETRYING ? (
                <CircleNotch
                  size={12}
                  className="text-blue-400 animate-spin flex-shrink-0"
                />
              ) : task.status === TaskStatus.SUCCESS ? (
                <CheckCircle
                  size={12}
                  className="text-green-400 flex-shrink-0"
                />
              ) : task.status === TaskStatus.ERROR ||
                task.status === TaskStatus.TIMEOUT ? (
                <XCircle size={12} className="text-red-400 flex-shrink-0" />
              ) : (
                <div className="w-3 h-3 rounded-full border border-theme-border-medium flex-shrink-0" />
              )}

              {/* 任务名（国际化） */}
              <span
                className={`truncate ${task.status === TaskStatus.SUCCESS ? "text-white/50" : "text-white/70"}`}
              >
                {getToolDisplayName(t, task.toolName)}
              </span>

              {/* 耗时 */}
              {task.durationMs && (
                <span className="text-white/30 ml-auto flex-shrink-0">
                  {formatDuration(task.durationMs)}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
