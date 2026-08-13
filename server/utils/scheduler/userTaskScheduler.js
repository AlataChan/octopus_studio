/**
 * @fileoverview 用户级定时任务调度器
 * 管理用户创建的定时任务的调度与执行
 */

const cron = require("node-cron");
const { ScheduledTask } = require("../../models/scheduledTask");

class FeatureDisabledError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "FeatureDisabledError";
    this.code = code;
  }
}

/**
 * 已注册的用户任务
 * @type {Map<string, cron.ScheduledTask>}
 */
const registeredTasks = new Map();

/**
 * 一次性任务的超时 ID
 * @type {Map<string, NodeJS.Timeout>}
 */
const onceTaskTimeouts = new Map();

const userScheduler = {
  /**
   * 初始化用户任务调度器
   * 从数据库加载所有启用的任务
   */
  async init() {
    console.log("[UserScheduler] 正在初始化用户任务调度器...");

    try {
      const tasks = await ScheduledTask.getAllEnabled();

      for (const task of tasks) {
        this.registerTask(task);
      }

      console.log(`[UserScheduler] 已加载 ${tasks.length} 个用户定时任务`);
    } catch (error) {
      console.error("[UserScheduler] 初始化失败:", error.message);
    }
  },

  /**
   * 注册单个任务到调度器
   * @param {Object} task - 任务对象
   */
  registerTask(task) {
    // 先移除已存在的同 ID 任务
    this.unregisterTask(task.id);

    try {
      if (task.scheduleType === "cron" && task.cronExpression) {
        const cronTask = cron.schedule(
          task.cronExpression,
          () => this._executeTask(task),
          { timezone: task.timezone || "Asia/Shanghai" }
        );
        registeredTasks.set(task.id, cronTask);
        console.log(
          `[UserScheduler] 已注册 cron 任务: ${task.name} (${task.cronExpression})`
        );
      } else if (task.scheduleType === "once" && task.executeAt) {
        const executeTime = new Date(task.executeAt).getTime();
        const now = Date.now();
        const delay = executeTime - now;

        if (delay > 0) {
          const timeout = setTimeout(() => this._executeTask(task), delay);
          onceTaskTimeouts.set(task.id, timeout);
          console.log(
            `[UserScheduler] 已注册一次性任务: ${task.name} (${task.executeAt})`
          );
        } else {
          console.log(`[UserScheduler] 一次性任务已过期，跳过: ${task.name}`);
        }
      } else if (task.scheduleType === "interval" && task.intervalMinutes) {
        // 使用 cron 表达式实现间隔执行
        const cronExpr = `*/${task.intervalMinutes} * * * *`;
        const cronTask = cron.schedule(
          cronExpr,
          () => this._executeTask(task),
          { timezone: task.timezone || "Asia/Shanghai" }
        );
        registeredTasks.set(task.id, cronTask);
        console.log(
          `[UserScheduler] 已注册间隔任务: ${task.name} (每${task.intervalMinutes}分钟)`
        );
      }
    } catch (error) {
      console.error(
        `[UserScheduler] 注册任务失败 ${task.name}:`,
        error.message
      );
    }
  },

  /**
   * 取消注册任务
   * @param {string} taskId - 任务 ID
   */
  unregisterTask(taskId) {
    // 停止 cron 任务
    if (registeredTasks.has(taskId)) {
      registeredTasks.get(taskId).stop();
      registeredTasks.delete(taskId);
    }
    // 清除一次性任务超时
    if (onceTaskTimeouts.has(taskId)) {
      clearTimeout(onceTaskTimeouts.get(taskId));
      onceTaskTimeouts.delete(taskId);
    }
  },

  /**
   * 立即执行任务（用于测试或手动触发）
   * @param {Object} task - 任务对象
   * @returns {Promise<Object>}
   */
  async executeTaskNow(task) {
    return await this._executeTask(task);
  },

  /**
   * 执行任务
   * @private
   * @param {Object} task - 任务对象
   * @returns {Promise<Object>}
   */
  async _executeTask(task) {
    console.log(`[UserScheduler] 开始执行任务: ${task.name}`);
    const startedAt = new Date();

    try {
      // 检查执行次数限制
      if (task.maxRuns && task.runCount >= task.maxRuns) {
        console.log(`[UserScheduler] 任务已达到执行次数上限: ${task.name}`);
        await ScheduledTask.update(task.id, { enabled: false });
        this.unregisterTask(task.id);
        return { status: "skipped", reason: "max_runs_reached" };
      }

      // 根据动作类型执行
      let result;
      switch (task.actionType) {
        case "send_message":
          result = await this._executeSendMessage(task);
          break;
        case "agent_flow":
          result = await this._executeAgentFlow(task);
          break;
        case "webhook":
          result = await this._executeWebhook(task);
          break;
        default:
          throw new Error(`未知的动作类型: ${task.actionType}`);
      }

      // 记录执行成功
      await ScheduledTask.logExecution(task.id, {
        status: "success",
        startedAt,
        finishedAt: new Date(),
        output: result,
      });

      console.log(`[UserScheduler] 任务执行成功: ${task.name}`);
      return { status: "success", output: result };
    } catch (error) {
      if (error instanceof FeatureDisabledError) {
        const reason = error.code || "FEATURE_DISABLED";
        await ScheduledTask.logExecution(task.id, {
          status: "skipped",
          startedAt,
          finishedAt: new Date(),
          error: reason,
          reason: "disabled_by_build",
          output: {
            reason,
            message: error.message,
          },
        });
        await ScheduledTask.update(task.id, {
          enabled: false,
          lastRunStatus: "disabled_by_build",
          lastRunError: reason,
          nextRunAt: null,
        });
        this.unregisterTask(task.id);
        console.warn(
          `[UserScheduler] 已禁用不受支持的 agent_flow 定时任务 ${task.name}:`,
          reason
        );
        return { status: "disabled", reason };
      }

      // 记录执行失败
      await ScheduledTask.logExecution(task.id, {
        status: "failed",
        startedAt,
        finishedAt: new Date(),
        error: error.message,
      });

      console.error(
        `[UserScheduler] 任务执行失败 ${task.name}:`,
        error.message
      );
      return { status: "failed", error: error.message };
    }
  },

  /**
   * 执行发送消息动作 - 直接调用 LLM（跳过向量嵌入）
   * @private
   */
  async _executeSendMessage(task) {
    const { message } = task.actionConfig;
    const { Workspace } = require("../../models/workspace");
    const { WorkspaceChats } = require("../../models/workspaceChats");
    const { WorkspaceAssistant } = require("../../models/workspaceAssistant");
    const { getRoutedLLMConnector } = require("../chats/routedLLMConnector");

    // 获取 Workspace
    const workspace = await Workspace.get({ id: task.workspaceId });
    if (!workspace) {
      throw new Error("Workspace 不存在");
    }

    // 获取 AI 员工信息
    let assistantInfo = null;

    if (task.assistantId) {
      try {
        assistantInfo = await WorkspaceAssistant.get(task.assistantId);
      } catch (e) {
        console.warn(
          `[UserScheduler] 未找到 AI 员工 ${task.assistantId}:`,
          e.message
        );
      }
    }

    // 构造要发送的消息
    const prompt =
      message || task.description || `请执行定时任务: ${task.name}`;

    const assistantName =
      assistantInfo?.instanceName || assistantInfo?.template?.name || "AI 助手";
    console.log(
      `[UserScheduler] 执行定时任务: "${prompt}" -> Workspace: ${workspace.slug}, AI员工: ${assistantName}`
    );

    try {
      // 直接调用 LLM Provider（跳过向量嵌入/RAG）
      const LLMConnector = await getRoutedLLMConnector({
        workspace,
        message: prompt,
        history: [],
        attachments: [],
        exit: "E7",
      });

      // 构造系统提示词
      const systemPrompt =
        workspace.openAiPrompt ||
        assistantInfo?.template?.systemPrompt ||
        `你是一个专业的 AI 助手「${assistantName}」，正在执行定时任务。请简洁准确地完成任务。`;

      // 直接调用 LLM 获取回复
      const chatResult = await LLMConnector.getChatCompletion(
        [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ],
        { temperature: workspace?.openAiTemp ?? 0.7 }
      );

      // getChatCompletion 返回的是对象 { textResponse, metrics }
      const textResponse = chatResult?.textResponse || "任务执行完成";

      if (!textResponse) {
        throw new Error("LLM 返回空响应");
      }

      // 保存执行记录到聊天历史（用户可以在聊天界面看到）
      await WorkspaceChats.new({
        workspaceId: workspace.id,
        prompt: `📅 [定时任务] ${task.name}`,
        response: {
          text: `**${assistantName}** 执行了定时任务「${task.name}」：\n\n${textResponse}`,
          type: "scheduled_task_execution",
          taskId: task.id,
          taskName: task.name,
          assistantId: task.assistantId,
          assistantName: assistantName,
          sources: [],
        },
        include: true, // 计入历史，用户可见
      });

      console.log(`[UserScheduler] 任务执行成功: ${task.name}`);
      return {
        message: "AI 员工已执行任务",
        workspace: workspace.slug,
        assistantId: task.assistantId,
        assistantName,
        response:
          typeof textResponse === "string"
            ? textResponse.substring(0, 500)
            : String(textResponse).substring(0, 500),
      };
    } catch (error) {
      console.error(`[UserScheduler] 执行消息任务失败:`, error);

      // 记录失败信息到聊天历史
      await WorkspaceChats.new({
        workspaceId: workspace.id,
        prompt: `📅 [定时任务失败] ${task.name}`,
        response: {
          text: `定时任务「${task.name}」执行失败: ${error.message}`,
          type: "scheduled_task_error",
          taskId: task.id,
          taskName: task.name,
          error: error.message,
        },
        include: true,
      });

      throw error;
    }
  },

  /**
   * 执行 Agent Flow 动作
   * @private
   */
  async _executeAgentFlow(task) {
    throw new FeatureDisabledError(
      "agent_flow scheduling not enabled in this build",
      "AGENT_FLOW_RUN_DISABLED"
    );
  },

  /**
   * 执行 Webhook 动作
   * @private
   */
  async _executeWebhook(task) {
    const {
      webhookUrl,
      method = "POST",
      headers = {},
      body,
    } = task.actionConfig;

    const response = await fetch(webhookUrl, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const responseText = await response.text();

    if (!response.ok) {
      throw new Error(`Webhook 调用失败: ${response.status} ${responseText}`);
    }

    return {
      message: "Webhook 已调用",
      status: response.status,
      response: responseText.substring(0, 500), // 截取前 500 字符
    };
  },

  /**
   * 获取调度器状态
   * @returns {Object}
   */
  getStatus() {
    return {
      registeredCronTasks: registeredTasks.size,
      registeredOnceTasks: onceTaskTimeouts.size,
      totalTasks: registeredTasks.size + onceTaskTimeouts.size,
    };
  },

  /**
   * 停止所有用户任务
   */
  stopAll() {
    console.log("[UserScheduler] 正在停止所有用户任务...");

    for (const [_taskId, task] of registeredTasks) {
      task.stop();
    }
    registeredTasks.clear();

    for (const [_taskId, timeout] of onceTaskTimeouts) {
      clearTimeout(timeout);
    }
    onceTaskTimeouts.clear();

    console.log("[UserScheduler] 所有用户任务已停止");
  },
};

module.exports = { FeatureDisabledError, userScheduler };
