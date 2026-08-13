import React, { useState, useEffect } from "react";
import {
  CheckCircle,
  XCircle,
  Warning,
  ListChecks,
  Clock,
} from "@phosphor-icons/react";
import ReviewItem, { REVIEW_STATUS } from "./index";
import WorkflowConfirmation from "@/models/workflowConfirmation";
import showToast from "@/utils/toast";
import Button from "@/components/Button";

/**
 * 审核面板组件
 * 用于批量审核多个项目
 */
export default function ReviewPanel({
  workspaceSlug,
  confirmationId,
  items = [],
  onComplete,
  onCancel,
}) {
  const [reviewItems, setReviewItems] = useState(
    items.map((item) => ({
      ...item,
      status: REVIEW_STATUS.PENDING,
      annotation: "",
    }))
  );
  const [submitting, setSubmitting] = useState(false);

  // 计算统计
  const stats = {
    total: reviewItems.length,
    approved: reviewItems.filter((i) => i.status === REVIEW_STATUS.APPROVED)
      .length,
    rejected: reviewItems.filter((i) => i.status === REVIEW_STATUS.REJECTED)
      .length,
    pending: reviewItems.filter((i) => i.status === REVIEW_STATUS.PENDING)
      .length,
    annotated: reviewItems.filter((i) => i.annotation).length,
  };

  const allReviewed = stats.pending === 0;

  // 更新单个项目状态
  const handleStatusChange = (index, status) => {
    setReviewItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, status } : item))
    );
  };

  // 添加批注
  const handleAnnotate = (index, annotation) => {
    setReviewItems((prev) =>
      prev.map((item, i) =>
        i === index
          ? {
              ...item,
              annotation,
              status: annotation ? REVIEW_STATUS.ANNOTATED : item.status,
            }
          : item
      )
    );
  };

  // 批量操作
  const handleApproveAll = () => {
    setReviewItems((prev) =>
      prev.map((item) => ({ ...item, status: REVIEW_STATUS.APPROVED }))
    );
  };

  const handleRejectAll = () => {
    setReviewItems((prev) =>
      prev.map((item) => ({ ...item, status: REVIEW_STATUS.REJECTED }))
    );
  };

  // 提交审核结果
  const handleSubmit = async () => {
    if (!allReviewed) {
      showToast("请先完成所有项目的审核", "warning");
      return;
    }

    setSubmitting(true);

    try {
      // 构建审核结果
      const reviewResult = {
        items: reviewItems.map((item, index) => ({
          index,
          status: item.status,
          annotation: item.annotation || null,
        })),
        summary: {
          approved: stats.approved,
          rejected: stats.rejected,
          annotated: stats.annotated,
        },
      };

      // 如果有 confirmationId，调用确认 API
      if (confirmationId) {
        const hasRejections = stats.rejected > 0;
        const response = hasRejections
          ? await WorkflowConfirmation.reject(
              workspaceSlug,
              confirmationId,
              JSON.stringify(reviewResult)
            )
          : await WorkflowConfirmation.approve(
              workspaceSlug,
              confirmationId,
              JSON.stringify(reviewResult)
            );

        if (!response.success) {
          throw new Error(response.error || "提交失败");
        }
      }

      showToast("审核结果已提交", "success");
      onComplete && onComplete(reviewResult);
    } catch (error) {
      showToast(`提交失败: ${error.message}`, "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-theme-bg-primary rounded-lg border border-theme-modal-border overflow-hidden">
      {/* 头部 */}
      <div className="px-4 py-3 bg-theme-bg-secondary border-b border-theme-modal-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ListChecks className="text-blue-400" size={20} />
            <h3 className="text-theme-text-primary font-medium">审核面板</h3>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <span className="text-green-400">✓ {stats.approved}</span>
            <span className="text-red-400">✗ {stats.rejected}</span>
            <span className="text-theme-text-secondary">
              待审 {stats.pending}
            </span>
          </div>
        </div>
      </div>

      {/* 批量操作 */}
      <div className="px-4 py-2 bg-gray-850 border-b border-theme-modal-border flex items-center gap-2">
        <Button
          className="min-h-0 px-3 py-1"
          onClick={handleApproveAll}
          size="sm"
        >
          全部批准
        </Button>
        <Button
          className="min-h-0 px-3 py-1"
          onClick={handleRejectAll}
          size="sm"
          variant="danger"
        >
          全部拒绝
        </Button>
      </div>

      {/* 审核项列表 */}
      <div className="p-4 max-h-96 overflow-y-auto">
        {reviewItems.map((item, index) => (
          <ReviewItem
            key={item.id || index}
            item={item}
            index={index}
            onStatusChange={handleStatusChange}
            onAnnotate={handleAnnotate}
          />
        ))}
      </div>

      {/* 底部操作 */}
      <div className="px-4 py-3 bg-theme-bg-secondary border-t border-theme-modal-border flex items-center justify-between">
        <Button onClick={onCancel} variant="muted">
          取消
        </Button>
        <Button
          className={
            !allReviewed || submitting
              ? "bg-gray-600 text-theme-text-secondary"
              : ""
          }
          onClick={handleSubmit}
          disabled={!allReviewed || submitting}
          loading={submitting}
        >
          {submitting ? "提交中..." : "提交审核结果"}
        </Button>
      </div>
    </div>
  );
}
