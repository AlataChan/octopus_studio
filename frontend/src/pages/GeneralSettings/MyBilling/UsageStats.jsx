import { ChartPie, Lightning, Coins } from "@phosphor-icons/react";

/**
 * 使用统计组件
 * 显示用户的 Token 消耗统计
 */
export default function UsageStats({ stats }) {
  if (!stats) {
    return (
      <div className="bg-theme-bg-primary rounded-lg p-6 text-center text-white/60">
        <p>暂无使用统计</p>
      </div>
    );
  }

  const modelGroupLabels = {
    premium: {
      label: "高端模型",
      color: "text-purple-400",
      bg: "bg-purple-500/20",
    },
    international: {
      label: "国际模型",
      color: "text-blue-400",
      bg: "bg-blue-500/20",
    },
    domestic: {
      label: "国内模型",
      color: "text-green-400",
      bg: "bg-green-500/20",
    },
  };

  return (
    <div className="bg-theme-bg-primary rounded-lg p-6">
      <div className="flex items-center gap-x-3 mb-6">
        <ChartPie className="h-6 w-6 text-primary-button" />
        <h3 className="text-lg font-semibold text-theme-text-primary">
          使用统计
        </h3>
      </div>

      {/* 总体统计 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard
          icon={<Coins className="h-5 w-5 text-yellow-400" />}
          label="总消耗积分"
          value={stats.totalCredits?.toLocaleString() || 0}
          unit="积分"
        />
        <StatCard
          icon={<Lightning className="h-5 w-5 text-blue-400" />}
          label="调用次数"
          value={stats.callCount?.toLocaleString() || 0}
          unit="次"
        />
        <StatCard
          label="输入 Token"
          value={formatTokens(stats.totalInputTokens || 0)}
          unit=""
        />
        <StatCard
          label="输出 Token"
          value={formatTokens(stats.totalOutputTokens || 0)}
          unit=""
        />
      </div>

      {/* 按模型组统计 */}
      {stats.byModelGroup && Object.keys(stats.byModelGroup).length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-white/60 mb-3">
            按模型组统计
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {Object.entries(stats.byModelGroup).map(([group, data]) => {
              const groupInfo = modelGroupLabels[group] || {
                label: group,
                color: "text-theme-text-secondary",
                bg: "bg-gray-500/20",
              };
              return (
                <div
                  key={group}
                  className={`${groupInfo.bg} rounded-lg p-4 border border-white/5`}
                >
                  <p className={`text-sm font-medium ${groupInfo.color} mb-2`}>
                    {groupInfo.label}
                  </p>
                  <div className="flex justify-between text-theme-text-primary">
                    <span>{data.credits?.toLocaleString() || 0} 积分</span>
                    <span className="text-white/60">{data.calls || 0} 次</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * 统计卡片组件
 */
function StatCard({ icon, label, value, unit }) {
  return (
    <div className="bg-white/5 rounded-lg p-4">
      <div className="flex items-center gap-x-2 mb-2">
        {icon}
        <span className="text-sm text-white/60">{label}</span>
      </div>
      <div className="flex items-baseline gap-x-1">
        <span className="text-2xl font-bold text-theme-text-primary">
          {value}
        </span>
        {unit && <span className="text-white/60">{unit}</span>}
      </div>
    </div>
  );
}

/**
 * 格式化 Token 数量
 */
function formatTokens(tokens) {
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(1)}M`;
  }
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}K`;
  }
  return tokens.toString();
}
