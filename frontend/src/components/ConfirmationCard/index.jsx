import React, { useState } from "react";
import { Warning, CheckCircle, XCircle, Clock } from "@phosphor-icons/react";
import WorkflowConfirmation from "@/models/workflowConfirmation";
import showToast from "@/utils/toast";
import Button from "@/components/Button";

/**
 * HitL 确认卡片组件
 * 用于显示需要用户确认的执行计划
 */
export default function ConfirmationCard({
  confirmation,
  workspaceSlug,
  onConfirmed,
  onRejected,
}) {
  const [activeAction, setActiveAction] = useState(null);
  const [showDetails, setShowDetails] = useState(false);

  const planDetails =
    typeof confirmation.planDetails === "string"
      ? JSON.parse(confirmation.planDetails)
      : confirmation.planDetails;

  // 风险等级样式
  const riskStyles = {
    low: {
      bg: "bg-green-500/10",
      border: "border-green-500/30",
      text: "text-green-400",
      icon: <CheckCircle className="w-5 h-5" weight="fill" />,
    },
    medium: {
      bg: "bg-yellow-500/10",
      border: "border-yellow-500/30",
      text: "text-yellow-400",
      icon: <Warning className="w-5 h-5" weight="fill" />,
    },
    high: {
      bg: "bg-red-500/10",
      border: "border-red-500/30",
      text: "text-red-400",
      icon: <Warning className="w-5 h-5" weight="fill" />,
    },
  };

  const riskStyle = riskStyles[confirmation.riskLevel] || riskStyles.medium;

  // 计算剩余时间
  const expiresAt = new Date(confirmation.expiresAt);
  const now = new Date();
  const remainingSeconds = Math.max(0, Math.floor((expiresAt - now) / 1000));
  const remainingMinutes = Math.floor(remainingSeconds / 60);

  // 批准操作
  const handleApprove = async () => {
    setActiveAction("approve");
    const { success, error } = await WorkflowConfirmation.approve(
      workspaceSlug,
      confirmation.id
    );

    if (success) {
      showToast("已批准执行计划", "success");
      onConfirmed && onConfirmed(confirmation.id);
    } else {
      showToast(`批准失败: ${error}`, "error");
    }
    setActiveAction(null);
  };

  // 拒绝操作
  const handleReject = async () => {
    setActiveAction("reject");
    const { success, error } = await WorkflowConfirmation.reject(
      workspaceSlug,
      confirmation.id
    );

    if (success) {
      showToast("已拒绝执行计划", "success");
      onRejected && onRejected(confirmation.id);
    } else {
      showToast(`拒绝失败: ${error}`, "error");
    }
    setActiveAction(null);
  };

  return (
    <div
      className={`rounded-lg border ${riskStyle.border} ${riskStyle.bg} p-4 mb-4 transition-all`}
    >
      {/* 头部 */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-start gap-3 flex-1">
          <div className={riskStyle.text}>{riskStyle.icon}</div>
          <div className="flex-1">
            <h3 className="text-theme-text-primary font-semibold text-sm mb-1">
              {confirmation.planTitle}
            </h3>
            <div className="flex items-center gap-3 text-xs text-theme-text-secondary">
              <span className={`${riskStyle.text} font-medium`}>
                {confirmation.riskLevel.toUpperCase()} 风险
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                剩余 {remainingMinutes} 分钟
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 详情 (可展开) */}
      {showDetails && planDetails && (
        <div className="mb-3 p-3 bg-black/20 rounded text-xs text-theme-text-secondary">
          <pre className="whitespace-pre-wrap">
            {JSON.stringify(planDetails, null, 2)}
          </pre>
        </div>
      )}

      {/* 操作按钮 */}
      <div className="flex items-center gap-2">
        <Button
          className="flex-1"
          onClick={handleApprove}
          disabled={Boolean(activeAction)}
          loading={activeAction === "approve"}
        >
          {activeAction === "approve" ? "处理中..." : "批准"}
        </Button>
        <Button
          className="flex-1"
          onClick={handleReject}
          disabled={Boolean(activeAction)}
          loading={activeAction === "reject"}
          variant="danger"
        >
          {activeAction === "reject" ? "处理中..." : "拒绝"}
        </Button>
        <Button onClick={() => setShowDetails(!showDetails)} variant="ghost">
          {showDetails ? "隐藏" : "详情"}
        </Button>
      </div>
    </div>
  );
}
