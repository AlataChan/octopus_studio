import { Wallet, ArrowsClockwise, Warning } from "@phosphor-icons/react";

/**
 * 钱包卡片组件
 * 显示用户余额、套餐、累计消费等信息
 */
export default function WalletCard({ wallet, onRefresh }) {
  if (!wallet) {
    return (
      <div className="bg-theme-bg-primary rounded-lg p-6 text-center text-white/60">
        <p>无法加载钱包信息</p>
      </div>
    );
  }

  const isLowBalance =
    wallet.alertThreshold && wallet.balance <= wallet.alertThreshold;

  return (
    <div className="bg-gradient-to-br from-blue-600/20 to-purple-600/20 rounded-lg p-6 border border-theme-border">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-x-3">
          <div className="p-3 bg-blue-500/20 rounded-full">
            <Wallet className="h-6 w-6 text-blue-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-theme-text-primary">
              我的钱包
            </h3>
            <p className="text-sm text-white/60">
              套餐:{" "}
              <span className="text-theme-text-primary">
                {getPlanLabel(wallet.plan)}
              </span>
            </p>
          </div>
        </div>
        <button
          onClick={onRefresh}
          className="p-2 hover:bg-white/10 rounded-full transition-colors"
          title="刷新"
        >
          <ArrowsClockwise className="h-5 w-5 text-white/60" />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* 当前余额 */}
        <div className="bg-white/5 rounded-lg p-4">
          <p className="text-sm text-white/60 mb-1">当前余额</p>
          <div className="flex items-baseline gap-x-2">
            <span
              className={`text-3xl font-bold ${isLowBalance ? "text-red-400" : "text-theme-text-primary"}`}
            >
              {wallet.balance?.toLocaleString() || 0}
            </span>
            <span className="text-white/60">积分</span>
          </div>
          {isLowBalance && (
            <div className="flex items-center gap-x-1 mt-2 text-red-400 text-sm">
              <Warning className="h-4 w-4" />
              <span>余额不足，请及时充值</span>
            </div>
          )}
          <p className="text-xs text-white/40 mt-2">
            ≈ ¥{((wallet.balance || 0) * 0.001).toFixed(2)}
          </p>
        </div>

        {/* 累计消费 */}
        <div className="bg-white/5 rounded-lg p-4">
          <p className="text-sm text-white/60 mb-1">累计消费</p>
          <div className="flex items-baseline gap-x-2">
            <span className="text-3xl font-bold text-theme-text-primary">
              {wallet.totalSpent?.toLocaleString() || 0}
            </span>
            <span className="text-white/60">积分</span>
          </div>
          <p className="text-xs text-white/40 mt-2">
            ≈ ¥{((wallet.totalSpent || 0) * 0.001).toFixed(2)}
          </p>
        </div>

        {/* 预警阈值 */}
        <div className="bg-white/5 rounded-lg p-4">
          <p className="text-sm text-white/60 mb-1">预警阈值</p>
          <div className="flex items-baseline gap-x-2">
            <span className="text-3xl font-bold text-theme-text-primary">
              {wallet.alertThreshold?.toLocaleString() || 1000}
            </span>
            <span className="text-white/60">积分</span>
          </div>
          <p className="text-xs text-white/40 mt-2">余额低于此值时将收到提醒</p>
        </div>
      </div>
    </div>
  );
}

/**
 * 获取套餐标签
 */
function getPlanLabel(plan) {
  const labels = {
    free: "免费版",
    basic: "基础版",
    pro: "专业版",
    enterprise: "企业版",
  };
  return labels[plan] || plan || "免费版";
}
