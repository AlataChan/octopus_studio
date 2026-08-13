import React from "react";
import {
  Warning,
  X,
  ArrowRight,
  PauseCircle,
  Lightbulb,
} from "@phosphor-icons/react";
import ModalWrapper from "@/components/ModalWrapper";

/**
 * 诊断问题严重程度对应的样式
 */
const severityStyles = {
  critical: {
    bg: "bg-red-500/10",
    border: "border-red-500/30",
    icon: "text-red-400",
    badge: "bg-red-500/20 text-red-300",
  },
  warning: {
    bg: "bg-yellow-500/10",
    border: "border-yellow-500/30",
    icon: "text-yellow-400",
    badge: "bg-yellow-500/20 text-yellow-300",
  },
  info: {
    bg: "bg-blue-500/10",
    border: "border-blue-500/30",
    icon: "text-blue-400",
    badge: "bg-blue-500/20 text-blue-300",
  },
};

/**
 * 问题类型的中文映射
 */
const issueTypeLabels = {
  data_insufficiency: "数据不足",
  tool_failure: "工具执行失败",
  direction_mismatch: "方向偏离",
  timeout_risk: "超时风险",
  repetition_detected: "重复操作",
};

/**
 * AgentGuidanceDialog - AI 员工需要用户指导时显示的对话框
 * @param {Object} props
 * @param {boolean} props.isOpen - 是否显示对话框
 * @param {Function} props.onClose - 关闭对话框回调
 * @param {Object} props.diagnostics - 诊断结果数据
 * @param {Function} props.onProvideGuidance - 用户提供指导时的回调
 * @param {Function} props.onContinue - 用户选择继续执行时的回调
 */
export default function AgentGuidanceDialog({
  isOpen,
  onClose,
  diagnostics,
  onProvideGuidance,
  onContinue,
}) {
  if (!isOpen || !diagnostics) return null;

  const { issues = [], suggestions = [], healthScore = 100 } = diagnostics;
  const highestSeverity = issues[0]?.severity || "info";
  const styles = severityStyles[highestSeverity] || severityStyles.info;

  return (
    <ModalWrapper isOpen={isOpen}>
      <div className="w-full max-w-lg bg-theme-bg-secondary rounded-lg shadow-xl border border-theme-modal-border overflow-hidden">
        {/* 标题栏 */}
        <div className={`relative p-4 border-b ${styles.border} ${styles.bg}`}>
          <div className="flex items-center gap-3">
            <Warning size={24} weight="fill" className={styles.icon} />
            <h3 className="text-lg font-semibold text-theme-text-primary">
              AI 员工需要您的指导
            </h3>
          </div>
          <button
            onClick={onClose}
            className="absolute top-3 right-3 p-1 rounded-lg hover:bg-white/10 transition-colors"
          >
            <X size={20} className="text-white/60" />
          </button>
        </div>

        {/* 健康分数指示器 */}
        <div className="px-4 pt-4">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-white/60">执行健康度</span>
            <span
              className={
                healthScore < 50
                  ? "text-red-400"
                  : healthScore < 80
                    ? "text-yellow-400"
                    : "text-green-400"
              }
            >
              {healthScore}%
            </span>
          </div>
          <div className="h-2 bg-white/10 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                healthScore < 50
                  ? "bg-red-500"
                  : healthScore < 80
                    ? "bg-yellow-500"
                    : "bg-green-500"
              }`}
              style={{ width: `${healthScore}%` }}
            />
          </div>
        </div>

        {/* 问题列表 */}
        <div className="p-4 space-y-3">
          <h4 className="text-sm font-medium text-white/80 flex items-center gap-2">
            <PauseCircle size={16} />
            发现的问题
          </h4>
          {issues.map((issue, index) => {
            const issueStyles =
              severityStyles[issue.severity] || severityStyles.info;
            return (
              <div
                key={index}
                className={`p-3 rounded-lg ${issueStyles.bg} border ${issueStyles.border}`}
              >
                <div className="flex items-start gap-2">
                  <span
                    className={`text-xs px-2 py-0.5 rounded ${issueStyles.badge}`}
                  >
                    {issueTypeLabels[issue.type] || issue.type}
                  </span>
                </div>
                <p className="mt-2 text-sm text-white/80">{issue.message}</p>
              </div>
            );
          })}
        </div>

        {/* 建议列表 */}
        {suggestions.length > 0 && (
          <div className="px-4 pb-4 space-y-2">
            <h4 className="text-sm font-medium text-white/80 flex items-center gap-2">
              <Lightbulb size={16} className="text-yellow-400" />
              建议操作
            </h4>
            <ul className="space-y-1">
              {suggestions.map((suggestion, index) => (
                <li
                  key={index}
                  className="text-sm text-white/60 flex items-start gap-2"
                >
                  <ArrowRight size={14} className="mt-0.5 flex-shrink-0" />
                  <span>{suggestion}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 操作按钮 */}
        <div className="flex justify-end gap-3 p-4 border-t border-theme-modal-border bg-theme-bg-primary/50">
          <button
            onClick={onContinue}
            className="px-4 py-2 text-sm text-white/70 hover:text-theme-text-primary transition-colors"
          >
            忽略并继续
          </button>
          <button
            onClick={onProvideGuidance}
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-theme-text-primary rounded-lg transition-colors flex items-center gap-2"
          >
            提供指导
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </ModalWrapper>
  );
}
