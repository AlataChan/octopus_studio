import { useMemo, useState } from "react";
import { CaretDown, CaretUp } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";

import StatusIcon from "@/components/WorkspaceChat/ChatContainer/AgentTaskList/StatusIcon";
import { TaskStatus } from "@/components/WorkspaceChat/ChatContainer/AgentTaskList/TaskStatus";

function truncate(text, maxLength = 120) {
  if (!text || typeof text !== "string") return null;
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function getToolDisplayName(t, toolName) {
  if (!toolName) return null;
  const translated = t(`tool_names.${toolName}`, { defaultValue: null });
  return translated || toolName;
}

export default function AgentTaskListMessage({ taskList }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(true);
  const [expandedTaskIds, setExpandedTaskIds] = useState(() => new Set());

  const tasks = Array.isArray(taskList?.tasks) ? taskList.tasks : [];

  const stats = useMemo(() => {
    const completed = tasks.filter(
      (task) => task.status === TaskStatus.SUCCESS
    ).length;
    const running = tasks.filter(
      (task) => task.status === TaskStatus.RUNNING
    ).length;
    const failed = tasks.filter(
      (task) => task.status === TaskStatus.ERROR
    ).length;
    return { total: tasks.length, completed, running, failed };
  }, [tasks]);

  const listStatus = useMemo(() => {
    if (stats.running > 0) return TaskStatus.RUNNING;
    if (stats.failed > 0) return TaskStatus.ERROR;
    if (stats.total > 0 && stats.completed === stats.total)
      return TaskStatus.SUCCESS;
    return TaskStatus.PENDING;
  }, [stats]);

  const toggleTaskExpanded = (taskId) => {
    if (!taskId) return;
    setExpandedTaskIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  if (tasks.length === 0) return null;

  return (
    <div className="flex justify-center w-full my-2">
      <div className="w-full max-w-[80%]">
        <div className="bg-theme-bg-chat-input rounded-lg border border-theme-sidebar-border overflow-hidden shadow-sm">
          {/* Header */}
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-2 hover:bg-theme-sidebar-item-hover transition-colors"
            aria-expanded={expanded}
            aria-label={
              expanded ? t("agent_task.collapse") : t("agent_task.expand")
            }
          >
            <div className="flex items-center gap-2 min-w-0">
              <StatusIcon status={listStatus} size={16} showBackground={true} />
              <span className="text-sm font-medium text-theme-text-primary flex-shrink-0">
                {t("agent_task.task_list")}
              </span>
              <span className="text-xs text-theme-text-secondary truncate">
                {stats.completed} {t("agent_task.completed")} · {stats.total}{" "}
                {t("agent_task.task_items")}
              </span>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0 text-theme-text-secondary">
              {stats.running > 0 && (
                <span className="text-xs text-blue-400">
                  {stats.running} {t("agent_task.running")}
                </span>
              )}
              {stats.failed > 0 && (
                <span className="text-xs text-red-400">
                  {stats.failed} {t("agent_task.failed")}
                </span>
              )}
              {expanded ? <CaretUp size={14} /> : <CaretDown size={14} />}
            </div>
          </button>

          {/* Body */}
          {expanded && (
            <div className="p-3 border-t border-theme-sidebar-border">
              <div className="max-h-96 overflow-y-auto space-y-2 pr-1">
                {tasks.map((task, index) => {
                  const taskId = task.id || task.identifier || String(index);
                  const title =
                    task.displayName || task.identifier || `Step ${index + 1}`;
                  const isDone = task.status === TaskStatus.SUCCESS;
                  const isRunning = task.status === TaskStatus.RUNNING;
                  const isFailed = task.status === TaskStatus.ERROR;
                  const isTaskExpanded = expandedTaskIds.has(taskId);

                  const activeForm =
                    isRunning && task.activeForm
                      ? getToolDisplayName(t, task.activeForm) ||
                        task.activeForm
                      : null;
                  const errorSummary = isFailed ? truncate(task.error) : null;

                  return (
                    <div
                      key={taskId}
                      className="bg-theme-bg-secondary/60 rounded-lg border border-theme-sidebar-border shadow-sm"
                    >
                      <div className="p-2.5">
                        <div className="flex items-start gap-3">
                          <StatusIcon
                            status={task.status}
                            size={16}
                            showBackground={true}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <div
                                className={`text-sm ${
                                  isDone
                                    ? "text-theme-text-secondary line-through"
                                    : "text-theme-text-primary"
                                }`}
                              >
                                {title}
                              </div>

                              <button
                                type="button"
                                onClick={() => toggleTaskExpanded(taskId)}
                                className="p-1 rounded hover:bg-theme-sidebar-item-hover transition-colors text-theme-text-secondary flex-shrink-0"
                                aria-expanded={isTaskExpanded}
                                aria-label={
                                  isTaskExpanded
                                    ? t("agent_task.collapse")
                                    : t("agent_task.expand")
                                }
                              >
                                {isTaskExpanded ? (
                                  <CaretUp size={14} />
                                ) : (
                                  <CaretDown size={14} />
                                )}
                              </button>
                            </div>

                            {isTaskExpanded && (
                              <div className="mt-1 space-y-1 text-xs text-theme-text-secondary">
                                {activeForm && (
                                  <div>
                                    {t("agent_task.running")}: {activeForm}
                                  </div>
                                )}
                                {errorSummary && (
                                  <div className="text-red-400">
                                    {t("agent_task.failed")}: {errorSummary}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
