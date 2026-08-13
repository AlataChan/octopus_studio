const { FLOW_TYPES } = require("./flowTypes");
const executeApiCall = require("./executors/api-call");
const executeLLMInstruction = require("./executors/llm-instruction");
const executeWebScraping = require("./executors/web-scraping");
const executeSubflow = require("./executors/subflow");
const Blackboard = require("./blackboard");
const { Telemetry } = require("../../models/telemetry");
const { safeJsonParse } = require("../http");
const {
  FlowCheckpointManager,
  waitForUserResponse,
} = require("./flowCheckpoint");

class FlowExecutor {
  constructor() {
    this.variables = {};
    this.blackboard = null; // Blackboard 将在 executeFlow 时初始化
    this.introspect = (...args) => console.log("[introspect] ", ...args);
    this.logger = console.info;
    this.aibitat = null;
  }

  attachLogging(introspectFn = null, loggerFn = null) {
    this.introspect =
      introspectFn || ((...args) => console.log("[introspect] ", ...args));
    this.logger = loggerFn || console.info;
  }

  /**
   * Resolves nested values from objects using dot notation and array indices
   * Supports paths like "data.items[0].name" or "response.users[2].address.city"
   * Returns undefined for invalid paths or errors
   * @param {Object|string} obj - The object to resolve the value from
   * @param {string} path - The path to the value
   * @returns {string} The resolved value
   */
  getValueFromPath(obj = {}, path = "") {
    if (typeof obj === "string") obj = safeJsonParse(obj, {});

    if (
      !obj ||
      !path ||
      typeof obj !== "object" ||
      Object.keys(obj).length === 0 ||
      typeof path !== "string"
    )
      return "";

    // First split by dots that are not inside brackets
    const parts = [];
    let currentPart = "";
    let inBrackets = false;

    for (let i = 0; i < path.length; i++) {
      const char = path[i];
      if (char === "[") {
        inBrackets = true;
        if (currentPart) {
          parts.push(currentPart);
          currentPart = "";
        }
        currentPart += char;
      } else if (char === "]") {
        inBrackets = false;
        currentPart += char;
        parts.push(currentPart);
        currentPart = "";
      } else if (char === "." && !inBrackets) {
        if (currentPart) {
          parts.push(currentPart);
          currentPart = "";
        }
      } else {
        currentPart += char;
      }
    }

    if (currentPart) parts.push(currentPart);
    let current = obj;

    for (const part of parts) {
      if (current === null || typeof current !== "object") return undefined;

      // Handle bracket notation
      if (part.startsWith("[") && part.endsWith("]")) {
        const key = part.slice(1, -1);
        const cleanKey = key.replace(/^['"]|['"]$/g, "");

        if (!isNaN(cleanKey)) {
          if (!Array.isArray(current)) return undefined;
          current = current[parseInt(cleanKey)];
        } else {
          if (!(cleanKey in current)) return undefined;
          current = current[cleanKey];
        }
      } else {
        // Handle dot notation
        if (!(part in current)) return undefined;
        current = current[part];
      }

      if (current === undefined || current === null) return undefined;
    }

    return typeof current === "object" ? JSON.stringify(current) : current;
  }

  /**
   * Replaces variables in the config with their values
   * @param {Object} config - The config to replace variables in
   * @returns {Object} The config with variables replaced
   */
  replaceVariables(config) {
    const deepReplace = (obj) => {
      if (typeof obj === "string") {
        // 支持两种变量格式: ${varName} 和 {{varName}}
        let result = obj.replace(/\${([^}]+)}/g, (match, varName) => {
          const value = this.getValueFromPath(this.variables, varName);
          return value !== undefined ? value : match;
        });
        result = result.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
          const value = this.getValueFromPath(this.variables, varName);
          return value !== undefined ? value : match;
        });
        return result;
      }

      if (Array.isArray(obj)) return obj.map((item) => deepReplace(item));

      if (obj && typeof obj === "object") {
        const result = {};
        for (const [key, value] of Object.entries(obj)) {
          result[key] = deepReplace(value);
        }
        return result;
      }
      return obj;
    };

