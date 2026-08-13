import React, { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Plug,
  CheckCircle,
  XCircle,
  Spinner,
  FastForward,
} from "@phosphor-icons/react";
import AssistantLibrary from "@/models/assistantLibrary";

/**
 * 步骤 3: 测试连接
 * 测试外部平台的连接是否正常
 *
 * 编辑模式优化：
 * - 如果平台配置未修改，允许跳过测试
 * - 如果平台配置有修改，需要重新测试
 */
export default function StepTestConnection({
  formData,
  testResult,
  setTestResult,
  onNext,
  onBack,
  isEditMode = false,
  isPlatformConfigChanged = () => true, // 默认需要测试
}) {
  const [testing, setTesting] = useState(false);

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);

    try {
      const result = await AssistantLibrary.testConnection({
        platformType: formData.platformType,
        platformConfig: formData.platformConfig,
      });

      setTestResult(result);
    } catch (error) {
      setTestResult({
        success: false,
        message: error.message || "连接测试失败",
      });
    } finally {
      setTesting(false);
    }
  };

  // 内置 Agent 可以跳过
  const isInternalAgent = formData.platformType === "internal";

  // 编辑模式下，如果平台配置未变化，可以跳过测试
  const canSkipInEditMode = isEditMode && !isPlatformConfigChanged();

  // 综合判断：可以跳过的情况
  const canSkip = isInternalAgent || canSkipInEditMode;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-theme-bg-primary rounded-lg p-6 space-y-6">
        <h2 className="text-xl font-semibold text-theme-text-primary mb-4">
          测试连接
        </h2>

        {canSkip ? (
          <div className="text-center py-12">
            {isInternalAgent ? (
              <div className="text-theme-text-secondary mb-4">
                内置 Agent 无需测试连接，可以直接进入下一步。
              </div>
            ) : canSkipInEditMode ? (
              <div className="flex flex-col items-center gap-y-4">
                <FastForward size={48} className="text-green-400" />
                <div className="text-theme-text-secondary mb-2">
                  平台配置未修改，无需重新测试连接。
                </div>
                <p className="text-sm text-theme-text-secondary/70">
                  如需验证连接，仍可点击下方按钮测试
                </p>
                <button
                  onClick={handleTestConnection}
                  className="mt-2 flex items-center gap-x-2 px-4 py-2 bg-theme-bg-secondary hover:bg-theme-bg-container text-theme-text-secondary hover:text-theme-text-primary rounded-lg transition-all duration-300 text-sm border border-theme-border"
                >
                  <Plug size={16} />
                  <span>可选：重新测试连接</span>
                </button>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12">
            {!testResult && !testing && (
              <div className="text-center">
                <p className="text-theme-text-secondary mb-6">
                  点击下方按钮测试与外部平台的连接
                </p>
                <button
                  onClick={handleTestConnection}
                  className="flex items-center gap-x-2 px-6 py-3 bg-blue-500 hover:bg-blue-600 text-theme-text-primary rounded-lg transition-all duration-300 font-medium"
                >
                  <Plug size={20} />
                  <span>测试连接</span>
                </button>
              </div>
            )}

            {testing && (
              <div className="flex flex-col items-center gap-y-4">
                <Spinner
                  size={48}
                  className="text-theme-accent-primary animate-spin"
                />
                <span className="text-theme-text-secondary">
                  正在测试连接...
                </span>
              </div>
            )}

            {testResult && testResult.success && (
              <div className="flex flex-col items-center gap-y-4 text-green-500">
                <CheckCircle size={64} weight="fill" />
                <div className="text-center">
                  <p className="font-semibold text-lg mb-2">连接成功！</p>
                  <p className="text-sm text-theme-text-secondary">
                    {testResult.message || "平台连接正常，可以继续下一步"}
                  </p>
                </div>
                <button
                  onClick={handleTestConnection}
                  className="text-sm text-theme-text-secondary hover:text-theme-text-primary underline"
                >
                  重新测试
                </button>
              </div>
            )}

            {testResult && !testResult.success && (
              <div className="flex flex-col items-center gap-y-4 text-red-500">
                <XCircle size={64} weight="fill" />
                <div className="text-center max-w-md">
                  <p className="font-semibold text-lg mb-2">连接失败</p>
                  <p className="text-sm text-theme-text-secondary mb-4">
                    {testResult.message || "无法连接到平台，请检查配置"}
                  </p>
                  {testResult.error && (
                    <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-left">
                      <p className="text-xs text-theme-text-secondary font-mono">
                        {testResult.error}
                      </p>
                    </div>
                  )}
                </div>
                <div className="flex gap-x-4">
                  <button
                    onClick={onBack}
                    className="text-sm text-theme-text-secondary hover:text-theme-text-primary underline"
                  >
                    返回修改配置
                  </button>
                  <button
                    onClick={handleTestConnection}
                    className="text-sm text-theme-text-secondary hover:text-theme-text-primary underline"
                  >
                    重新测试
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 导航按钮 */}
        <div className="flex justify-between pt-4">
          <button
            onClick={onBack}
            className="flex items-center gap-x-2 px-6 py-2.5 bg-theme-bg-secondary hover:bg-theme-bg-container text-theme-text-primary rounded-lg transition-all duration-300 font-medium border border-theme-border"
          >
            <ArrowLeft size={20} weight="bold" />
            <span>上一步</span>
          </button>
          <button
            onClick={onNext}
            disabled={!canSkip && !testResult?.success}
            className={`flex items-center gap-x-2 px-6 py-2.5 rounded-lg transition-all duration-300 font-medium ${
              canSkip || testResult?.success
                ? "bg-theme-accent-primary hover:bg-theme-accent-primary/90 text-theme-text-primary"
                : "bg-theme-bg-secondary text-theme-text-secondary cursor-not-allowed"
            }`}
          >
            <span>下一步</span>
            <ArrowRight size={20} weight="bold" />
          </button>
        </div>
      </div>
    </div>
  );
}
