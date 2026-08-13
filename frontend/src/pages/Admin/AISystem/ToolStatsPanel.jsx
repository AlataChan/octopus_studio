import { Wrench, TrendUp } from "@phosphor-icons/react";

/**
 * 工具调用统计面板
 * 显示热门工具和调用次数
 */
export default function ToolStatsPanel({ status }) {
  const tools = status?.tools;

  if (!tools) return null;

  const topTools = tools.topTools || [];

  return (
    <div className="bg-theme-bg-primary rounded-lg p-6">
      <h3 className="text-lg font-semibold text-theme-text-primary mb-4 flex items-center gap-2">
        <Wrench className="h-5 w-5" />
        工具调用统计
      </h3>

      {/* Summary */}
      <div className="bg-theme-bg-secondary rounded-lg p-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-sky-500/10 text-sky-400">
            <TrendUp className="h-5 w-5" />
          </div>
          <div>
            <p className="text-2xl font-bold text-theme-text-primary">
              {tools.totalCalls || 0}
            </p>
            <p className="text-xs text-theme-text-secondary">总调用次数</p>
          </div>
        </div>
      </div>

      {/* Top Tools List */}
      {topTools.length > 0 ? (
        <div className="space-y-2">
          <p className="text-sm text-theme-text-secondary mb-2">
            热门工具 (Top 5):
          </p>
          {topTools.map((tool, index) => (
            <ToolRow key={tool.name} tool={tool} rank={index + 1} />
          ))}
        </div>
      ) : (
        <div className="text-center py-8 text-theme-text-secondary">
          <Wrench className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">暂无工具调用记录</p>
        </div>
      )}

      {/* Link to Event Logs */}
      <div className="mt-4 pt-4 border-t border-theme-border">
        <a
          href="/settings/event-logs"
          className="text-sm text-sky-400 hover:text-sky-300 transition-colors"
        >
          查看详细日志 →
        </a>
      </div>
    </div>
  );
}

/**
 * 工具行组件
 */
function ToolRow({ tool, rank }) {
  const successRate =
    tool.calls > 0 ? ((tool.successes / tool.calls) * 100).toFixed(0) : 0;

  const rankColors = {
    1: "bg-yellow-500/20 text-yellow-400",
    2: "bg-gray-400/20 text-theme-text-secondary",
    3: "bg-orange-500/20 text-orange-400",
  };

  return (
    <div className="flex items-center justify-between bg-theme-bg-secondary rounded-lg p-3">
      <div className="flex items-center gap-3">
        <span
          className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold ${
            rankColors[rank] || "bg-theme-bg-tertiary text-theme-text-secondary"
          }`}
        >
          {rank}
        </span>
        <div>
          <p className="text-sm font-medium text-theme-text-primary">
            {tool.name}
          </p>
          <p className="text-xs text-theme-text-secondary">
            成功率: {successRate}%
          </p>
        </div>
      </div>
      <div className="text-right">
        <p className="text-lg font-semibold text-theme-text-primary">
          {tool.calls}
        </p>
        <p className="text-xs text-theme-text-secondary">次调用</p>
      </div>
    </div>
  );
}
