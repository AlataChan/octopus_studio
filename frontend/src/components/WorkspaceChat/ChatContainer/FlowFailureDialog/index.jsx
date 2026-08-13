import React from "react";
import {
  Warning,
  ArrowClockwise,
  FastForward,
  Stop,
  Info,
} from "@phosphor-icons/react";

/**
 * Flow 失败对话框组件
 *
 * Phase I: Flow 错误恢复 - 用户交互界面
 * 当 Flow 步骤执行失败时，显示对话框让用户选择：
 * - 重试：重新执行失败的步骤
 * - 跳过：跳过失败步骤，继续执行后续步骤
 * - 中止：停止整个 Flow 执行
 */
export default function FlowFailureDialog({ failureData, onRespond }) {
  if (!failureData) return null;

  const {
    flowName,
    stepLabel,
    stepIndex,
    totalSteps,
    errorMessage,
    canRetry = true,
    canSkip = true,
    checkpointId,
  } = failureData;

  const handleChoice = (choice) => {
    // 发送用户选择到后端
    if (window.__flowFailureResponder) {
      window.__flowFailureResponder(choice, checkpointId);
    }
    onRespond(choice);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-theme-bg-secondary border border-zinc-600 rounded-xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
        {/* 标题栏 */}
        <div className="flex items-center gap-3 px-5 py-4 bg-red-500/10 border-b border-theme-modal-border">
          <Warning className="w-6 h-6 text-red-400" weight="fill" />
          <h3 className="text-lg font-semibold text-theme-text-primary">
            Flow 执行失败
          </h3>
        </div>

        {/* 内容区 */}
        <div className="px-5 py-4 space-y-4">
          {/* Flow 信息 */}
          <div className="flex items-center gap-2 text-sm text-theme-text-secondary">
            <Info className="w-4 h-4" />
            <span>
              {flowName} · 步骤 {stepIndex}/{totalSteps}
            </span>
          </div>

          {/* 失败步骤 */}
          <div className="bg-zinc-900/50 rounded-lg p-3">
            <p className="text-sm text-theme-text-secondary mb-1">失败步骤：</p>
            <p className="text-theme-text-primary font-medium">{stepLabel}</p>
          </div>

          {/* 错误信息 */}
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
            <p className="text-sm text-red-300 mb-1">错误信息：</p>
            <p className="text-red-200 text-sm font-mono break-all">
              {errorMessage || "未知错误"}
            </p>
          </div>

          {/* 检查点信息 */}
          {checkpointId && (
            <div className="flex items-center gap-2 text-xs text-zinc-500">
              <span>检查点 ID: {checkpointId.slice(0, 8)}...</span>
            </div>
          )}
        </div>

        {/* 操作按钮 */}
        <div className="px-5 py-4 bg-zinc-900/30 border-t border-theme-modal-border flex gap-3">
          {canRetry && (
            <button
              onClick={() => handleChoice("retry")}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-500 hover:bg-blue-600 text-theme-text-primary rounded-lg transition-colors"
            >
              <ArrowClockwise className="w-4 h-4" />
              <span>重试</span>
            </button>
          )}

          {canSkip && (
            <button
              onClick={() => handleChoice("skip")}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-yellow-600 hover:bg-yellow-700 text-theme-text-primary rounded-lg transition-colors"
            >
              <FastForward className="w-4 h-4" />
              <span>跳过</span>
            </button>
          )}

          <button
            onClick={() => handleChoice("abort")}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-zinc-600 hover:bg-zinc-700 text-theme-text-primary rounded-lg transition-colors"
          >
            <Stop className="w-4 h-4" />
            <span>中止</span>
          </button>
        </div>
      </div>
    </div>
  );
}
