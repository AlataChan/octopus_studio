/**
 * @fileoverview 诊断规则引擎
 * 支持配置化的诊断规则，实现引擎与规则分离
 * @module diagnostics/ruleEngine
 * @see docs/ai-employee-autonomy-levels.md Appendix A
 */

const { IssueType, IssueSeverity } = require("./selfCheck");

/**
 * 默认诊断规则集
 * 可通过配置文件或数据库扩展
 * @type {Array<Object>}
 */
const DEFAULT_RULES = [
  {
    id: "empty_result_check",
    name: "空结果检查",
    description: "检测工具返回空结果的情况",
    enabled: true,
    priority: 1,
    condition: {
      type: "result_check",
      check: "isEmpty",
    },
    issue: {
      type: IssueType.DATA_INSUFFICIENCY,
      severity: IssueSeverity.WARNING,
      messageTemplate: '工具 "{toolName}" 返回空结果',
      suggestedActions: [
        { action: "retry_with_broader_query", label: "扩大查询范围重试" },
        { action: "skip_and_continue", label: "跳过此步骤继续" },
        { action: "request_user_input", label: "请求用户提供更多信息" },
      ],
    },
  },
  {
    id: "tool_error_check",
    name: "工具错误检查",
    description: "检测工具执行失败的情况",
    enabled: true,
    priority: 0, // 最高优先级
    condition: {
      type: "error_check",
      check: "hasError",
    },
    issue: {
      type: IssueType.TOOL_FAILURE,
      severity: IssueSeverity.WARNING,
      messageTemplate: '工具 "{toolName}" 执行失败: {error}',
      suggestedActions: [
        { action: "retry", label: "重试" },
        { action: "skip", label: "跳过" },
        { action: "abort", label: "中止" },
      ],
    },
  },
  {
    id: "slow_execution_check",
    name: "慢执行检查",
    description: "检测执行时间过长的情况",
    enabled: true,
    priority: 3,
    condition: {
      type: "duration_check",
      threshold: 15000, // 15 秒
    },
    issue: {
      type: IssueType.TIMEOUT_RISK,
      severity: IssueSeverity.INFO,
      messageTemplate: '工具 "{toolName}" 执行缓慢 ({durationSec}s)',
      suggestedActions: [
        { action: "continue", label: "继续执行" },
        { action: "set_timeout", label: "设置超时限制" },
      ],
    },
  },
  {
    id: "repetition_check",
    name: "重复执行检查",
    description: "检测同一工具被重复调用的情况",
    enabled: true,
    priority: 2,
    condition: {
      type: "repetition_check",
      threshold: 3, // 同一工具调用超过 3 次
    },
    issue: {
      type: IssueType.REPETITION_DETECTED,
      severity: IssueSeverity.WARNING,
      messageTemplate: '工具 "{toolName}" 已被调用 {count} 次，可能陷入循环',
      suggestedActions: [
        { action: "break_loop", label: "终止循环并总结" },
        { action: "change_approach", label: "尝试其他方法" },
        { action: "confirm_continue", label: "确认是否继续" },
      ],
    },
  },
  {
    id: "step_limit_check",
    name: "步骤数量检查",
    description: "检测执行步骤过多的情况",
    enabled: true,
    priority: 2,
    condition: {
      type: "step_count_check",
      threshold: 10,
    },
    issue: {
      type: IssueType.DIRECTION_MISMATCH,
      severity: IssueSeverity.WARNING,
      messageTemplate: "执行步骤已达 {stepCount} 步，可能偏离原始目标",
      suggestedActions: [
        { action: "summarize_and_conclude", label: "总结当前结果并结束" },
        { action: "confirm_direction", label: "确认是否继续当前方向" },
        { action: "abort", label: "中止执行" },
      ],
    },
  },
];

/**
 * 诊断规则引擎
 * 负责加载规则、评估规则条件、生成诊断问题
 */
class DiagnosticRuleEngine {
  /**
   * @param {Array<Object>} [customRules] - 自定义规则（可选）
   */
  constructor(customRules = null) {
    this.rules = customRules || [...DEFAULT_RULES];
    // 按优先级排序
    this.rules.sort((a, b) => a.priority - b.priority);
  }

