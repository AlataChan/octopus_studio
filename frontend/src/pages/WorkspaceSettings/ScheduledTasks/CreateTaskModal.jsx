import React, { useState, useEffect } from "react";
import { X } from "@phosphor-icons/react";
import Button from "@/components/Button";
import WorkspaceAssistant from "@/models/workspaceAssistant";

/**
 * 预设调度模板
 * 将用户友好的选项映射到 cron 表达式
 */
const SCHEDULE_PRESETS = [
  { id: "daily", label: "每天", cronTemplate: "{minute} {hour} * * *" },
  {
    id: "weekdays",
    label: "工作日（周一到周五）",
    cronTemplate: "{minute} {hour} * * 1-5",
  },
  { id: "weekend", label: "周末", cronTemplate: "{minute} {hour} * * 0,6" },
  { id: "monday", label: "每周一", cronTemplate: "{minute} {hour} * * 1" },
  { id: "tuesday", label: "每周二", cronTemplate: "{minute} {hour} * * 2" },
  { id: "wednesday", label: "每周三", cronTemplate: "{minute} {hour} * * 3" },
  { id: "thursday", label: "每周四", cronTemplate: "{minute} {hour} * * 4" },
  { id: "friday", label: "每周五", cronTemplate: "{minute} {hour} * * 5" },
  { id: "saturday", label: "每周六", cronTemplate: "{minute} {hour} * * 6" },
  { id: "sunday", label: "每周日", cronTemplate: "{minute} {hour} * * 0" },
  { id: "monthly_1", label: "每月1号", cronTemplate: "{minute} {hour} 1 * *" },
  {
    id: "monthly_15",
    label: "每月15号",
    cronTemplate: "{minute} {hour} 15 * *",
  },
];

/**
 * 间隔时间预设
 */
const INTERVAL_PRESETS = [
  { value: 5, label: "每 5 分钟" },
  { value: 10, label: "每 10 分钟" },
  { value: 15, label: "每 15 分钟" },
  { value: 30, label: "每 30 分钟" },
  { value: 60, label: "每小时" },
  { value: 120, label: "每 2 小时" },
  { value: 360, label: "每 6 小时" },
  { value: 720, label: "每 12 小时" },
];

const AGENT_FLOW_RUN_ENABLED =
  import.meta.env.VITE_AGENT_FLOW_RUN_ENABLED === "true";

const ACTION_TYPE_OPTIONS = [
  { value: "send_message", label: "发送消息提醒" },
  ...(AGENT_FLOW_RUN_ENABLED
    ? [{ value: "agent_flow", label: "Agent Flow" }]
    : []),
];

/**
 * 将预设和时间转换为 cron 表达式
 */
function buildCronExpression(presetId, hour, minute) {
  const preset = SCHEDULE_PRESETS.find((p) => p.id === presetId);
  if (!preset) return `${minute} ${hour} * * *`;
  return preset.cronTemplate
    .replace("{minute}", minute)
    .replace("{hour}", hour);
}

/**
 * 创建定时任务弹窗
 * @param {Object} props
 * @param {Function} props.onClose - 关闭弹窗回调
 * @param {Function} props.onCreate - 创建任务回调
 * @param {Object} props.workspace - 当前 Workspace 对象
 */
