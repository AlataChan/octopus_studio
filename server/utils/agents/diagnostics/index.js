/**
 * @fileoverview AI 员工诊断模块统一入口
 * @module diagnostics
 * @see docs/ai-employee-autonomy-levels.md
 */

const { SelfDiagnostics, IssueType, IssueSeverity } = require("./selfCheck");
const { IntentTracker, IntentCategory } = require("./intentTracker");
const { DiagnosticRuleEngine, DEFAULT_RULES } = require("./ruleEngine");

/**
 * 创建诊断上下文
 * 用于初始化诊断会话
 * @param {string} originalPrompt - 原始用户输入
 * @param {Object} [options] - 可选配置
 * @param {boolean} [options.enableIntentTracking=true] - 是否启用意图追踪
 * @param {Array} [options.customRules] - 自定义诊断规则
 * @returns {Object} 诊断上下文对象
 */
function createDiagnosticContext(originalPrompt, options = {}) {
  const { enableIntentTracking = true, customRules = null } = options;

  const context = {
    originalPrompt,
    previousSteps: [],
    stepIndex: 0,
  };

  // 初始化意图追踪器
  if (enableIntentTracking) {
    context.intentTracker = new IntentTracker(originalPrompt);
    context.originalIntent = context.intentTracker.originalIntent;
  }

  // 初始化规则引擎
  context.ruleEngine = new DiagnosticRuleEngine(customRules);

  return context;
}

/**
 * 执行步骤诊断
 * 综合使用 SelfDiagnostics 和 RuleEngine
 * @param {Object} step - 步骤执行结果
 * @param {Object} diagnosticContext - 诊断上下文
 * @returns {Promise<Object>} 诊断结果
 */
async function diagnoseStep(step, diagnosticContext) {
  const {
    previousSteps = [],
    stepIndex = 0,
    intentTracker,
    ruleEngine,
  } = diagnosticContext;

  // 构建检查上下文
  const checkContext = {
    originalPrompt: diagnosticContext.originalPrompt,
    originalIntent: diagnosticContext.originalIntent,
    previousSteps,
    stepIndex,
  };

  // 1. 执行 SelfDiagnostics 检查
  const selfCheckIssues = await SelfDiagnostics.checkStepHealth(
    step,
    checkContext
  );

  // 2. 执行规则引擎检查
  const ruleIssues = ruleEngine ? ruleEngine.evaluate(step, checkContext) : [];

  // 3. 更新意图追踪器
  if (intentTracker) {
    intentTracker.recordStep(step, step.result);
  }

  // 4. 检查意图对齐
  let alignmentIssue = null;
  if (intentTracker) {
    const alignment = intentTracker.checkAlignment();
    if (!alignment.aligned) {
      alignmentIssue = {
        type: IssueType.DIRECTION_MISMATCH,
        severity: IssueSeverity.WARNING,
        message: alignment.suggestion || "执行方向可能偏离原始目标",
        suggestedActions: [
          { action: "confirm_direction", label: "确认是否继续" },
          { action: "adjust_approach", label: "调整执行方向" },
          { action: "abort", label: "中止执行" },
        ],
        diagnosticInfo: {
          driftScore: alignment.driftScore,
          reasons: alignment.reasons,
        },
      };
    }
  }

  // 合并所有问题（去重）
  const allIssues = [...selfCheckIssues, ...ruleIssues];
  if (alignmentIssue) allIssues.push(alignmentIssue);

  // 按严重程度排序
  const severityOrder = {
    [IssueSeverity.CRITICAL]: 0,
    [IssueSeverity.WARNING]: 1,
    [IssueSeverity.INFO]: 2,
  };
  allIssues.sort(
    (a, b) => severityOrder[a.severity] - severityOrder[b.severity]
  );

  // 更新上下文
  diagnosticContext.previousSteps.push(step);
  diagnosticContext.stepIndex++;

  return {
    hasIssues: allIssues.length > 0,
    hasCritical: allIssues.some((i) => i.severity === IssueSeverity.CRITICAL),
    hasWarning: allIssues.some((i) => i.severity === IssueSeverity.WARNING),
    issues: allIssues,
    alignment: intentTracker ? intentTracker.checkAlignment() : null,
    stepIndex: stepIndex,
  };
}

/**
 * 检查是否需要用户干预
 * @param {Object} diagnosticResult - 诊断结果
 * @returns {boolean} 是否需要干预
 */
function needsUserIntervention(diagnosticResult) {
  // 有严重问题或警告时需要干预
  return diagnosticResult.hasCritical || diagnosticResult.hasWarning;
}

/**
 * 格式化诊断结果供前端显示
 * @param {Object} diagnosticResult - 诊断结果
 * @returns {Object} 格式化后的结果
 */
function formatForFrontend(diagnosticResult) {
  return {
    needsGuidance: needsUserIntervention(diagnosticResult),
    severity: diagnosticResult.hasCritical
      ? "critical"
      : diagnosticResult.hasWarning
        ? "warning"
        : "info",
    issues: diagnosticResult.issues.map((issue) => ({
      type: issue.type,
      severity: issue.severity,
      message: issue.message,
      actions: issue.suggestedActions || [],
    })),
    alignment: diagnosticResult.alignment
      ? {
          aligned: diagnosticResult.alignment.aligned,
          driftScore: diagnosticResult.alignment.driftScore,
        }
      : null,
  };
}

module.exports = {
  // 核心类
  SelfDiagnostics,
  IntentTracker,
  DiagnosticRuleEngine,

  // 枚举
  IssueType,
  IssueSeverity,
  IntentCategory,

  // 常量
  DEFAULT_RULES,

  // 辅助函数
  createDiagnosticContext,
  diagnoseStep,
  needsUserIntervention,
  formatForFrontend,
};