  /**
   * 添加规则
   * @param {Object} rule - 规则定义
   */
  addRule(rule) {
    this.rules.push(rule);
    this.rules.sort((a, b) => a.priority - b.priority);
  }

  /**
   * 移除规则
   * @param {string} ruleId - 规则 ID
   */
  removeRule(ruleId) {
    this.rules = this.rules.filter((r) => r.id !== ruleId);
  }

  /**
   * 启用/禁用规则
   * @param {string} ruleId - 规则 ID
   * @param {boolean} enabled - 是否启用
   */
  setRuleEnabled(ruleId, enabled) {
    const rule = this.rules.find((r) => r.id === ruleId);
    if (rule) rule.enabled = enabled;
  }

  /**
   * 评估所有规则
   * @param {Object} step - 步骤执行结果
   * @param {Object} context - 执行上下文
   * @returns {Array<Object>} 触发的问题列表
   */
  evaluate(step, context) {
    const issues = [];

    for (const rule of this.rules) {
      if (!rule.enabled) continue;

      const triggered = this.#checkCondition(rule.condition, step, context);
      if (triggered) {
        const issue = this.#buildIssue(rule, step, context);
        issues.push(issue);
      }
    }

    return issues;
  }

  /**
   * 检查规则条件
   * @private
   */
  #checkCondition(condition, step, context) {
    const { type, check, threshold } = condition;
    const { previousSteps = [] } = context;

    switch (type) {
      case "result_check":
        if (check === "isEmpty") {
          return this.#isEmptyResult(step.result);
        }
        break;

      case "error_check":
        if (check === "hasError") {
          return !step.success && step.error;
        }
        break;

      case "duration_check":
        return step.durationMs && step.durationMs > threshold;

      case "repetition_check": {
        const count =
          previousSteps.filter((s) => s.toolName === step.toolName).length + 1;
        return count > threshold;
      }

      case "step_count_check":
        return previousSteps.length >= threshold;

      default:
        return false;
    }

    return false;
  }

  /**
   * 构建问题对象
   * @private
   */
  #buildIssue(rule, step, context) {
    const { previousSteps = [] } = context;

    // 填充消息模板
    const message = this.#fillTemplate(rule.issue.messageTemplate, {
      toolName: step.toolName || "unknown",
      error: step.error || "",
      durationSec: step.durationMs ? (step.durationMs / 1000).toFixed(1) : "0",
      count:
        previousSteps.filter((s) => s.toolName === step.toolName).length + 1,
      stepCount: previousSteps.length + 1,
    });

    return {
      ruleId: rule.id,
      type: rule.issue.type,
      severity: rule.issue.severity,
      message,
      toolName: step.toolName,
      suggestedActions: rule.issue.suggestedActions,
      diagnosticInfo: {
        ruleId: rule.id,
        ruleName: rule.name,
        stepIndex: context.stepIndex,
      },
    };
  }

  /**
   * 填充模板字符串
   * @private
   */
  #fillTemplate(template, values) {
    return template.replace(/\{(\w+)\}/g, (_, key) => values[key] || "");
  }

  /**
   * 判断结果是否为空
   * @private
   */
  #isEmptyResult(result) {
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
      ];
      return emptyPatterns.some((pattern) => pattern.test(result));
    }

    return false;
  }

  /**
   * 静态方法：使用默认规则引擎评估
   * @param {Object} step - 步骤执行结果
   * @param {Object} context - 执行上下文
   * @param {string} [assistantId] - 助手 ID（用于加载自定义规则）
   * @returns {Promise<Array<Object>>} 问题列表
   */
  static async evaluateRules(step, context, assistantId = null) {
    // TODO: 如果有 assistantId，可以从数据库加载自定义规则
    const engine = new DiagnosticRuleEngine();
    return engine.evaluate(step, context);
  }

  /**
   * 获取所有规则
   * @returns {Array<Object>} 规则列表
   */
  getRules() {
    return this.rules.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      enabled: r.enabled,
      priority: r.priority,
    }));
  }
}

module.exports = {
  DiagnosticRuleEngine,
  DEFAULT_RULES,
};
