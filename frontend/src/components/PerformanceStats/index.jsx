import { useState, useEffect } from "react";
import {
  ChartLine,
  TrendUp,
  TrendDown,
  Clock,
  CheckCircle,
  XCircle,
  Wrench,
} from "@phosphor-icons/react";
import AITeam from "@/models/aiTeam";

const ACCENT_TONE_CLASSES =
  "bg-[var(--theme-accent-soft)] text-[var(--theme-accent-primary)] border-[var(--theme-accent-border-soft)]";

/**
 * AI 员工性能统计卡片组件
 * @param {Object} props
 * @param {string} props.workspaceSlug - Workspace slug
 * @param {string} [props.assistantId] - 可选，筛选特定助手
 */
export default function PerformanceStats({ workspaceSlug, assistantId }) {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [period, setPeriod] = useState("7d");

  useEffect(() => {
    fetchStats();
  }, [workspaceSlug, assistantId, period]);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const res = await AITeam.getPerformance(workspaceSlug, {
        period,
        assistantId,
      });
      if (res.success) {
        setStats(res.data);
      }
    } catch (error) {
      console.error("Error fetching performance stats:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-theme-bg-secondary border border-theme-sidebar-border rounded-xl p-6 animate-pulse">
        <div className="h-6 bg-[var(--theme-button-sidebar-bg)] rounded w-1/3 mb-4"></div>
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-20 bg-[var(--theme-button-sidebar-bg)] rounded"
            ></div>
          ))}
        </div>
      </div>
    );
  }

  if (!stats) {
    return null;
  }

  const { summary, topTools } = stats;

  return (
    <div className="bg-theme-bg-secondary border border-theme-sidebar-border rounded-xl p-6">
      {/* 标题和周期选择 */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-theme-text-primary flex items-center gap-2">
          <ChartLine size={24} className="text-[var(--theme-accent-primary)]" />
          性能统计
        </h2>
        <div className="flex gap-2">
          {["24h", "7d", "30d"].map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1 rounded text-sm transition-colors ${
                period === p
                  ? "bg-primary-button text-[var(--theme-button-primary-text)]"
                  : "bg-[var(--theme-button-sidebar-bg)] text-theme-text-secondary hover:bg-[var(--theme-button-sidebar-hover-bg)] hover:text-theme-text-primary"
              }`}
            >
              {p === "24h" ? "24小时" : p === "7d" ? "7天" : "30天"}
            </button>
          ))}
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <MiniStatCard
          icon={<Clock size={20} />}
          label="总调用次数"
          value={summary.total}
          color="blue"
        />
        <MiniStatCard
          icon={<CheckCircle size={20} />}
          label="成功次数"
          value={summary.successful}
          color="green"
        />
        <MiniStatCard
          icon={<XCircle size={20} />}
          label="失败次数"
          value={summary.failed}
          color="red"
        />
        <MiniStatCard
          icon={
            summary.successRate >= 0.8 ? (
              <TrendUp size={20} />
            ) : (
              <TrendDown size={20} />
            )
          }
          label="成功率"
          value={`${(summary.successRate * 100).toFixed(0)}%`}
          color={
            summary.successRate >= 0.8
              ? "green"
              : summary.successRate >= 0.5
                ? "amber"
                : "red"
          }
        />
      </div>

      {/* 热门工具 */}
      {topTools && topTools.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-theme-text-secondary mb-3 flex items-center gap-2">
            <Wrench size={16} />
            热门工具
          </h3>
          <div className="space-y-2">
            {topTools.slice(0, 5).map((tool, index) => (
              <ToolStatRow key={tool.tool_name} tool={tool} rank={index + 1} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * 迷你统计卡片
 */
function MiniStatCard({ icon, label, value, color }) {
  const colorClasses = {
    blue: ACCENT_TONE_CLASSES,
    green: "bg-green-500/10 text-green-400 border-green-500/20",
    red: "bg-red-500/10 text-red-400 border-red-500/20",
    amber: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  };

  return (
    <div
      className={`rounded-lg p-4 border bg-theme-bg-primary ${colorClasses[color]}`}
    >
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-xs text-theme-text-secondary">{label}</span>
      </div>
      <div className="text-2xl font-bold text-theme-text-primary">{value}</div>
    </div>
  );
}

/**
 * 工具统计行
 */
function ToolStatRow({ tool, rank }) {
  const successRate = tool.success_rate * 100;

  return (
    <div className="flex items-center justify-between bg-theme-bg-primary border border-theme-sidebar-border rounded px-3 py-2">
      <div className="flex items-center gap-3">
        <span className="text-xs text-theme-text-secondary w-4">{rank}</span>
        <span className="text-sm text-theme-text-primary font-mono">
          {tool.tool_name}
        </span>
      </div>
      <div className="flex items-center gap-4 text-xs">
        <span className="text-theme-text-secondary">{tool.total_calls} 次</span>
        <span
          className={
            successRate >= 80
              ? "text-green-400"
              : successRate >= 50
                ? "text-amber-400"
                : "text-red-400"
          }
        >
          {successRate.toFixed(0)}%
        </span>
        <span className="text-theme-text-secondary">
          {tool.avg_duration_ms}ms
        </span>
      </div>
    </div>
  );
}
