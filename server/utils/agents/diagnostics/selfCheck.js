/**
 * @fileoverview AI 员工自我诊断模块
 * 实现实时执行健康检查，识别数据问题、工具失败、方向偏移
 * @module diagnostics/selfCheck
 * @see docs/ai-employee-autonomy-levels.md Phase L3.1
 */

/**
 * 诊断问题类型枚举
 * @readonly
 * @enum {string}
 */
const IssueType = {
  /** 数据不足/查询为空 */
  DATA_INSUFFICIENCY: "data_insufficiency",
  /** 工具调用失败 */
  TOOL_FAILURE: "tool_failure",
  /** 执行方向偏移 */
  DIRECTION_MISMATCH: "direction_mismatch",
  /** 超时风险 */
  TIMEOUT_RISK: "timeout_risk",
  /** 重复执行 */
  REPETITION_DETECTED: "repetition_detected",
};

/**
 * 问题严重级别
 * @readonly
 * @enum {string}
 */
const IssueSeverity = {
  /** 严重 - 需要立即停止 */
  CRITICAL: "critical",
  /** 警告 - 建议人工介入 */
  WARNING: "warning",
  /** 信息 - 仅记录 */
  INFO: "info",
};

/**
 * AI 员工自我诊断类
 * 用于实时检测执行过程中的问题并生成建议
 */
class SelfDiagnostics {
  /**
   * 检查单个步骤的健康状况
   * @param {Object} step - 步骤执行结果
   * @param {string} step.type - 步骤类型 (tool_call, llm_instruction 等)
   * @param {string} step.toolName - 工具名称
   * @param {*} step.result - 执行结果
   * @param {boolean} step.success - 是否成功
   * @param {string} [step.error] - 错误信息
   * @param {number} [step.durationMs] - 执行耗时 (毫秒)
   * @param {Object} context - 执行上下文
   * @param {string} context.originalPrompt - 原始用户输入
   * @param {Object} [context.originalIntent] - 提取的原始意图
   * @param {Array} [context.previousSteps] - 之前的步骤
   * @returns {Promise<Array<Object>>} 发现的问题列表
   */
  static async checkStepHealth(step, context) {
    const issues = [];

    // 1. 数据完整性检查
    const dataIssue = this.#checkDataCompleteness(step, context);
    if (dataIssue) issues.push(dataIssue);

    // 2. 工具失败检查
    const toolIssue = this.#checkToolFailure(step, context);
    if (toolIssue) issues.push(toolIssue);

    // 3. 方向性检查
    const directionIssue = this.#checkDirection(step, context);
    if (directionIssue) issues.push(directionIssue);

    // 4. 超时风险检查
    const timeoutIssue = this.#checkTimeoutRisk(step, context);
    if (timeoutIssue) issues.push(timeoutIssue);

    // 5. 重复执行检查
    const repetitionIssue = this.#checkRepetition(step, context);
    if (repetitionIssue) issues.push(repetitionIssue);

    return issues;
  }

  /**
   * 检查数据完整性
   * @private
   */
  static #checkDataCompleteness(step, context) {
    const { result, toolName } = step;

    // 检测查询结果为空
    if (this.#isEmptyResult(result)) {
      return {
        type: IssueType.DATA_INSUFFICIENCY,
        severity: IssueSeverity.WARNING,
        message: `工具 "${toolName}" 返回空结果，可能数据不足`,
        toolName,
        suggestedActions: [
          { action: "retry_with_broader_query", label: "扩大查询范围重试" },
          { action: "skip_and_continue", label: "跳过此步骤继续" },
          { action: "request_user_input", label: "请求用户提供更多信息" },
        ],
        diagnosticInfo: {
          resultType: typeof result,
          isEmpty: true,
        },
      };
    }

