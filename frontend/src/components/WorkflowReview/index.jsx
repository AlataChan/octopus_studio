import React, { useState, useEffect } from "react";
import {
  CheckCircle,
  XCircle,
  Warning,
  CaretDown,
  CaretRight,
  ChatText,
  FileText,
  Clock,
} from "@phosphor-icons/react";
import WorkflowConfirmation from "@/models/workflowConfirmation";
import showToast from "@/utils/toast";

/**
 * 审核项状态
 */
const REVIEW_STATUS = {
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
  ANNOTATED: "annotated",
};

/**
 * 单个审核项组件
 */
function ReviewItem({ item, index, onStatusChange, onAnnotate }) {
  const [expanded, setExpanded] = useState(false);
  const [annotation, setAnnotation] = useState(item.annotation || "");
  const [showAnnotationInput, setShowAnnotationInput] = useState(false);

  const statusStyles = {
    [REVIEW_STATUS.PENDING]: "border-gray-600 bg-theme-bg-secondary",
    [REVIEW_STATUS.APPROVED]: "border-green-600 bg-green-900/20",
    [REVIEW_STATUS.REJECTED]: "border-red-600 bg-red-900/20",
    [REVIEW_STATUS.ANNOTATED]: "border-yellow-600 bg-yellow-900/20",
  };

  const handleApprove = () => {
    onStatusChange(index, REVIEW_STATUS.APPROVED);
  };

  const handleReject = () => {
    onStatusChange(index, REVIEW_STATUS.REJECTED);
  };

  const handleSaveAnnotation = () => {
    onAnnotate(index, annotation);
    setShowAnnotationInput(false);
  };

  return (
    <div
      className={`rounded-lg border ${statusStyles[item.status]} p-3 mb-2 transition-all`}
    >
      {/* 头部 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-1">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-theme-text-secondary hover:text-theme-text-primary"
          >
            {expanded ? <CaretDown size={16} /> : <CaretRight size={16} />}
          </button>
          <span className="text-sm text-theme-text-secondary font-medium">
            {item.title || `审核项 ${index + 1}`}
          </span>
          {item.riskLevel && (
            <span
              className={`text-xs px-2 py-0.5 rounded ${
                item.riskLevel === "high"
                  ? "bg-red-500/20 text-red-400"
                  : item.riskLevel === "medium"
                    ? "bg-yellow-500/20 text-yellow-400"
                    : "bg-green-500/20 text-green-400"
              }`}
            >
              {item.riskLevel}
            </span>
          )}
        </div>

        {/* 操作按钮 */}
        <div className="flex items-center gap-1">
          <button
            onClick={handleApprove}
            className={`p-1.5 rounded ${
              item.status === REVIEW_STATUS.APPROVED
                ? "bg-green-500 text-theme-text-primary"
                : "bg-theme-settings-input-bg text-theme-text-secondary hover:bg-green-600 hover:text-theme-text-primary"
            }`}
            title="批准"
          >
            <CheckCircle size={16} />
          </button>
          <button
            onClick={handleReject}
            className={`p-1.5 rounded ${
              item.status === REVIEW_STATUS.REJECTED
                ? "bg-red-500 text-theme-text-primary"
                : "bg-theme-settings-input-bg text-theme-text-secondary hover:bg-red-600 hover:text-theme-text-primary"
            }`}
            title="拒绝"
          >
            <XCircle size={16} />
          </button>
          <button
            onClick={() => setShowAnnotationInput(!showAnnotationInput)}
            className={`p-1.5 rounded ${
              item.annotation
                ? "bg-yellow-500 text-theme-text-primary"
                : "bg-theme-settings-input-bg text-theme-text-secondary hover:bg-yellow-600 hover:text-theme-text-primary"
            }`}
            title="批注"
          >
            <ChatText size={16} />
          </button>
        </div>
      </div>

      {/* 展开内容 */}
      {expanded && (
        <div className="mt-3 pl-6 text-sm text-theme-text-secondary">
          <p>{item.content || item.description || "无详细内容"}</p>
          {item.source && (
            <div className="mt-2 flex items-center gap-1 text-xs text-theme-text-secondary">
              <FileText size={12} />
              <span>来源: {item.source}</span>
            </div>
          )}
        </div>
      )}

      {/* 批注输入 */}
      {showAnnotationInput && (
        <div className="mt-3 pl-6">
          <textarea
            value={annotation}
            onChange={(e) => setAnnotation(e.target.value)}
            placeholder="输入批注..."
            className="w-full p-2 bg-theme-bg-primary border border-theme-modal-border rounded text-sm text-theme-text-primary placeholder-gray-500 resize-none"
            rows={2}
          />
          <div className="flex justify-end gap-2 mt-2">
            <button
              onClick={() => setShowAnnotationInput(false)}
              className="px-3 py-1 text-xs bg-theme-settings-input-bg text-theme-text-secondary rounded hover:bg-gray-600"
            >
              取消
            </button>
            <button
              onClick={handleSaveAnnotation}
              className="px-3 py-1 text-xs bg-blue-600 text-theme-text-primary rounded hover:bg-blue-500"
            >
              保存批注
            </button>
          </div>
        </div>
      )}

      {/* 已有批注显示 */}
      {item.annotation && !showAnnotationInput && (
        <div className="mt-2 pl-6 text-xs text-yellow-400 italic">
          批注: {item.annotation}
        </div>
      )}
    </div>
  );
}

export default ReviewItem;
export { REVIEW_STATUS };