export default function CreateTaskModal({ onClose, onCreate, workspace }) {
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    scheduleType: "preset", // 改为预设模式作为默认
    schedulePreset: "daily", // 预设选项
    scheduleHour: "9",
    scheduleMinute: "0",
    cronExpression: "0 9 * * *", // 保留用于高级模式
    executeAt: "",
    intervalMinutes: 30,
    actionType: "send_message",
    message: "",
    assistantId: "",
  });
  const [loading, setLoading] = useState(false);
  const [assistants, setAssistants] = useState([]);
  const [loadingAssistants, setLoadingAssistants] = useState(true);

  // 加载 Workspace 的 AI 员工列表
  useEffect(() => {
    async function fetchAssistants() {
      if (!workspace?.slug) return;
      setLoadingAssistants(true);
      try {
        const result = await WorkspaceAssistant.list(workspace.slug);
        if (result.success && result.data?.assistants) {
          const enabledAssistants = result.data.assistants.filter(
            (a) => a.enabled
          );
          setAssistants(enabledAssistants);
          // 默认选择第一个助手
          if (enabledAssistants.length > 0) {
            setFormData((prev) => ({
              ...prev,
              assistantId: enabledAssistants[0].id,
            }));
          }
        }
      } catch (error) {
        console.error("获取 AI 员工列表失败:", error);
      } finally {
        setLoadingAssistants(false);
      }
    }
    fetchAssistants();
  }, [workspace?.slug]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      alert("请输入任务名称");
      return;
    }

    if (!formData.assistantId) {
      alert("请选择执行任务的 AI 员工");
      return;
    }

    // 验证一次性任务必须有执行时间
    if (formData.scheduleType === "once" && !formData.executeAt) {
      alert("请选择执行时间");
      return;
    }

    // 验证间隔任务必须有间隔时间
    if (
      formData.scheduleType === "interval" &&
      (!formData.intervalMinutes || formData.intervalMinutes < 1)
    ) {
      alert("请输入有效的间隔时间（至少1分钟）");
      return;
    }

    setLoading(true);
    try {
      const taskData = {
        name: formData.name,
        description: formData.description,
        actionType: formData.actionType,
        assistantId: formData.assistantId,
        actionConfig: {
          message: formData.message || formData.name,
        },
      };

      // 根据调度类型设置对应字段
      if (formData.scheduleType === "preset") {
        // 预设模式：将预设转换为 cron 表达式
        taskData.scheduleType = "cron";
        taskData.cronExpression = buildCronExpression(
          formData.schedulePreset,
          formData.scheduleHour,
          formData.scheduleMinute
        );
      } else if (formData.scheduleType === "cron") {
        taskData.scheduleType = "cron";
        taskData.cronExpression = formData.cronExpression;
      } else if (formData.scheduleType === "once") {
        const executeDate = new Date(formData.executeAt);
        if (isNaN(executeDate.getTime())) {
          alert("执行时间格式无效");
          setLoading(false);
          return;
        }
        taskData.scheduleType = "once";
        taskData.executeAt = executeDate.toISOString();
      } else if (formData.scheduleType === "interval") {
        taskData.scheduleType = "interval";
        taskData.intervalMinutes = parseInt(formData.intervalMinutes);
      }

      await onCreate(taskData);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-theme-bg-secondary rounded-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        {/* 标题栏 */}
        <div className="flex items-center justify-between p-4 border-b border-theme-border">
          <h3 className="text-lg font-semibold text-theme-text-primary">
            创建定时任务
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-white/10 rounded">
            <X className="h-5 w-5 text-white/60" />
          </button>
        </div>

        {/* 表单 */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* AI 员工选择 */}
          <div>
            <label className="block text-sm text-white/80 mb-1">
              执行任务的 AI 员工 *
            </label>
            {loadingAssistants ? (
              <div className="text-white/40 text-sm py-2">加载中...</div>
            ) : assistants.length === 0 ? (
              <div className="text-yellow-500 text-sm py-2">
                ⚠️ 当前 Workspace 没有可用的 AI 员工，请先去"AI 团队"页面添加
              </div>
            ) : (
              <select
                value={formData.assistantId}
                onChange={(e) =>
                  setFormData({ ...formData, assistantId: e.target.value })
                }
                className="w-full px-3 py-2 bg-theme-bg-primary border border-theme-border rounded-lg text-theme-text-primary focus:border-sky-500 focus:outline-none"
              >
                {assistants.map((assistant) => (
                  <option key={assistant.id} value={assistant.id}>
                    {assistant.instanceName ||
                      assistant.template?.name ||
                      assistant.name ||
                      "未命名员工"}
                  </option>
                ))}
              </select>
            )}
            <p className="text-xs text-white/40 mt-1">
              选择哪个 AI 员工来执行这个定时任务
            </p>
          </div>

          {/* 任务名称 */}
          <div>
            <label className="block text-sm text-white/80 mb-1">
              任务名称 *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              placeholder="如：每日日报提醒"
              className="w-full px-3 py-2 bg-theme-bg-primary border border-theme-border rounded-lg text-theme-text-primary placeholder-white/40 focus:border-sky-500 focus:outline-none"
            />
          </div>

          {/* 任务描述 */}
          <div>
            <label className="block text-sm text-white/80 mb-1">描述</label>
            <input
              type="text"
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              placeholder="任务的详细说明"
              className="w-full px-3 py-2 bg-theme-bg-primary border border-theme-border rounded-lg text-theme-text-primary placeholder-white/40 focus:border-sky-500 focus:outline-none"
            />
          </div>

          {/* 调度类型 */}
          <div>
            <label className="block text-sm text-white/80 mb-1">调度类型</label>
            <select
              value={formData.scheduleType}
              onChange={(e) =>
                setFormData({ ...formData, scheduleType: e.target.value })
              }
              className="w-full px-3 py-2 bg-theme-bg-primary border border-theme-border rounded-lg text-theme-text-primary focus:border-sky-500 focus:outline-none"
            >
              <option value="preset">⏰ 简单模式（推荐）</option>
              <option value="interval">🔄 间隔执行</option>
              <option value="once">📅 一次性任务</option>
              <option value="cron">⚙️ 高级模式（Cron）</option>
            </select>
          </div>

          {/* 动作类型 */}
          <div>
            <label className="block text-sm text-white/80 mb-1">任务动作</label>
            <select
              value={formData.actionType}
              onChange={(e) =>
                setFormData({ ...formData, actionType: e.target.value })
              }
              className="w-full px-3 py-2 bg-theme-bg-primary border border-theme-border rounded-lg text-theme-text-primary focus:border-sky-500 focus:outline-none"
            >
              {ACTION_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {/* 简单模式：预设 + 时间选择 */}
          {formData.scheduleType === "preset" && (
            <div className="space-y-3">
              {/* 频率选择 */}
              <div>
                <label className="block text-sm text-white/80 mb-1">
                  执行频率
                </label>
                <select
                  value={formData.schedulePreset}
                  onChange={(e) =>
                    setFormData({ ...formData, schedulePreset: e.target.value })
                  }
                  className="w-full px-3 py-2 bg-theme-bg-primary border border-theme-border rounded-lg text-theme-text-primary focus:border-sky-500 focus:outline-none"
                >
                  <optgroup label="常用">
                    <option value="daily">每天</option>
                    <option value="weekdays">工作日（周一到周五）</option>
                    <option value="weekend">周末</option>
                  </optgroup>
                  <optgroup label="每周">
                    <option value="monday">每周一</option>
                    <option value="tuesday">每周二</option>
                    <option value="wednesday">每周三</option>
                    <option value="thursday">每周四</option>
                    <option value="friday">每周五</option>
                    <option value="saturday">每周六</option>
                    <option value="sunday">每周日</option>
                  </optgroup>
                  <optgroup label="每月">
                    <option value="monthly_1">每月1号</option>
                    <option value="monthly_15">每月15号</option>
                  </optgroup>
                </select>
              </div>
              {/* 时间选择 */}
              <div>
                <label className="block text-sm text-white/80 mb-1">
                  执行时间
                </label>
                <div className="flex items-center gap-2">
                  <select
                    value={formData.scheduleHour}
                    onChange={(e) =>
                      setFormData({ ...formData, scheduleHour: e.target.value })
                    }
                    className="flex-1 px-3 py-2 bg-theme-bg-primary border border-theme-border rounded-lg text-theme-text-primary focus:border-sky-500 focus:outline-none"
                  >
                    {Array.from({ length: 24 }, (_, i) => (
                      <option key={i} value={i}>
                        {i.toString().padStart(2, "0")} 点
                      </option>
                    ))}
                  </select>
                  <span className="text-white/60">:</span>
                  <select
                    value={formData.scheduleMinute}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        scheduleMinute: e.target.value,
                      })
                    }
                    className="flex-1 px-3 py-2 bg-theme-bg-primary border border-theme-border rounded-lg text-theme-text-primary focus:border-sky-500 focus:outline-none"
                  >
                    {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((m) => (
                      <option key={m} value={m}>
                        {m.toString().padStart(2, "0")} 分
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {/* 预览 */}
              <div className="p-2 bg-sky-500/10 border border-sky-500/30 rounded-lg">
                <p className="text-sm text-sky-300">
                  ✨ 将在
                  {SCHEDULE_PRESETS.find(
                    (p) => p.id === formData.schedulePreset
                  )?.label || "每天"}{" "}
                  的 {formData.scheduleHour.toString().padStart(2, "0")}:
                  {formData.scheduleMinute.toString().padStart(2, "0")} 执行
                </p>
              </div>
            </div>
          )}

          {/* 间隔执行模式 */}
          {formData.scheduleType === "interval" && (
            <div>
              <label className="block text-sm text-white/80 mb-1">
                执行间隔
              </label>
              <select
                value={formData.intervalMinutes}
                onChange={(e) =>
                  setFormData({ ...formData, intervalMinutes: e.target.value })
                }
                className="w-full px-3 py-2 bg-theme-bg-primary border border-theme-border rounded-lg text-theme-text-primary focus:border-sky-500 focus:outline-none"
              >
                {INTERVAL_PRESETS.map((preset) => (
                  <option key={preset.value} value={preset.value}>
                    {preset.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-white/40 mt-1">
                任务将持续按设定间隔重复执行
              </p>
            </div>
          )}

          {/* 一次性任务 */}
          {formData.scheduleType === "once" && (
            <div>
              <label className="block text-sm text-white/80 mb-1">
                执行时间
              </label>
              <input
                type="datetime-local"
                value={formData.executeAt}
                onChange={(e) =>
                  setFormData({ ...formData, executeAt: e.target.value })
                }
                className="w-full px-3 py-2 bg-theme-bg-primary border border-theme-border rounded-lg text-theme-text-primary focus:border-sky-500 focus:outline-none"
              />
              <p className="text-xs text-white/40 mt-1">
                任务将在指定时间执行一次
              </p>
            </div>
          )}

          {/* 高级模式：Cron 表达式 */}
          {formData.scheduleType === "cron" && (
            <div>
              <label className="block text-sm text-white/80 mb-1">
                Cron 表达式
              </label>
              <input
                type="text"
                value={formData.cronExpression}
                onChange={(e) =>
                  setFormData({ ...formData, cronExpression: e.target.value })
                }
                placeholder="0 9 * * * (每天9点)"
                className="w-full px-3 py-2 bg-theme-bg-primary border border-theme-border rounded-lg text-theme-text-primary placeholder-white/40 focus:border-sky-500 focus:outline-none font-mono"
              />
              <p className="text-xs text-white/40 mt-1">
                格式: 分 时 日 月 周 | 示例:{" "}
                <code className="bg-white/10 px-1 rounded">0 9 * * 1-5</code> =
                工作日 9:00
              </p>
              {/* Cron 快捷参考 */}
              <div className="mt-2 p-2 bg-white/5 rounded text-xs text-white/50 space-y-1">
                <p>
                  <code className="bg-white/10 px-1 rounded">* * * * *</code> =
                  每分钟
                </p>
                <p>
                  <code className="bg-white/10 px-1 rounded">0 * * * *</code> =
                  每小时整点
                </p>
                <p>
                  <code className="bg-white/10 px-1 rounded">0 9 * * *</code> =
                  每天 9:00
                </p>
                <p>
                  <code className="bg-white/10 px-1 rounded">0 9 * * 1</code> =
                  每周一 9:00
                </p>
                <p>
                  <code className="bg-white/10 px-1 rounded">0 9 1 * *</code> =
                  每月1号 9:00
                </p>
              </div>
            </div>
          )}

          {/* 提醒消息 */}
          <div>
            <label className="block text-sm text-white/80 mb-1">提醒消息</label>
            <textarea
              value={formData.message}
              onChange={(e) =>
                setFormData({ ...formData, message: e.target.value })
              }
              placeholder="任务执行时发送的消息内容"
              rows={3}
              className="w-full px-3 py-2 bg-theme-bg-primary border border-theme-border rounded-lg text-theme-text-primary placeholder-white/40 focus:border-sky-500 focus:outline-none resize-none"
            />
          </div>

          {/* 按钮 */}
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" onClick={onClose} variant="muted">
              取消
            </Button>
            <Button type="submit" disabled={loading} loading={loading}>
              {loading ? "创建中..." : "创建任务"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
