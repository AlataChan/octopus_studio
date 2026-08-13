import { useEffect, useState } from "react";
import Billing from "@/models/billing";
import { CurrencyCircleDollar, Info } from "@phosphor-icons/react";

/**
 * 定价信息组件
 * 显示各模型组的 Token 定价
 */
export default function PricingInfo() {
  const [pricing, setPricing] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPricing();
  }, []);

  const loadPricing = async () => {
    setLoading(true);
    const res = await Billing.getPricing();
    if (res.success) {
      setPricing(res.data);
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-button"></div>
      </div>
    );
  }

  if (!pricing) {
    return (
      <div className="text-center py-12 text-white/60">
        <p>无法加载定价信息</p>
      </div>
    );
  }

  const groupInfo = {
    premium: {
      label: "高端推理模型",
      description: "适用于复杂推理、代码生成等高级任务",
      color: "border-purple-500/50 bg-purple-500/10",
      headerColor: "bg-purple-500/20 text-purple-400",
    },
    international: {
      label: "国际标准模型",
      description: "适用于日常对话、文档处理等通用任务",
      color: "border-blue-500/50 bg-blue-500/10",
      headerColor: "bg-blue-500/20 text-blue-400",
    },
    domestic: {
      label: "国内高性价比模型",
      description: "适用于中文场景，性价比最高",
      color: "border-green-500/50 bg-green-500/10",
      headerColor: "bg-green-500/20 text-green-400",
    },
  };

  return (
    <div className="space-y-6">
      {/* 说明卡片 */}
      <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 flex items-start gap-x-3">
        <Info className="h-5 w-5 text-blue-400 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-white/80">
          <p className="font-medium text-theme-text-primary mb-1">积分说明</p>
          <p>{pricing.creditUnit}</p>
          <p className="mt-1">
            不同模型组有不同的定价，选择合适的模型可以有效控制成本。
          </p>
        </div>
      </div>

      {/* 定价卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {pricing.tokenPricing &&
          Object.entries(pricing.tokenPricing).map(([group, prices]) => {
            const info = groupInfo[group] || {
              label: group,
              description: "",
              color: "border-gray-500/50 bg-gray-500/10",
              headerColor: "bg-gray-500/20 text-theme-text-secondary",
            };
            return (
              <div
                key={group}
                className={`rounded-lg border ${info.color} overflow-hidden`}
              >
                <div className={`px-4 py-3 ${info.headerColor}`}>
                  <h3 className="font-semibold">{info.label}</h3>
                </div>
                <div className="p-4 space-y-4">
                  <p className="text-sm text-white/60">{info.description}</p>
                  {prices.description && (
                    <p className="text-xs text-white/40">
                      {prices.description}
                    </p>
                  )}
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-white/60">输入 Token</span>
                      <span className="text-theme-text-primary font-mono">
                        {prices.input} 积分/1K
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-white/60">输出 Token</span>
                      <span className="text-theme-text-primary font-mono">
                        {prices.output} 积分/1K
                      </span>
                    </div>
                  </div>
                  <div className="pt-2 border-t border-theme-border text-xs text-white/40">
                    <p>输入: ¥{(prices.input * 0.001).toFixed(4)}/1K tokens</p>
                    <p>输出: ¥{(prices.output * 0.001).toFixed(4)}/1K tokens</p>
                  </div>
                </div>
              </div>
            );
          })}
      </div>

      {/* 模型列表 */}
      {pricing.modelGroups && (
        <div className="bg-theme-bg-primary rounded-lg p-4">
          <h3 className="text-lg font-semibold text-theme-text-primary mb-4">
            支持的模型
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {Object.entries(pricing.modelGroups).map(([model, group]) => {
              const info = groupInfo[group] || {
                headerColor: "bg-gray-500/20 text-theme-text-secondary",
              };
              return (
                <div
                  key={model}
                  className="flex items-center justify-between bg-white/5 rounded px-3 py-2"
                >
                  <span className="text-sm text-theme-text-primary font-mono">
                    {model}
                  </span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded ${info.headerColor}`}
                  >
                    {group}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
