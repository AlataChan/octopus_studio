/**
 * ImageGenerationPanel - 图像生成面板
 *
 * 提供:
 * - 提示词输入
 * - 参数设置（尺寸、Provider、模型）
 * - 生成进度显示
 * - 结果预览
 */

import React, { useState, useCallback, useEffect, useMemo } from "react";
import {
  ArrowClockwise,
  Sparkle,
  SpinnerGap,
  X,
  GearSix,
  CaretDown,
  CaretUp,
  CheckCircle,
  ClockCounterClockwise,
  Image as ImageIcon,
  DownloadSimple,
  Copy,
  Check,
  WarningCircle,
} from "@phosphor-icons/react";
import { useImageCanvas } from "./ImageCanvasContext";

// 预设尺寸
const SIZE_PRESETS = [
  { label: "1:1 方形", width: 1024, height: 1024 },
  { label: "16:9 横版", width: 1792, height: 1024 },
  { label: "9:16 竖版", width: 1024, height: 1792 },
  { label: "4:3 横版", width: 1344, height: 1024 },
  { label: "3:4 竖版", width: 1024, height: 1344 },
];

export default function ImageGenerationPanel({ onClose }) {
  const {
    providers,
    generating,
    generationProgress,
    generatedImageUrl,
    generateImage,
    cancelGeneration,
    error,
    jobs,
    jobsLoading,
    jobsError,
    refreshJobs,
    previewJobOutput,
  } = useImageCanvas();

  // 表单状态
  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [selectedSize, setSelectedSize] = useState(SIZE_PRESETS[0]);
  const [selectedProvider, setSelectedProvider] = useState("");
  const [selectedModel, setSelectedModel] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showAllJobs, setShowAllJobs] = useState(false);
  const collapsedJobCount = 3;

  // 可用的 Provider 列表
  const availableProviders = useMemo(() => {
    return Object.entries(providers)
      .filter(([, info]) => info.available && info.capabilities?.t2i)
      .map(([name, info]) => ({
        value: name,
        label: name.charAt(0).toUpperCase() + name.slice(1),
        models: info.models || [],
      }));
  }, [providers]);

  const effectiveProvider = useMemo(() => {
    if (selectedProvider) return selectedProvider;
    if (availableProviders.length === 1) return availableProviders[0]?.value;
    return "";
  }, [availableProviders, selectedProvider]);

  const effectiveProviderModels = useMemo(() => {
    if (!effectiveProvider) return [];
    const providerInfo = availableProviders.find(
      (p) => p.value === effectiveProvider
    );
    return providerInfo?.models || [];
  }, [availableProviders, effectiveProvider]);

  // Provider 变化时重置模型选择
  useEffect(() => {
    setSelectedModel("");
  }, [effectiveProvider]);

  // Ensure jobs are up-to-date when opening the panel.
  useEffect(() => {
    refreshJobs?.();
  }, [refreshJobs]);

  // 处理生成
  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) return;

    await generateImage({
      prompt: prompt.trim(),
      negativePrompt: negativePrompt.trim() || undefined,
      width: selectedSize.width,
      height: selectedSize.height,
      provider: effectiveProvider || undefined,
      model: effectiveProvider ? selectedModel || undefined : undefined,
    });
  }, [
    prompt,
    negativePrompt,
    selectedSize,
    effectiveProvider,
    selectedModel,
    generateImage,
  ]);

  // 复制图像 URL
  const handleCopyUrl = useCallback(() => {
    if (!generatedImageUrl) return;
    navigator.clipboard.writeText(generatedImageUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [generatedImageUrl]);

  // 下载图像
  const handleDownload = useCallback(() => {
    if (!generatedImageUrl) return;
    const link = document.createElement("a");
    link.href = generatedImageUrl;
    link.download = `generated-${Date.now()}.png`;
    link.click();
  }, [generatedImageUrl]);

  return (
    <div className="flex flex-col h-full bg-theme-bg-secondary">
      {/* 头部 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-theme-sidebar-border">
        <div className="flex items-center gap-2">
          <Sparkle className="w-5 h-5 text-theme-text-primary" weight="fill" />
          <h2 className="text-lg font-medium text-theme-text-primary">
            图像生成
          </h2>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-theme-bg-hover text-theme-text-secondary"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* 提示词输入 */}
        <div>
          <label className="block text-sm font-medium text-theme-text-primary mb-2">
            提示词
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="描述你想要生成的图像..."
            className="w-full h-24 px-3 py-2 rounded-lg border border-theme-sidebar-border bg-theme-bg-primary text-theme-text-primary placeholder:text-theme-text-secondary resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={generating}
          />
        </div>

        {/* 尺寸选择 */}
        <div>
          <label className="block text-sm font-medium text-theme-text-primary mb-2">
            尺寸
          </label>
          <div className="flex flex-wrap gap-2">
            {SIZE_PRESETS.map((size) => (
              <button
                key={size.label}
                onClick={() => setSelectedSize(size)}
                disabled={generating}
                className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                  selectedSize.label === size.label
                    ? "bg-blue-500 text-theme-text-primary"
                    : "bg-theme-bg-primary border border-theme-sidebar-border text-theme-text-primary hover:bg-theme-bg-hover"
                }`}
              >
                {size.label}
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-theme-text-secondary">
            {selectedSize.width} × {selectedSize.height}
          </p>
        </div>

        {/* 高级设置 */}
        <div>
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-1 text-sm text-theme-text-secondary hover:text-theme-text-primary"
          >
            <GearSix className="w-4 h-4" />
            高级设置
            {showAdvanced ? (
              <CaretUp className="w-4 h-4" />
            ) : (
              <CaretDown className="w-4 h-4" />
            )}
          </button>

          {showAdvanced && (
            <div className="mt-3 space-y-3 pl-5">
              {/* 负面提示词 */}
              <div>
                <label className="block text-sm text-theme-text-secondary mb-1">
                  负面提示词
                </label>
                <textarea
                  value={negativePrompt}
                  onChange={(e) => setNegativePrompt(e.target.value)}
                  placeholder="不希望出现的内容..."
                  className="w-full h-16 px-3 py-2 rounded-lg border border-theme-sidebar-border bg-theme-bg-primary text-theme-text-primary placeholder:text-theme-text-secondary resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  disabled={generating}
                />
              </div>

              {/* Provider 选择 */}
              {availableProviders.length > 1 && (
                <div>
                  <label className="block text-sm text-theme-text-secondary mb-1">
                    Provider
                  </label>
                  <select
                    value={selectedProvider}
                    onChange={(e) => setSelectedProvider(e.target.value)}
                    disabled={generating}
                    className="w-full px-3 py-2 rounded-lg border border-theme-sidebar-border bg-theme-bg-primary text-theme-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  >
                    <option value="">自动选择</option>
                    {availableProviders.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* 模型选择（仅在明确选择 Provider 或只有一个 Provider 时可用） */}
              {effectiveProvider && effectiveProviderModels.length > 0 && (
                <div>
                  <label className="block text-sm text-theme-text-secondary mb-1">
                    Model
                  </label>
                  <select
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    disabled={generating}
                    className="w-full px-3 py-2 rounded-lg border border-theme-sidebar-border bg-theme-bg-primary text-theme-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  >
                    <option value="">默认模型</option>
                    {effectiveProviderModels.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name || m.id}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-theme-text-secondary">
                    当前 Provider: {effectiveProvider}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-sm">
            {error}
          </div>
        )}

        {/* 生成进度 */}
        {generating && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-theme-text-secondary">
              <SpinnerGap className="w-4 h-4 animate-spin" />
              生成中...
            </div>
            <div className="h-2 bg-theme-bg-primary rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all duration-300"
                style={{ width: `${generationProgress}%` }}
              />
            </div>
            <button
              onClick={cancelGeneration}
              className="text-xs text-red-500 hover:text-red-400"
            >
              取消生成
            </button>
          </div>
        )}

        {/* 生成结果预览 */}
        {generatedImageUrl && !generating && (
          <div className="space-y-2">
            <label className="block text-sm font-medium text-theme-text-primary">
              生成结果
            </label>
            <div className="relative group rounded-lg overflow-hidden border border-theme-sidebar-border">
              <img
                src={generatedImageUrl}
                alt="Generated"
                className="w-full h-auto"
              />
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                <button
                  onClick={handleDownload}
                  className="p-2 rounded-lg bg-white/20 hover:bg-white/30 text-theme-text-primary"
                  title="下载"
                >
                  <DownloadSimple className="w-5 h-5" />
                </button>
                <button
                  onClick={handleCopyUrl}
                  className="p-2 rounded-lg bg-white/20 hover:bg-white/30 text-theme-text-primary"
                  title="复制链接"
                >
                  {copied ? (
                    <Check className="w-5 h-5" />
                  ) : (
                    <Copy className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 历史任务 */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium text-theme-text-primary">
              历史任务
            </label>
            <div className="flex items-center gap-2">
              {jobs?.length > collapsedJobCount && (
                <button
                  onClick={() => setShowAllJobs((v) => !v)}
                  className="text-xs text-theme-text-secondary hover:text-theme-text-primary"
                >
                  {showAllJobs ? "收起" : "展开"}
                </button>
              )}
              <button
                onClick={() => refreshJobs?.()}
                className="flex items-center gap-1 text-xs text-theme-text-secondary hover:text-theme-text-primary"
                disabled={jobsLoading}
              >
                <ArrowClockwise className="w-3 h-3" />
                刷新
              </button>
            </div>
          </div>

          {jobsLoading ? (
            <div className="text-theme-text-secondary text-sm flex items-center gap-2">
              <SpinnerGap className="w-4 h-4 animate-spin" />
              加载中...
            </div>
          ) : jobsError ? (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-sm">
              {jobsError}
            </div>
          ) : !jobs || jobs.length === 0 ? (
            <div className="text-theme-text-secondary text-sm">
              暂无历史任务。
            </div>
          ) : (
            <div
              className={`${showAllJobs ? "max-h-[260px] overflow-y-auto pr-1" : ""} space-y-2`}
            >
              {(showAllJobs ? jobs : jobs.slice(0, collapsedJobCount)).map(
                (job) => (
                  <JobRow
                    key={job.id}
                    job={job}
                    onPreview={() => previewJobOutput?.(job)}
                  />
                )
              )}
            </div>
          )}
        </div>
      </div>

      {/* 底部按钮 */}
      <div className="p-4 border-t border-theme-sidebar-border">
        <button
          onClick={handleGenerate}
          disabled={generating || !prompt.trim()}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-500 hover:bg-blue-600 disabled:bg-blue-500/50 text-theme-text-primary font-medium transition-colors"
        >
          {generating ? (
            <>
              <SpinnerGap className="w-5 h-5 animate-spin" />
              生成中...
            </>
          ) : (
            <>
              <Sparkle className="w-5 h-5" weight="fill" />
              生成图像
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function JobRow({ job, onPreview }) {
  const status = job?.status || "unknown";
  const isCompleted = status === "completed";
  const isFailed = status === "failed";
  const isRunning = status === "running" || status === "pending";

  const prompt = job?.params?.prompt || "";
  const canPreview = isCompleted && !!job?.outputAssetId;

  const icon = isCompleted ? (
    <CheckCircle className="w-4 h-4 text-green-500" weight="fill" />
  ) : isFailed ? (
    <WarningCircle className="w-4 h-4 text-red-500" weight="fill" />
  ) : (
    <ClockCounterClockwise
      className={`w-4 h-4 text-theme-text-secondary ${isRunning ? "animate-spin" : ""}`}
      weight="fill"
    />
  );

  return (
    <button
      onClick={onPreview}
      disabled={!canPreview}
      className={`w-full flex items-center gap-2 p-3 rounded-lg border text-left ${
        canPreview
          ? "border-theme-sidebar-border bg-theme-bg-primary hover:bg-theme-bg-hover"
          : "border-theme-sidebar-border bg-theme-bg-primary opacity-60 cursor-not-allowed"
      }`}
      title={canPreview ? "点击预览生成结果" : "该任务暂无可预览输出"}
    >
      <div className="flex-shrink-0">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-sm text-theme-text-primary truncate">
          {prompt || `Job ${job.id?.slice(0, 8)}`}
        </div>
        <div className="text-xs text-theme-text-secondary truncate">
          {status}
          {typeof job?.progress === "number" ? ` · ${job.progress}%` : ""}
        </div>
      </div>
    </button>
  );
}