    return deepReplace(config);
  }

  /**
   * Executes a single step of the flow
   * @param {Object} step - The step to execute
   * @returns {Promise<Object>} The result of the step
   */
  async executeStep(step) {
    const config = this.replaceVariables(step.config);
    let result;
    // Create execution context with introspect and blackboard
    const context = {
      introspect: this.introspect,
      variables: this.variables,
      logger: this.logger,
      aibitat: this.aibitat,
      blackboard: this.blackboard, // 传递 blackboard 给所有执行器
    };

    switch (step.type) {
      case FLOW_TYPES.START.type:
        // For start blocks, we just initialize variables if they're not already set
        if (config.variables) {
          config.variables.forEach((v) => {
            if (v.name && !this.variables[v.name]) {
              this.variables[v.name] = v.value || "";
            }
          });
        }
        result = this.variables;
        break;
      case FLOW_TYPES.API_CALL.type:
        result = await executeApiCall(config, context);
        break;
      case FLOW_TYPES.LLM_INSTRUCTION.type:
        result = await executeLLMInstruction(config, context);
        break;
      case FLOW_TYPES.WEB_SCRAPING.type:
        result = await executeWebScraping(config, context);
        break;
      case FLOW_TYPES.SUBFLOW.type:
        result = await executeSubflow(config, context);
        break;
      default:
        throw new Error(`Unknown flow type: ${step.type}`);
    }

    // Store result in variable if specified
    if (config.resultVariable || config.responseVariable) {
      const varName = config.resultVariable || config.responseVariable;
      this.variables[varName] = result;
    }

    // If directOutput is true, mark this result for direct output
    if (config.directOutput) result = { directOutput: true, result };
    return result;
  }

  /**
   * Execute entire flow
   * @param {Object} flow - The flow to execute
   * @param {Object} initialVariables - Initial variables for the flow
   * @param {Object} aibitat - The aibitat instance from the agent handler
   * @param {Blackboard} sharedBlackboard - 可选的共享 Blackboard（用于 Subflow）
   */
  async executeFlow(
    flow,
    initialVariables = {},
    aibitat,
    sharedBlackboard = null
  ) {
    await Telemetry.sendTelemetry("agent_flow_execution_started");

    // 生成系统内置变量（当前日期时间）
    const now = new Date();
    const systemVariables = {
      current_date: now.toLocaleDateString("zh-CN", {
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
      current_datetime: now.toLocaleString("zh-CN"),
      current_year: now.getFullYear().toString(),
      current_month: (now.getMonth() + 1).toString(),
      current_day: now.getDate().toString(),
    };

    // Initialize variables with both initial values and any passed-in values
    this.variables = {
      ...systemVariables, // 系统内置变量（最低优先级）
      ...(
        flow.config.steps.find((s) => s.type === "start")?.config?.variables ||
        []
      ).reduce((acc, v) => ({ ...acc, [v.name]: v.value }), {}),
      ...initialVariables, // This will override any default values with passed-in values
    };

    // 初始化 Blackboard（如果没有传入共享的）
    this.blackboard = sharedBlackboard || new Blackboard(initialVariables);

    this.aibitat = aibitat;
    this.attachLogging(aibitat?.introspect, aibitat?.handlerProps?.log);
    const results = [];
    let directOutputResult = null;

    // 计算实际执行步骤数（排除 start 和 finish 类型，因为它们不是用户可感知的处理步骤）
    const executableSteps = flow.config.steps.filter(
      (s) => s.type !== FLOW_TYPES.START.type && s.type !== "finish"
    );
    const totalSteps = executableSteps.length;

    for (let i = 0; i < flow.config.steps.length; i++) {
      const step = flow.config.steps[i];

      // 计算当前可执行步骤索引（排除 start 和 finish）
      const execStepIndex = flow.config.steps
        .slice(0, i + 1)
        .filter(
          (s) => s.type !== FLOW_TYPES.START.type && s.type !== "finish"
        ).length;

      console.log(
        `[FlowExecutor] Executing step ${i + 1}/${flow.config.steps.length}: ${step.type}`
      );

      // 发送结构化进度消息（跳过 start 类型）
      if (step.type !== FLOW_TYPES.START.type) {
        this._sendFlowProgress({
          flowName: flow.name,
          stepIndex: execStepIndex,
          totalSteps,
          stepLabel: step.config?.label || this._getStepLabel(step.type),
          roleName: step.config?.roleName || null,
          roleDescription: step.config?.roleDescription || null,
          status: "running",
        });
      }

      try {
        const result = await this.executeStep(step);
        console.log(
          `[FlowExecutor] Step ${i + 1} (${step.type}) completed. Result type: ${typeof result}, hasDirectOutput: ${result?.directOutput}`
        );

        // 发送步骤完成消息
        if (step.type !== FLOW_TYPES.START.type) {
          this._sendFlowProgress({
            flowName: flow.name,
            stepIndex: execStepIndex,
            totalSteps,
            stepLabel: step.config?.label || this._getStepLabel(step.type),
            roleName: step.config?.roleName || null,
            roleDescription: step.config?.roleDescription || null,
            status: "completed",
          });
        }

        // If the step has directOutput, stop processing and return the result
        // so that no other steps are executed or processed
        if (result?.directOutput) {
          console.log(
            `[FlowExecutor] Step ${i + 1} has directOutput=true, stopping flow and returning result`
          );
          directOutputResult = result.result;
          break;
        }

        results.push({ success: true, result, step });
      } catch (error) {
        console.log(
          `[FlowExecutor] Step ${i + 1} (${step.type}) failed: ${error.message}`
        );

        // 发送步骤失败消息
        if (step.type !== FLOW_TYPES.START.type) {
          this._sendFlowProgress({
            flowName: flow.name,
            stepIndex: execStepIndex,
            totalSteps,
            stepLabel: step.config?.label || this._getStepLabel(step.type),
            roleName: step.config?.roleName || null,
            roleDescription: step.config?.roleDescription || null,
            status: "failed",
          });
        }

        // Phase I: 交互式错误恢复
        // 如果启用了交互模式，等待用户选择
        let userChoice = "skip"; // 默认跳过
        if (flow.config?.interactiveRecovery && this.aibitat?.socket) {
          // 创建检查点
          const checkpointId = FlowCheckpointManager.createCheckpoint({
            flowId: flow.id,
            flowName: flow.name,
            stepIndex: i,
            variables: this.variables,
            results,
            blackboardState: this.blackboard?.getAll(),
            failedStep: {
              type: step.type,
              config: step.config,
              error: error.message,
            },
          });

          // 发送失败对话框并等待用户响应
          userChoice = await waitForUserResponse(
            this.aibitat.socket,
            {
              flowName: flow.name,
              stepLabel: step.config?.label || this._getStepLabel(step.type),
              stepIndex: execStepIndex,
              totalSteps,
              errorMessage: error.message,
              canRetry: step.config?.retryable !== false,
              canSkip: step.config?.skippable !== false,
            },
            checkpointId
          );

          console.log(
            `[FlowExecutor] User chose: ${userChoice} for step ${i + 1}`
          );

          // 根据用户选择处理
          if (userChoice === "retry") {
            // 重试：重新执行当前步骤
            i--; // 回退索引，下一轮循环会重新执行当前步骤
            FlowCheckpointManager.deleteCheckpoint(checkpointId);
            continue;
          } else if (userChoice === "abort") {
            // 中止：停止整个 Flow
            FlowCheckpointManager.deleteCheckpoint(checkpointId);
            results.push({
              success: false,
              error: error.message,
              step,
              aborted: true,
            });
            break;
          }
          // skip：继续执行后续步骤
          FlowCheckpointManager.deleteCheckpoint(checkpointId);
        }

        // 记录失败但继续执行后续步骤（容错模式）
        results.push({
          success: false,
          error: error.message,
          step,
          // 标记为可恢复错误
          recoverable: true,
          skipped: userChoice === "skip",
        });

        // 严格模式检查（单步失败即停止）
        if (flow.config?.strictMode === true) {
          console.log(
            `[FlowExecutor] Strict mode enabled, stopping flow due to step failure`
          );
          break;
        }

        console.log(
          `[FlowExecutor] Step failed but continuing (recoverable mode)`
        );
      }
    }

    // 收集所有 Subflow 的角色元数据
    const agentRoles = [];
    for (const stepResult of results) {
      if (stepResult.step?.type === "subflow" && stepResult.result?.metadata) {
        const { roleName, roleDescription, flowId } =
          stepResult.result.metadata;
        if (roleName) {
          agentRoles.push({
            role: roleName,
            description: roleDescription || "",
            flowId: flowId || "",
          });
        }
      }
    }

    return {
      success: results.every((r) => r.success),
      results,
      variables: this.variables,
      directOutput: directOutputResult,
      metadata: {
        agentRoles: agentRoles.length > 0 ? agentRoles : undefined,
        blackboard: this.blackboard ? this.blackboard.getAll() : undefined,
      },
    };
  }

  /**
   * 发送 Flow 执行进度消息
   * @param {Object} progress - 进度信息
   * @param {string} progress.flowName - Flow 名称
   * @param {number} progress.stepIndex - 当前步骤索引（从 1 开始）
   * @param {number} progress.totalSteps - 总步骤数
   * @param {string} progress.stepLabel - 步骤标签
   * @param {string} [progress.roleName] - 角色名称（可选，用于多角色协作显示）
   * @param {string} [progress.roleDescription] - 角色描述（可选）
   * @param {string} progress.status - 状态：running | completed | failed
   */
  _sendFlowProgress(progress) {
    if (!this.aibitat?.socket?.send) {
      return;
    }

    this.aibitat.socket.send("flowProgress", {
      flowName: progress.flowName,
      stepIndex: progress.stepIndex,
      totalSteps: progress.totalSteps,
      stepLabel: progress.stepLabel,
      roleName: progress.roleName || null,
      roleDescription: progress.roleDescription || null,
      status: progress.status,
      timestamp: Date.now(),
    });
  }

  /**
   * 获取步骤类型的可读标签
   * @param {string} stepType - 步骤类型
   * @returns {string} 可读标签
   */
  _getStepLabel(stepType) {
    const labels = {
      [FLOW_TYPES.LLM_INSTRUCTION.type]: "AI 处理中",
      [FLOW_TYPES.API_CALL.type]: "调用外部服务",
      [FLOW_TYPES.WEB_SCRAPING.type]: "抓取网页内容",
      [FLOW_TYPES.SUBFLOW.type]: "执行子流程",
      [FLOW_TYPES.START.type]: "初始化",
    };
    return labels[stepType] || stepType;
  }
}

module.exports = {
  FlowExecutor,
  FLOW_TYPES,
};
