import { Database, ArrowClockwise } from "@phosphor-icons/react";
import AISystem from "@/models/aiSystem";
import showToast from "@/utils/toast";

/**
 * 缓存统计面板
 * 显示 Prompt Cache 命中率和统计
 */
export default function CacheStatsPanel({ status, onRefresh }) {
  const cache = status?.cache;

  if (!cache) return null;

  const handleReset = async () => {
    if (!window.confirm("确定要重置缓存统计吗？此操作不可撤销。")) {
      return;
    }
    const result = await AISystem.resetCacheStats();
    if (result.success) {
      showToast("缓存统计已重置", "success");
      onRefresh?.();
    } else {
      showToast(`重置失败: ${result.error}`, "error");
    }
  };

  // 计算命中率
  const stats = cache.stats || {};
  const totalHits = Object.values(stats).reduce(
    (sum, s) => sum + (s.cacheHits || 0),
    0
  );
  const totalCalls = Object.values(stats).reduce(
    (sum, s) => sum + (s.calls || 0),
    0
  );
  const hitRate =
    totalCalls > 0 ? ((totalHits / totalCalls) * 100).toFixed(1) : 0;

  // 计算节省的 Token
  const totalTokensSaved = Object.values(stats).reduce(
    (sum, s) => sum + (s.tokensSaved || 0),
    0
  );

  // 策略名称映射
  const strategyNames = {
    anthropic: "Anthropic",
    deepseek: "DeepSeek",
    none: "无缓存",
  };

  return (
    <div className="bg-theme-bg-primary rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-theme-text-primary flex items-center gap-2">
          <Database className="h-5 w-5" />
          缓存统计
        </h3>
        <button
          onClick={handleReset}
          className="flex items-center gap-1 px-3 py-1 text-xs rounded-lg bg-theme-bg-secondary text-theme-text-secondary hover:bg-theme-bg-tertiary transition-colors"
        >
          <ArrowClockwise className="h-4 w-4" />
          重置统计
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
        <StatCard
          label="缓存状态"
          value={cache.enabled ? "已启用" : "已禁用"}
          color={cache.enabled ? "green" : "gray"}
        />
        <StatCard
          label="当前策略"
          value={strategyNames[cache.strategy] || cache.strategy}
          color="blue"
        />
        <StatCard label="缓存命中率" value={`${hitRate}%`} color="purple" />
        <StatCard
          label="节省 Token"
          value={formatNumber(totalTokensSaved)}
          color="green"
        />
      </div>

      {/* Per-Strategy Stats */}
      {Object.keys(stats).length > 0 && (
        <div className="bg-theme-bg-secondary rounded-lg p-4">
          <p className="text-sm text-theme-text-secondary mb-3">按策略统计:</p>
          <div className="space-y-2">
            {Object.entries(stats).map(([strategy, data]) => (
              <div
                key={strategy}
                className="flex items-center justify-between text-sm"
              >
                <span className="text-theme-text-primary">
                  {strategyNames[strategy] || strategy}
                </span>
                <div className="flex items-center gap-4 text-theme-text-secondary">
                  <span>调用: {data.calls || 0}</span>
                  <span>命中: {data.cacheHits || 0}</span>
                  <span>
                    节省: {formatNumber(data.tokensSaved || 0)} tokens
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * 统计卡片组件
 */
function StatCard({ label, value, color }) {
  const colorClasses = {
    green: "text-green-400",
    blue: "text-blue-400",
    purple: "text-purple-400",
    gray: "text-theme-text-secondary",
  };

  return (
    <div className="bg-theme-bg-secondary rounded-lg p-3">
      <p className="text-xs text-theme-text-secondary">{label}</p>
      <p className={`text-xl font-semibold ${colorClasses[color]}`}>{value}</p>
    </div>
  );
}

/**
 * 格式化数字
 */
function formatNumber(num) {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + "M";
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + "K";
  }
  return num.toString();
}
