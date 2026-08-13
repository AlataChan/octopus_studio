import React, { useState, useEffect } from "react";
import {
  Clock,
  Plus,
  Trash,
  Play,
  Pause,
  Lightning,
} from "@phosphor-icons/react";
import Button from "@/components/Button";
import showToast from "@/utils/toast";
import ScheduledTaskAPI from "@/models/scheduledTask";
import CreateTaskModal from "./CreateTaskModal";

const AGENT_FLOW_RUN_ENABLED =
  import.meta.env.VITE_AGENT_FLOW_RUN_ENABLED === "true";

/**
 * 定时任务管理页面
 */
export default function ScheduledTasks({ workspace }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const fetchTasks = async () => {
    if (!workspace?.slug) return;
    setLoading(true);
    try {
      const result = await ScheduledTaskAPI.list(workspace.slug);
      // 后端返回结构: { success: true, data: { tasks, stats } }
      setTasks(result.data?.tasks || result.tasks || []);
    } catch (error) {
      console.error("获取定时任务失败:", error);
      showToast("获取定时任务失败", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, [workspace?.slug]);

  const handleToggle = async (taskId, enabled) => {
    const task = tasks.find((candidate) => candidate.id === taskId);
    if (isDisabledAgentFlowTask(task)) {
      showToast("此版本不支持 agent_flow 定时任务，无法重新启用", "error");
      return;
    }

    try {
      await ScheduledTaskAPI.update(workspace.slug, taskId, { enabled });
      showToast(enabled ? "任务已启用" : "任务已暂停", "success");
      fetchTasks();
    } catch (error) {
      showToast("操作失败", "error");
    }
  };

  const handleDelete = async (taskId) => {
    if (!confirm("确定要删除这个定时任务吗？")) return;
    try {
      await ScheduledTaskAPI.delete(workspace.slug, taskId);
      showToast("任务已删除", "success");
      fetchTasks();
    } catch (error) {
      showToast("删除失败", "error");
    }
  };

  const handleRunNow = async (taskId) => {
    const task = tasks.find((candidate) => candidate.id === taskId);
    if (isDisabledAgentFlowTask(task)) {
      showToast("此版本不支持 agent_flow 定时任务，无法执行", "error");
      return;
    }

    try {
      await ScheduledTaskAPI.runNow(workspace.slug, taskId);
      showToast("任务已触发执行", "success");
      fetchTasks();
    } catch (error) {
      showToast("执行失败", "error");
    }
  };

  const handleCreate = async (taskData) => {
    try {
      await ScheduledTaskAPI.create(workspace.slug, taskData);
      showToast("任务创建成功", "success");
      setShowCreateModal(false);
      fetchTasks();
    } catch (error) {
      showToast(error.message || "创建失败", "error");
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* 标题栏 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="h-6 w-6 text-sky-400" />
          <h2 className="text-xl font-semibold text-theme-text-primary">
            定时任务
          </h2>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="h-4 w-4" />
          创建任务
        </Button>
      </div>

      {/* 说明文字 */}
      <p className="text-white/60 text-sm">
        设置定时任务，让 AI 在指定时间自动执行操作。支持发送消息提醒
        {AGENT_FLOW_RUN_ENABLED ? "、执行 Agent Flow" : ""}。
      </p>

      {/* 任务列表 */}
      {loading ? (
        <div className="text-white/60 text-center py-8">加载中...</div>
      ) : tasks.length === 0 ? (
        <div className="text-white/60 text-center py-8 border border-dashed border-theme-border-medium rounded-lg">
          <Clock className="h-12 w-12 mx-auto mb-2 opacity-50" />
          <p>暂无定时任务</p>
          <p className="text-sm mt-1">
            点击"创建任务"或在对话中说"每天早上9点提醒我xxx"
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onToggle={handleToggle}
              onDelete={handleDelete}
              onRunNow={handleRunNow}
            />
          ))}
        </div>
      )}

      {/* 创建任务弹窗 */}
      {showCreateModal && (
        <CreateTaskModal
          workspace={workspace}
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreate}
        />
      )}
    </div>
  );
}

function isDisabledAgentFlowTask(task) {
  return task?.actionType === "agent_flow" && task.enabled === false;
}

/**
 * 任务卡片组件
 */
function TaskCard({ task, onToggle, onDelete, onRunNow }) {
  const disabledAgentFlow = isDisabledAgentFlowTask(task);
  const scheduleText =
    task.cronExpression ||
    (task.executeAt
      ? `一次性: ${new Date(task.executeAt).toLocaleString("zh-CN")}`
      : null) ||
    (task.intervalMinutes ? `每 ${task.intervalMinutes} 分钟` : "未知");

  const lastRunText = task.lastRunAt
    ? new Date(task.lastRunAt).toLocaleString("zh-CN")
    : "从未执行";

  return (
    <div
      className={`p-4 rounded-lg border ${task.enabled ? "border-sky-500/30 bg-sky-500/5" : "border-theme-border bg-white/5"}`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${task.enabled ? "bg-green-500" : "bg-gray-500"}`}
            />
            <h3 className="text-theme-text-primary font-medium">{task.name}</h3>
            {task.assistantName && (
              <span className="px-2 py-0.5 text-xs bg-purple-500/20 text-purple-300 rounded-full">
                👤 {task.assistantName}
              </span>
            )}
            {disabledAgentFlow && (
              <span className="px-2 py-0.5 text-xs bg-gray-500/20 text-gray-300 rounded-full">
                已禁用 (此版本不支持)
              </span>
            )}
          </div>
          <p className="text-white/60 text-sm mt-1">{task.description}</p>
          <div className="flex items-center gap-4 mt-2 text-xs text-white/40">
            <span>⏰ {scheduleText}</span>
            <span>📅 上次执行: {lastRunText}</span>
            <span>🔄 已执行 {task.runCount || 0} 次</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onRunNow(task.id)}
            disabled={disabledAgentFlow}
            className={`p-2 rounded ${disabledAgentFlow ? "opacity-40 cursor-not-allowed" : "hover:bg-white/10"}`}
            title={disabledAgentFlow ? "此版本不支持" : "立即执行"}
          >
            <Lightning className="h-4 w-4 text-yellow-400" />
          </button>
          <button
            onClick={() => onToggle(task.id, !task.enabled)}
            disabled={disabledAgentFlow}
            className={`p-2 rounded ${disabledAgentFlow ? "opacity-40 cursor-not-allowed" : "hover:bg-white/10"}`}
            title={
              disabledAgentFlow
                ? "此版本不支持重新启用"
                : task.enabled
                  ? "暂停"
                  : "启用"
            }
          >
            {task.enabled ? (
              <Pause className="h-4 w-4 text-orange-400" />
            ) : (
              <Play className="h-4 w-4 text-green-400" />
            )}
          </button>
          <button
            onClick={() => onDelete(task.id)}
            className="p-2 hover:bg-white/10 rounded"
            title="删除"
          >
            <Trash className="h-4 w-4 text-red-400" />
          </button>
        </div>
      </div>
    </div>
  );
}
