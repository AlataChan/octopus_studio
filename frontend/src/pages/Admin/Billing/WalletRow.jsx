import { useEffect, useState } from "react";
import { Plus } from "@phosphor-icons/react";
import Button from "@/components/Button";

const PLAN_LABELS = {
  free: { label: "免费版", color: "bg-gray-500" },
  starter: { label: "入门版", color: "bg-blue-500" },
  pro: { label: "专业版", color: "bg-green-500" },
  professional: { label: "专业版", color: "bg-green-500" },
  enterprise: { label: "企业版", color: "bg-purple-500" },
};

const PLAN_OPTIONS = [
  { value: "free", label: "免费版" },
  { value: "starter", label: "入门版" },
  { value: "pro", label: "专业版" },
  { value: "enterprise", label: "企业版" },
];

export default function WalletRow({ wallet, onTopup, onPlanChange }) {
  const [plan, setPlan] = useState(wallet.plan || "free");
  const [updatingPlan, setUpdatingPlan] = useState(false);

  useEffect(() => {
    setPlan(wallet.plan || "free");
  }, [wallet.plan]);

  const planInfo = PLAN_LABELS[wallet.plan] || PLAN_LABELS.free;
  const balanceColor =
    wallet.balance <= (wallet.alertThreshold || 0)
      ? "text-red-400"
      : "text-theme-text-primary";

  async function handlePlanSelect(nextPlan) {
    if (
      !nextPlan ||
      nextPlan === wallet.plan ||
      typeof onPlanChange !== "function"
    ) {
      setPlan(nextPlan);
      return;
    }

    setPlan(nextPlan);
    setUpdatingPlan(true);
    const result = await onPlanChange(wallet.userId, nextPlan);
    if (!result?.success) {
      setPlan(wallet.plan || "free");
    }
    setUpdatingPlan(false);
  }

  return (
    <tr className="bg-transparent text-theme-text-secondary text-sm border-b border-theme-border hover:bg-theme-bg-primary/50">
      <td className="px-6 py-4">
        <div className="flex flex-col">
          <span className="text-theme-text-primary font-medium">
            {wallet.user?.username || `用户 #${wallet.userId}`}
          </span>
          <span className="text-xs text-theme-text-secondary">
            {wallet.user?.role || "default"}
          </span>
          {wallet.isVirtual ? (
            <span className="text-xs text-amber-300 mt-1">待初始化</span>
          ) : null}
        </div>
      </td>
      <td className="px-6 py-4">
        <div className="flex flex-col gap-2 min-w-[140px]">
          <span
            className={`inline-flex w-fit px-2 py-1 rounded-full text-xs text-theme-text-primary ${planInfo.color}`}
          >
            {planInfo.label}
          </span>
          <select
            value={plan}
            onChange={(event) => handlePlanSelect(event.target.value)}
            disabled={updatingPlan}
            className="rounded-md border border-theme-border bg-theme-bg-primary px-2 py-1 text-xs text-theme-text-primary"
          >
            {PLAN_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </td>
      <td className={`px-6 py-4 font-mono ${balanceColor}`}>
        {wallet.balance.toLocaleString()} 积分
      </td>
      <td className="px-6 py-4 font-mono">
        {wallet.alertThreshold
          ? `${wallet.alertThreshold.toLocaleString()} 积分`
          : "-"}
      </td>
      <td className="px-6 py-4">
        {new Date(wallet.createdAt).toLocaleDateString("zh-CN")}
      </td>
      <td className="px-6 py-4 text-center">
        <Button
          className="bg-green-600 text-theme-text-primary hover:bg-green-700"
          onClick={() => onTopup(wallet.userId)}
          size="sm"
          disabled={updatingPlan}
        >
          <Plus className="h-3 w-3" weight="bold" />
          充值
        </Button>
      </td>
    </tr>
  );
}
