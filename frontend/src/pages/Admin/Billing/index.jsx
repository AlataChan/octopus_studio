import { useEffect, useState } from "react";
import Sidebar from "@/components/SettingsSidebar";
import { isMobile } from "react-device-detect";
import * as Skeleton from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css";
import {
  Wallet,
  CurrencyCircleDollar,
  ChartLine,
  Gear,
} from "@phosphor-icons/react";
import Billing from "@/models/billing";
import WalletRow from "./WalletRow";
import TopupModal from "./TopupModal";
import { useModal } from "@/hooks/useModal";
import ModalWrapper from "@/components/ModalWrapper";
import showToast from "@/utils/toast";
import { useTranslation } from "react-i18next";

export default function AdminBilling() {
  const { t } = useTranslation();
  const { isOpen, openModal, closeModal } = useModal();
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [_config, setConfig] = useState(null);
  const [refreshNonce, setRefreshNonce] = useState(0);

  const handleTopup = (userId) => {
    setSelectedUserId(userId);
    openModal();
  };

  const requestRefresh = () => {
    setRefreshNonce((current) => current + 1);
  };

  const handleTopupComplete = () => {
    closeModal();
    setSelectedUserId(null);
  };

  return (
    <div className="w-screen h-screen overflow-hidden bg-page-texture flex">
      <Sidebar />
      <div
        style={{ height: isMobile ? "100%" : "calc(100% - 32px)" }}
        className="relative z-[1] md:ml-[2px] md:mr-[16px] md:my-[16px] md:rounded-[16px] bg-theme-bg-secondary w-full h-full overflow-y-scroll p-4 md:p-0"
      >
        <div className="flex flex-col w-full px-1 md:pl-6 md:pr-[50px] md:py-6 py-16">
          <div className="w-full flex flex-col gap-y-1 pb-6 border-theme-border border-b-2">
            <div className="items-center flex gap-x-4">
              <p className="text-lg leading-6 font-bold text-theme-text-primary">
                {t("admin-billing.title")}
              </p>
            </div>
            <p className="text-xs leading-[18px] font-base text-theme-text-secondary">
              {t("admin-billing.description")}
            </p>
          </div>

          <BillingToggle setConfig={setConfig} t={t} />
          <StatsCards t={t} refreshNonce={refreshNonce} />

          <div className="overflow-x-auto mt-6">
            <WalletsContainer
              onTopup={handleTopup}
              refreshNonce={refreshNonce}
              requestRefresh={requestRefresh}
              t={t}
            />
          </div>
        </div>
        <ModalWrapper isOpen={isOpen}>
          <TopupModal
            userId={selectedUserId}
            closeModal={handleTopupComplete}
            onSuccess={requestRefresh}
          />
        </ModalWrapper>
      </div>
    </div>
  );
}

function BillingToggle({ setConfig, t }) {
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    async function fetchConfig() {
      const result = await Billing.getConfig();
      if (result.success) {
        setEnabled(result.data.billingEnabled);
        setConfig(result.data);
      } else {
        showToast(result.error || t("admin-billing.update-failed"), "error");
      }
      setLoading(false);
    }
    fetchConfig();
  }, [setConfig, t]);

  const handleToggle = async () => {
    const newValue = !enabled;
    const result = await Billing.updateConfig({ billingEnabled: newValue });
    if (result.success) {
      setEnabled(newValue);
      showToast(result.message, "success");
    } else {
      showToast(result.error || t("admin-billing.update-failed"), "error");
    }
  };

  if (loading) return null;

  return (
    <div className="flex items-center justify-between mt-6 p-4 bg-theme-bg-primary rounded-lg">
      <div className="flex items-center gap-3">
        <Gear className="h-5 w-5 text-theme-text-secondary" />
        <div>
          <p className="text-sm font-medium text-theme-text-primary">
            {t("admin-billing.billing-system")}
          </p>
          <p className="text-xs text-theme-text-secondary">
            {enabled
              ? t("admin-billing.enabled-desc")
              : t("admin-billing.disabled-desc")}
          </p>
        </div>
      </div>
      <label className="relative inline-flex items-center cursor-pointer">
        <input
          type="checkbox"
          checked={enabled}
          onChange={handleToggle}
          className="sr-only peer"
        />
        <div className="w-11 h-6 bg-gray-600 rounded-full peer peer-checked:bg-green-500 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
      </label>
    </div>
  );
}

