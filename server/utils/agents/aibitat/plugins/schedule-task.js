/**
 * @fileoverview 定时任务 Agent Skill
 * 让 AI 能在对话中创建、查看、删除定时任务
 */

const { ScheduledTask } = require("../../../../models/scheduledTask");
const { userScheduler } = require("../../../scheduler/userTaskScheduler");
const {
  parseNaturalLanguageSchedule,
} = require("../../../scheduler/scheduleParser");

const scheduleTaskPlugin = {
  name: "schedule-task",
  startupConfig: {
    params: {},
  },
  plugin: function () {
    return {
      name: this.name,
      setup(aibitat) {
        // 创建定时任务
        aibitat.function({
          super: aibitat,
          name: this.name,
          tracker: aibitat.handlerProps.invocation,
          description: `创建定时任务或提醒。支持以下格式：
- "每天早上9点" -> 每天 9:00 执行
- "每周一下午3点" -> 每周一 15:00 执行
- "每30分钟" -> 每 30 分钟执行一次
- "3小时后" -> 3 小时后执行一次
用于设置定期提醒、自动执行流程等。`,
          parameters: {
            $schema: "http://json-schema.org/draft-07/schema#",
            type: "object",
            properties: {
              action: {
                type: "string",
                enum: ["create", "list", "delete", "enable", "disable"],
                description:
                  "操作类型：create=创建, list=列出, delete=删除, enable=启用, disable=禁用",
              },
              name: {
                type: "string",
                description: "任务名称（创建时必填）",
              },
              schedule: {
                type: "string",
                description:
                  "调度时间描述，如'每天早上9点'、'每周一'、'3小时后'（创建时必填）",
              },
              message: {
                type: "string",
                description: "提醒消息内容（创建消息类任务时必填）",
              },
              taskId: {
                type: "string",
                description: "任务 ID（删除/启用/禁用时必填）",
              },
            },
            required: ["action"],
          },
          handler: async function ({
            action,
            name,
            schedule,
            message,
            taskId,
          }) {
            try {
              const workspaceId = this.tracker?.workspace?.id;
              const userId = this.tracker?.user?.id;

              if (!workspaceId) {
                return "无法确定当前 Workspace，请重试";
              }

              switch (action) {
                case "create":
                  return await handleCreate({
                    name,
                    schedule,
                    message,
                    workspaceId,
                    userId,
                  });
                case "list":
                  return await handleList(workspaceId);
                case "delete":
                  return await handleDelete(taskId);
                case "enable":
                  return await handleToggle(taskId, true);
                case "disable":
                  return await handleToggle(taskId, false);
                default:
                  return `未知操作: ${action}`;
              }
            } catch (error) {
              console.error("[ScheduleTask] 执行失败:", error);
              return `操作失败: ${error.message}`;
            }
          },
        });
      },
    };
  },
};

/**
 * 处理创建任务
 */
async function handleCreate({ name, schedule, message, workspaceId, userId }) {
  if (!name || !schedule) {
    return "创建任务需要提供 name（任务名称）和 schedule（调度时间）";
  }

  // 解析自然语言时间
  const scheduleConfig = parseNaturalLanguageSchedule(schedule);
  if (!scheduleConfig) {
    return `无法解析调度时间: "${schedule}"，请使用如"每天早上9点"、"每周一下午3点"、"30分钟后"等格式`;
  }

  // 检查任务数量限制
  const stats = await ScheduledTask.countByWorkspace(workspaceId);
  if (stats.total >= 50) {
    return "已达到任务数量上限（50个），请删除一些不需要的任务后再试";
  }

  // 创建任务
  const task = await ScheduledTask.create({
    workspaceId,
    createdByUserId: userId,
    name,
    description: message || `由 AI 创建的定时任务`,
    scheduleType: scheduleConfig.type,
    cronExpression: scheduleConfig.cronExpression,
    executeAt: scheduleConfig.executeAt,
    intervalMinutes: scheduleConfig.intervalMinutes,
    timezone: "Asia/Shanghai",
    actionType: "send_message",
    actionConfig: { message: message || name },
  });

  // 注册到调度器
  userScheduler.registerTask(task);

  const scheduleDesc = formatScheduleDescription(scheduleConfig);
  return `✅ 定时任务已创建！
📋 任务名称: ${task.name}
⏰ 执行时间: ${scheduleDesc}
📝 提醒内容: ${message || name}
🆔 任务ID: ${task.id}

您可以说"查看我的定时任务"来管理所有任务。`;
}

/**
 * 处理列出任务
 */
async function handleList(workspaceId) {
  const tasks = await ScheduledTask.getByWorkspace(workspaceId, { limit: 20 });

  if (tasks.length === 0) {
    return '当前没有定时任务。您可以说"每天早上9点提醒我xxx"来创建一个。';
  }

  const taskList = tasks
    .map((t, i) => {
      const status = t.enabled ? "✅" : "⏸️";
      const lastRun = t.lastRunAt
        ? new Date(t.lastRunAt).toLocaleString("zh-CN")
        : "未执行";
      return `${i + 1}. ${status} ${t.name}\n   调度: ${t.cronExpression || t.executeAt || `每${t.intervalMinutes}分钟`}\n   上次执行: ${lastRun}\n   ID: ${t.id}`;
    })
    .join("\n\n");

  return `📋 定时任务列表（共 ${tasks.length} 个）\n\n${taskList}`;
}

/**
 * 处理删除任务
 */
async function handleDelete(taskId) {
  if (!taskId) {
    return "请提供要删除的任务 ID";
  }

  const task = await ScheduledTask.get(taskId);
  if (!task) {
    return `找不到任务: ${taskId}`;
  }

  userScheduler.unregisterTask(taskId);
  await ScheduledTask.delete(taskId);

  return `✅ 已删除任务: ${task.name}`;
}

/**
 * 处理启用/禁用任务
 */
async function handleToggle(taskId, enabled) {
  if (!taskId) {
    return `请提供要${enabled ? "启用" : "禁用"}的任务 ID`;
  }

  const task = await ScheduledTask.get(taskId);
  if (!task) {
    return `找不到任务: ${taskId}`;
  }

  await ScheduledTask.update(taskId, { enabled });

  if (enabled) {
    userScheduler.registerTask({ ...task, enabled: true });
  } else {
    userScheduler.unregisterTask(taskId);
  }

  return `✅ 任务"${task.name}"已${enabled ? "启用" : "禁用"}`;
}

/**
 * 格式化调度描述
 */
function formatScheduleDescription(config) {
  if (config.type === "cron") {
    return `Cron: ${config.cronExpression}`;
  }
  if (config.type === "once") {
    return `一次性: ${new Date(config.executeAt).toLocaleString("zh-CN")}`;
  }
  if (config.type === "interval") {
    return `每 ${config.intervalMinutes} 分钟`;
  }
  return "未知";
}

module.exports = { scheduleTaskPlugin };
