import { useState, useEffect } from "react";
import OCR from "@/models/ocr";
import showToast from "@/utils/toast";
import Button from "@/components/Button";
import {
  Eye,
  CloudArrowDown,
  Trash,
  CheckCircle,
  XCircle,
  SpinnerGap,
  Info,
} from "@phosphor-icons/react";

export default function OCRConfig() {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    fetchStatus();
  }, []);

  const fetchStatus = async () => {
    setLoading(true);
    const [statusRes, metricsRes] = await Promise.all([
      OCR.getStatus(),
      OCR.getMetrics(),
    ]);
    setStatus(statusRes);
    setMetrics(metricsRes);
    setLoading(false);
  };

  const handleSetupPaddleOCR = async () => {
    setDownloading(true);
    showToast("正在下载 PaddleOCR 模型（约 400MB）...", "info", {
      autoClose: false,
    });
    const result = await OCR.setupPaddleOCR();
    setDownloading(false);
    if (result.success) {
      showToast(result.message || "模型下载完成！", "success", { clear: true });
      fetchStatus();
    } else {
      showToast(result.error || "下载失败", "error", { clear: true });
    }
  };

  const handleClearCache = async () => {
    setClearing(true);
    const result = await OCR.clearCache();
    setClearing(false);
    if (result.success) {
      showToast("缓存已清空", "success");
      fetchStatus();
    } else {
      showToast(result.error || "清空失败", "error");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <SpinnerGap className="h-8 w-8 animate-spin text-white/60" />
      </div>
    );
  }

  const engines = status?.engines || {};
  const tesseractAvailable = engines.tesseract?.available;
  const paddleStatus = engines.paddleocr || {};
  const paddleAvailable = paddleStatus.available;
  // 兼容后端可能返回的 ready / modelsReady 两种字段
  const paddleModelsReady =
    paddleStatus.modelsReady !== undefined
      ? paddleStatus.modelsReady
      : paddleStatus.ready;

  return (
    <div className="w-full flex flex-col gap-y-6">
      <div className="flex flex-col gap-y-1">
        <h3 className="text-lg font-semibold text-theme-text-primary">
          OCR 引擎配置
        </h3>
        <p className="text-sm text-white/60">
          配置文档识别（OCR）引擎，用于从图片和扫描件中提取文字
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <EngineCard
          name="Tesseract.js"
          description="通用 OCR 引擎，支持 100+ 语言"
          available={tesseractAvailable}
          ready={tesseractAvailable}
          features={["速度快", "多语言支持", "无需额外配置"]}
        />
        <EngineCard
          name="PaddleOCR"
          description="高精度中文 OCR 引擎（证件/票据识别推荐）"
          available={paddleAvailable}
          ready={paddleModelsReady}
          features={["中文识别精度高", "证件/票据优化", "需要下载模型"]}
          action={
            !paddleModelsReady && paddleAvailable ? (
              <Button
                className="mt-3"
                onClick={handleSetupPaddleOCR}
                disabled={downloading}
              >
                {downloading ? (
                  <SpinnerGap className="h-4 w-4 animate-spin" />
                ) : (
                  <CloudArrowDown className="h-4 w-4" />
                )}
                {downloading ? "下载中..." : "下载模型 (~400MB)"}
              </Button>
            ) : null
          }
          notAvailableHint={
            !paddleAvailable
              ? "首次使用需下载模型。请先启动服务后点击下载按钮"
              : null
          }
        />
      </div>

      {metrics?.success && (
        <MetricsPanel metrics={metrics.metrics} cache={metrics.cache} />
      )}

      <div className="flex items-center gap-4 pt-4 border-t border-theme-border">
        <Button
          className="border-transparent bg-theme-settings-input-bg text-theme-text-primary hover:bg-theme-settings-input-bg/80"
          onClick={fetchStatus}
          variant="secondary"
        >
          <Eye className="h-4 w-4" />
          刷新状态
        </Button>
        <Button
          onClick={handleClearCache}
          disabled={clearing}
          loading={clearing}
          variant="danger"
        >
          {!clearing && <Trash className="h-4 w-4" />}
          清空缓存
        </Button>
      </div>
    </div>
  );
}

function EngineCard({
  name,
  description,
  available,
  ready,
  features = [],
  action,
  notAvailableHint,
}) {
  return (
    <div className="p-4 bg-theme-settings-input-bg rounded-lg border border-theme-border">
      <h4 className="text-base font-medium text-theme-text-primary flex items-center gap-2">
        {name}
        {ready ? (
          <CheckCircle className="h-5 w-5 text-green-400" weight="fill" />
        ) : available ? (
          <Info className="h-5 w-5 text-yellow-400" weight="fill" />
        ) : (
          <XCircle className="h-5 w-5 text-red-400" weight="fill" />
        )}
      </h4>
      <p className="text-sm text-white/60 mt-1">{description}</p>
      <ul className="mt-3 space-y-1">
        {features.map((f, i) => (
          <li key={i} className="text-xs text-white/50 flex items-center gap-1">
            <span className="w-1 h-1 bg-white/30 rounded-full" />
            {f}
          </li>
        ))}
      </ul>
      {notAvailableHint && (
        <div className="mt-3 p-2 bg-red-500/10 rounded text-xs text-red-400">
          {notAvailableHint}
        </div>
      )}
      {action}
    </div>
  );
}

function MetricsPanel({ metrics, cache }) {
  return (
    <div className="p-4 bg-theme-settings-input-bg rounded-lg border border-theme-border">
      <h4 className="text-base font-medium text-theme-text-primary mb-3">
        性能指标
      </h4>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
        <div>
          <div className="text-xl font-semibold text-theme-text-primary">
            {metrics?.totalRequests || 0}
          </div>
          <div className="text-xs text-white/50">总请求数</div>
        </div>
        <div>
          <div className="text-xl font-semibold text-theme-text-primary">
            {metrics?.successRate || "0%"}
          </div>
          <div className="text-xs text-white/50">成功率</div>
        </div>
        <div>
          <div className="text-xl font-semibold text-theme-text-primary">
            {(metrics?.avgDurationSec || 0).toFixed(1)}s
          </div>
          <div className="text-xs text-white/50">平均耗时</div>
        </div>
        <div>
          <div className="text-xl font-semibold text-theme-text-primary">
            {cache?.hitRate || "0%"}
          </div>
          <div className="text-xs text-white/50">缓存命中率</div>
        </div>
      </div>
    </div>
  );
}
