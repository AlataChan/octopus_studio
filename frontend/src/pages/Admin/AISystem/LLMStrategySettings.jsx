import { useState } from "react";
import { Gear, Lightning, Coins, Sparkle } from "@phosphor-icons/react";

/**
 * LLM 策略设置组件
 * 配置成本优先/智能平衡/质量优先
 */
export default function LLMStrategySettings({ status, onUpdate }) {
  const [saving, setSaving] = useState(false);
  const [strategy, setStrategy] = useState(
    status?.settings?.llmStrategy || "balanced"
  );
  const [enhancedIntelligence, setEnhancedIntelligence] = useState(
    status?.settings?.enhancedIntelligence || false
  );

  const strategies = [
    {
      id: "cost",
      name: "成本优先",
      description: "始终使用 DeepSeek，最低成本",
      icon: <Coins className="h-5 w-5" />,
      color: "green",
    },
    {
      id: "balanced",
      name: "智能平衡",
      description: "海外自动使用 Claude（推荐）",
      icon: <Gear className="h-5 w-5" />,
      color: "blue",
      recommended: true,
    },
    {
      id: "quality",
      name: "质量优先",
      description: "始终使用 Claude，最佳效果",
      icon: <Sparkle className="h-5 w-5" />,
      color: "purple",
    },
  ];

  const handleSave = async () => {
    setSaving(true);
    await onUpdate({
      llmStrategy: strategy,
      enhancedIntelligence,
    });
    setSaving(false);
  };

  const hasChanges =
    strategy !== (status?.settings?.llmStrategy || "balanced") ||
    enhancedIntelligence !== (status?.settings?.enhancedIntelligence || false);

  return (
    <div className="bg-theme-bg-primary rounded-lg p-6">
      <h3 className="text-lg font-semibold text-theme-text-primary mb-4 flex items-center gap-2">
        <Gear className="h-5 w-5" />
        LLM 策略配置
      </h3>

      {/* Strategy Selection */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {strategies.map((s) => (
          <StrategyCard
            key={s.id}
            strategy={s}
            selected={strategy === s.id}
            onSelect={() => setStrategy(s.id)}
          />
        ))}
      </div>

      {/* Enhanced Intelligence Toggle */}
      <div className="bg-theme-bg-secondary rounded-lg p-4 mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-yellow-500/10 text-yellow-400">
              <Lightning className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-medium text-theme-text-primary">
                提升智能（全局开关）
              </p>
              <p className="text-xs text-theme-text-secondary">
                启用后所有 Workspace 使用 Claude，优先级高于策略配置
              </p>
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={enhancedIntelligence}
              onChange={(e) => setEnhancedIntelligence(e.target.checked)}
            />
            <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-sky-500"></div>
          </label>
        </div>
      </div>

      {/* Save Button */}
      {hasChanges && (
        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-sky-500 text-theme-text-primary rounded-lg text-sm font-medium hover:bg-sky-600 transition-colors disabled:opacity-50"
          >
            {saving ? "保存中..." : "保存设置"}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * 策略卡片组件
 */
function StrategyCard({ strategy, selected, onSelect }) {
  const colorClasses = {
    green: "border-green-500 bg-green-500/10",
    blue: "border-blue-500 bg-blue-500/10",
    purple: "border-purple-500 bg-purple-500/10",
  };

  const iconColorClasses = {
    green: "bg-green-500/20 text-green-400",
    blue: "bg-blue-500/20 text-blue-400",
    purple: "bg-purple-500/20 text-purple-400",
  };

  return (
    <button
      onClick={onSelect}
      className={`p-4 rounded-lg border-2 text-left transition-all ${
        selected
          ? colorClasses[strategy.color]
          : "border-transparent bg-theme-bg-secondary hover:bg-theme-bg-tertiary"
      }`}
    >
      <div
        className={`inline-flex p-2 rounded-lg ${iconColorClasses[strategy.color]} mb-2`}
      >
        {strategy.icon}
      </div>
      <p className="font-medium text-theme-text-primary flex items-center gap-2">
        {strategy.name}
        {strategy.recommended && (
          <span className="text-xs px-2 py-0.5 rounded bg-sky-500/20 text-sky-400">
            推荐
          </span>
        )}
      </p>
      <p className="text-xs text-theme-text-secondary mt-1">
        {strategy.description}
      </p>
    </button>
  );
}
