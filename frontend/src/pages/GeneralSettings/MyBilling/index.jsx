import { useEffect, useState } from "react";
import Sidebar from "@/components/SettingsSidebar";
import { isMobile } from "react-device-detect";
import Billing from "@/models/billing";
import {
  Wallet,
  ChartLine,
  Receipt,
  CurrencyCircleDollar,
} from "@phosphor-icons/react";
import WalletCard from "./WalletCard";
import UsageStats from "./UsageStats";
import UsageHistory from "./UsageHistory";
import PricingInfo from "./PricingInfo";

/**
 * 用户自助计费查询页面 - V1.5
 * 允许所有用户查看自己的余额、使用记录、账单明细
 */
export default function MyBilling() {
  const [activeTab, setActiveTab] = useState("overview");
  const [wallet, setWallet] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [walletRes, statsRes] = await Promise.all([
        Billing.getMyWallet(),
        Billing.getMyStats(),
      ]);
      if (walletRes.success) setWallet(walletRes.data);
      if (statsRes.success) setStats(statsRes.data);
    } catch (e) {
      console.error("Failed to load billing data:", e);
    }
    setLoading(false);
  };

  const tabs = [
    { id: "overview", label: "概览", icon: <Wallet className="h-5 w-5" /> },
    { id: "usage", label: "使用记录", icon: <ChartLine className="h-5 w-5" /> },
    { id: "topups", label: "充值记录", icon: <Receipt className="h-5 w-5" /> },
    {
      id: "pricing",
      label: "定价说明",
      icon: <CurrencyCircleDollar className="h-5 w-5" />,
    },
  ];

  return (
    <div className="w-screen h-screen overflow-hidden bg-page-texture flex">
      <Sidebar />
      <div
        style={{ height: isMobile ? "100%" : "calc(100% - 32px)" }}
        className="relative z-[1] md:ml-[2px] md:mr-[16px] md:my-[16px] md:rounded-[16px] bg-theme-bg-secondary w-full h-full overflow-y-scroll p-4 md:p-0"
      >
        <div className="flex flex-col w-full px-1 md:pl-6 md:pr-[50px] md:py-6 py-16">
          {/* 页面标题 */}
          <div className="w-full flex flex-col gap-y-1 pb-6 border-theme-border border-b-2">
            <div className="items-center flex gap-x-4">
              <p className="text-lg leading-6 font-bold text-theme-text-primary">
                我的账单
              </p>
            </div>
            <p className="text-xs leading-[18px] font-base text-theme-text-secondary mt-2">
              查看您的账户余额、使用记录和充值历史
            </p>
          </div>

          {/* Tab 导航 */}
          <div className="flex gap-x-4 mt-6 border-b border-theme-border pb-2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-x-2 px-4 py-2 rounded-t-lg transition-all ${
                  activeTab === tab.id
                    ? "bg-theme-bg-primary text-theme-text-primary border-b-2 border-primary-button"
                    : "text-white/60 hover:text-theme-text-primary hover:bg-white/5"
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Tab 内容 */}
          <div className="mt-6">
            {loading ? (
              <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-button"></div>
              </div>
            ) : (
              <>
                {activeTab === "overview" && (
                  <div className="space-y-6">
                    <WalletCard wallet={wallet} onRefresh={loadData} />
                    <UsageStats stats={stats} />
                  </div>
                )}
                {activeTab === "usage" && <UsageHistory />}
                {activeTab === "topups" && <TopupHistory />}
                {activeTab === "pricing" && <PricingInfo />}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * 充值记录组件
 */
function TopupHistory() {
  const [topups, setTopups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page] = useState(1);

  useEffect(() => {
    loadTopups();
  }, [page]);

  const loadTopups = async () => {
    setLoading(true);
    const res = await Billing.getMyTopups({ page, limit: 20 });
    if (res.success) {
      setTopups(res.data.topups || []);
      setTotal(res.data.total || 0);
    }
    setLoading(false);
  };

  const methodLabels = {
    bank_transfer: "银行转账",
    alipay: "支付宝",
    wechat: "微信支付",
    admin_grant: "管理员赠送",
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-button"></div>
      </div>
    );
  }

  if (topups.length === 0) {
    return (
      <div className="text-center py-12 text-white/60">
        <Receipt className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p>暂无充值记录</p>
      </div>
    );
  }

  return (
    <div className="bg-theme-bg-primary rounded-lg p-4">
      <table className="w-full">
        <thead>
          <tr className="text-left text-white/60 text-sm border-b border-theme-border">
            <th className="pb-3">时间</th>
            <th className="pb-3">金额</th>
            <th className="pb-3">方式</th>
            <th className="pb-3">备注</th>
          </tr>
        </thead>
        <tbody>
          {topups.map((topup) => (
            <tr
              key={topup.id}
              className="border-b border-white/5 text-theme-text-primary"
            >
              <td className="py-3">
                {new Date(topup.createdAt).toLocaleString()}
              </td>
              <td className="py-3 text-green-400">
                +{topup.amount.toLocaleString()} 积分
              </td>
              <td className="py-3">
                {methodLabels[topup.method] || topup.method}
              </td>
              <td className="py-3 text-white/60">{topup.note || "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