function StatsCards({ t, refreshNonce }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      setLoading(true);
      const result = await Billing.getUsageSummary();
      if (result.success) {
        setStats(result.data);
      } else {
        showToast(result.error || "加载计费统计失败", "error");
      }
      setLoading(false);
    }
    fetchStats();
  }, [refreshNonce]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
        {[1, 2, 3].map((i) => (
          <Skeleton.default key={i} height={100} className="rounded-lg" />
        ))}
      </div>
    );
  }

  const topups = stats?.topups || {};

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
      <StatCard
        icon={<CurrencyCircleDollar className="h-8 w-8 text-green-500" />}
        title={t("admin-billing.stats.total-topup")}
        value={`${(topups.totalAmount || 0).toLocaleString()} ${t("admin-billing.stats.credits")}`}
        subtitle={`${topups.count || 0} ${t("admin-billing.stats.topup-count")}`}
      />
      <StatCard
        icon={<Wallet className="h-8 w-8 text-blue-500" />}
        title={t("admin-billing.stats.avg-topup")}
        value={`${Math.round(topups.avgAmount || 0).toLocaleString()} ${t("admin-billing.stats.credits")}`}
        subtitle={t("admin-billing.stats.per-topup")}
      />
      <StatCard
        icon={<ChartLine className="h-8 w-8 text-purple-500" />}
        title={t("admin-billing.stats.max-topup")}
        value={`${(topups.maxAmount || 0).toLocaleString()} ${t("admin-billing.stats.credits")}`}
        subtitle={t("admin-billing.stats.single-max")}
      />
    </div>
  );
}

function StatCard({ icon, title, value, subtitle }) {
  return (
    <div className="p-4 bg-theme-bg-primary rounded-lg">
      <div className="flex items-center gap-3">
        {icon}
        <div>
          <p className="text-xs text-theme-text-secondary">{title}</p>
          <p className="text-lg font-bold text-theme-text-primary">{value}</p>
          <p className="text-xs text-theme-text-secondary">{subtitle}</p>
        </div>
      </div>
    </div>
  );
}

function WalletsContainer({ onTopup, refreshNonce, requestRefresh, t }) {
  const [loading, setLoading] = useState(true);
  const [wallets, setWallets] = useState([]);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    async function fetchWallets() {
      setLoading(true);
      const result = await Billing.getWallets();
      if (result.success) {
        setWallets(result.data.wallets || []);
        setLoadError("");
      } else {
        setWallets([]);
        setLoadError(result.error || "加载钱包列表失败");
      }
      setLoading(false);
    }
    fetchWallets();
  }, [refreshNonce]);

  async function handlePlanChange(userId, plan) {
    const result = await Billing.updatePlan(userId, plan);
    if (result.success) {
      showToast("套餐已更新", "success");
      requestRefresh();
    } else {
      showToast(result.error || "更新套餐失败", "error");
    }
    return result;
  }

  if (loading) {
    return (
      <Skeleton.default
        height="40vh"
        width="100%"
        highlightColor="var(--theme-bg-primary)"
        baseColor="var(--theme-bg-secondary)"
        count={1}
        className="w-full p-4 rounded-lg mt-4"
        enableAnimation={true}
      />
    );
  }

  const hasVirtualWallets = wallets.some((wallet) => wallet.isVirtual);

  return (
    <div className="space-y-3">
      {hasVirtualWallets && (
        <div className="rounded-lg border border-theme-sidebar-border bg-theme-bg-primary px-4 py-3 text-xs text-theme-text-secondary">
          尚未发生充值或套餐变更的用户会先以默认钱包展示。你可以直接修改套餐或充值，系统会在首笔操作时自动初始化钱包记录。
        </div>
      )}

      <table className="w-full text-sm text-left rounded-lg mt-4">
        <thead className="text-theme-text-secondary text-xs leading-[18px] font-bold uppercase border-theme-border border-b">
          <tr>
            <th scope="col" className="px-6 py-3">
              {t("admin-billing.table.user")}
            </th>
            <th scope="col" className="px-6 py-3">
              {t("admin-billing.table.plan")}
            </th>
            <th scope="col" className="px-6 py-3">
              {t("admin-billing.table.balance")}
            </th>
            <th scope="col" className="px-6 py-3">
              {t("admin-billing.table.alert-threshold")}
            </th>
            <th scope="col" className="px-6 py-3">
              {t("admin-billing.table.created-at")}
            </th>
            <th scope="col" className="px-6 py-3 text-center">
              {t("admin-billing.table.actions")}
            </th>
          </tr>
        </thead>
        <tbody>
          {loadError ? (
            <tr>
              <td
                colSpan="6"
                className="text-center py-8 text-theme-text-secondary"
              >
                {loadError}
              </td>
            </tr>
          ) : wallets.length === 0 ? (
            <tr>
              <td
                colSpan="6"
                className="text-center py-8 text-theme-text-secondary"
              >
                {t("admin-billing.no-wallets")}
              </td>
            </tr>
          ) : (
            wallets.map((wallet) => (
              <WalletRow
                key={wallet.id}
                wallet={wallet}
                onTopup={onTopup}
                onPlanChange={handlePlanChange}
              />
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
