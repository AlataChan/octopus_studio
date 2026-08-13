import { Brain, Cloud, Database, Cpu } from "@phosphor-icons/react";

/**
 * 系统概览组件
 * 显示当前 Provider、地区、可用状态
 */
export default function SystemOverview({ status }) {
  if (!status) return null;

  const { provider } = status;

  // Provider 名称映射
  const providerNames = {
    deepseek: "DeepSeek",
    anthropic: "Claude (Anthropic)",
    openai: "OpenAI",
    ollama: "Ollama (本地)",
    "azure-openai": "Azure OpenAI",
  };

  // 地区名称映射
  const regionNames = {
    CN: "中国大陆",
    GLOBAL: "海外",
    AUTO: "自动检测",
  };

  return (
    <div className="bg-theme-bg-primary rounded-lg p-6">
      <h3 className="text-lg font-semibold text-theme-text-primary mb-4 flex items-center gap-2">
        <Cpu className="h-5 w-5" />
        系统概览
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 当前 Provider */}
        <StatusCard
          icon={<Brain className="h-5 w-5" />}
          label="当前 Provider"
          value={
            providerNames[provider?.current] || provider?.current || "未配置"
          }
          color="blue"
        />

        {/* 部署地区 */}
        <StatusCard
          icon={<Cloud className="h-5 w-5" />}
          label="部署地区"
          value={regionNames[provider?.region] || provider?.region || "未知"}
          color="green"
        />

        {/* 默认 Provider */}
        <StatusCard
          icon={<Database className="h-5 w-5" />}
          label="默认 Provider"
          value={
            providerNames[provider?.default] || provider?.default || "未配置"
          }
          color="gray"
          subText="成本优先"
        />

        {/* Premium Provider */}
        <StatusCard
          icon={<Brain className="h-5 w-5" />}
          label="Premium Provider"
          value={
            providerNames[provider?.premium] || provider?.premium || "未配置"
          }
          color="purple"
          subText="质量优先"
        />
      </div>

      {/* 可用 Provider 列表 */}
      <div className="mt-4 pt-4 border-t border-theme-border">
        <p className="text-sm text-theme-text-secondary mb-2">可用 Provider:</p>
        <div className="flex flex-wrap gap-2">
          {Object.entries(provider?.available || {}).map(
            ([name, available]) => (
              <span
                key={name}
                className={`px-3 py-1 rounded-full text-xs font-medium ${
                  available
                    ? "bg-green-500/20 text-green-400"
                    : "bg-gray-500/20 text-theme-text-secondary"
                }`}
              >
                {providerNames[name] || name} {available ? "✓" : "✗"}
              </span>
            )
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * 状态卡片组件
 */
function StatusCard({ icon, label, value, color, subText }) {
  const colorClasses = {
    blue: "bg-blue-500/10 text-blue-400",
    green: "bg-green-500/10 text-green-400",
    purple: "bg-purple-500/10 text-purple-400",
    gray: "bg-gray-500/10 text-theme-text-secondary",
  };

  return (
    <div className="bg-theme-bg-secondary rounded-lg p-4">
      <div className={`inline-flex p-2 rounded-lg ${colorClasses[color]} mb-2`}>
        {icon}
      </div>
      <p className="text-xs text-theme-text-secondary">{label}</p>
      <p className="text-lg font-semibold text-theme-text-primary">{value}</p>
      {subText && (
        <p className="text-xs text-theme-text-secondary mt-1">{subText}</p>
      )}
    </div>
  );
}