    return null;
  }

  /**
   * 检查工具是否失败
   * @private
   */
  static #checkToolFailure(step, context) {
    const { success, error, toolName } = step;

    if (!success && error) {
      // 分类错误类型
      const errorCategory = this.#categorizeError(error);

      return {
        type: IssueType.TOOL_FAILURE,
        severity: errorCategory.severity,
        message: `工具 "${toolName}" 执行失败: ${error}`,
        toolName,
        errorCategory: errorCategory.category,
        suggestedActions: errorCategory.suggestedActions,
        diagnosticInfo: {
          error,
          category: errorCategory.category,
        },
      };
    }

    return null;
  }

  /**
   * 检查执行方向是否偏离
   * @private
   */
  static #checkDirection(step, context) {
    const { originalIntent, previousSteps = [] } = context;

    // 如果没有意图信息，跳过方向检查
    if (!originalIntent) return null;

    // 简单规则：检查步骤数是否过多
    if (previousSteps.length > 10) {
      return {
        type: IssueType.DIRECTION_MISMATCH,
        severity: IssueSeverity.WARNING,
        message: "执行步骤过多，可能偏离原始目标",
        suggestedActions: [
          { action: "summarize_and_conclude", label: "总结当前结果并结束" },
          { action: "confirm_direction", label: "确认是否继续当前方向" },
          { action: "abort", label: "中止执行" },
        ],
        diagnosticInfo: {
          stepCount: previousSteps.length,
          originalGoal: originalIntent.goal,
        },
      };
    }

    return null;
  }

  /**
   * 检查超时风险
   * @private
   */
  static #checkTimeoutRisk(step, context) {
    const { durationMs, toolName } = step;
    const SLOW_THRESHOLD_MS = 15000; // 15 秒

    if (durationMs && durationMs > SLOW_THRESHOLD_MS) {
      return {
        type: IssueType.TIMEOUT_RISK,
        severity: IssueSeverity.INFO,
        message: `工具 "${toolName}" 执行缓慢 (${(durationMs / 1000).toFixed(1)}s)`,
        toolName,
        suggestedActions: [
          { action: "continue", label: "继续执行" },
          { action: "set_timeout_limit", label: "设置超时限制" },
        ],
        diagnosticInfo: {
          durationMs,
          thresholdMs: SLOW_THRESHOLD_MS,
        },
      };
    }

    return null;
  }

  /**
   * 检查重复执行
   * @private
   */
  static #checkRepetition(step, context) {
    const { toolName } = step;
    const { previousSteps = [] } = context;

    // 统计相同工具的调用次数
    const sameToolCalls = previousSteps.filter((s) => s.toolName === toolName);

    if (sameToolCalls.length >= 3) {
      return {
        type: IssueType.REPETITION_DETECTED,
        severity: IssueSeverity.WARNING,
        message: `工具 "${toolName}" 已被调用 ${sameToolCalls.length + 1} 次，可能陷入循环`,
        toolName,
        suggestedActions: [
          { action: "break_loop", label: "终止循环并总结" },
          { action: "change_approach", label: "尝试其他方法" },
          { action: "confirm_continue", label: "确认是否继续" },
        ],
        diagnosticInfo: {
          callCount: sameToolCalls.length + 1,
          toolName,
        },
      };
    }

    return null;
  }

  /**
   * 判断结果是否为空
   * @private
   */
  static #isEmptyResult(result) {
    if (result === null || result === undefined) return true;
    if (result === "") return true;
    if (Array.isArray(result) && result.length === 0) return true;
    if (typeof result === "object" && Object.keys(result).length === 0)
      return true;

    // 检查常见的 "无结果" 字符串模式
    if (typeof result === "string") {
      const emptyPatterns = [
        /no results?/i,
        /not found/i,
        /empty/i,
        /无结果/,
        /未找到/,
        /查询为空/,
      ];
      return emptyPatterns.some((pattern) => pattern.test(result));
    }

    return false;
  }

  /**
   * 错误分类
   * @private
   */
  static #categorizeError(error) {
    const errorStr = String(error).toLowerCase();

    // 网络错误
    if (/network|timeout|econnrefused|fetch failed/i.test(errorStr)) {
      return {
        category: "network_error",
        severity: IssueSeverity.WARNING,
        suggestedActions: [
          { action: "retry", label: "重试" },
          { action: "skip", label: "跳过此步骤" },
        ],
      };
    }

    // 权限错误
    if (/permission|unauthorized|forbidden|403|401/i.test(errorStr)) {
      return {
        category: "permission_error",
        severity: IssueSeverity.CRITICAL,
        suggestedActions: [
          { action: "request_permission", label: "申请权限" },
          { action: "use_alternative", label: "使用替代工具" },
        ],
      };
    }

    // 配置错误
    if (/config|invalid|missing.*param/i.test(errorStr)) {
      return {
        category: "config_error",
        severity: IssueSeverity.CRITICAL,
        suggestedActions: [
          { action: "fix_config", label: "修复配置" },
          { action: "abort", label: "中止执行" },
        ],
      };
    }

    // 默认处理
    return {
      category: "unknown_error",
      severity: IssueSeverity.WARNING,
      suggestedActions: [
        { action: "retry", label: "重试" },
        { action: "skip", label: "跳过" },
        { action: "abort", label: "中止" },
      ],
    };
  }

  /**
   * 批量检查多个步骤
   * @param {Array} steps - 步骤数组
   * @param {Object} context - 执行上下文
   * @returns {Promise<Object>} 诊断报告
   */
  static async diagnoseSteps(steps, context) {
    const allIssues = [];

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const stepContext = {
        ...context,
        previousSteps: steps.slice(0, i),
      };

      const issues = await this.checkStepHealth(step, stepContext);
      allIssues.push(
        ...issues.map((issue) => ({
          ...issue,
          stepIndex: i,
        }))
      );
    }

    return {
      totalSteps: steps.length,
      issueCount: allIssues.length,
      issues: allIssues,
      hasCritical: allIssues.some((i) => i.severity === IssueSeverity.CRITICAL),
      hasWarning: allIssues.some((i) => i.severity === IssueSeverity.WARNING),
    };
  }
}

module.exports = {
  SelfDiagnostics,
  IssueType,
  IssueSeverity,
};
