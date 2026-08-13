import React from "react";
import Button from "@/components/Button";
import { X, Warning, Info, CheckCircle } from "@phosphor-icons/react";

/**
 * 通用确认对话框组件
 * @param {boolean} isOpen - 是否显示对话框
 * @param {function} onClose - 关闭对话框的回调
 * @param {function} onConfirm - 确认操作的回调
 * @param {string} title - 对话框标题
 * @param {string} message - 主要提示信息
 * @param {string[]} description - 详细说明列表
 * @param {string} confirmText - 确认按钮文本
 * @param {string} cancelText - 取消按钮文本
 * @param {string} type - 对话框类型：'warning' | 'danger' | 'info' | 'success'
 * @param {boolean} loading - 是否显示加载状态
 */
export default function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title = "确认操作",
  message,
  description = [],
  confirmText = "确认",
  cancelText = "取消",
  type = "warning",
  loading = false,
}) {
  if (!isOpen) return null;

  // 根据类型选择图标和颜色
  const getTypeConfig = () => {
    switch (type) {
      case "danger":
        return {
          icon: <Warning size={24} weight="fill" />,
          iconColor: "text-orange-400",
          iconBg: "bg-orange-400/10",
          confirmVariant: "danger",
        };
      case "warning":
        return {
          icon: <Warning size={24} weight="fill" />,
          iconColor: "text-yellow-400",
          iconBg: "bg-yellow-400/10",
          confirmVariant: "primary",
          confirmClassName: "",
        };
      case "success":
        // Success uses ghost + green override; no "success" Button variant exists yet
        return {
          icon: <CheckCircle size={24} weight="fill" />,
          iconColor: "text-green-400",
          iconBg: "bg-green-400/10",
          confirmVariant: "ghost",
          confirmClassName: "text-green-400 hover:text-green-300",
        };
      case "info":
      default:
        // Info uses ghost + sky override; keeps semantic distinction from warning (primary/violet)
        return {
          icon: <Info size={24} weight="fill" />,
          iconColor: "text-sky-400",
          iconBg: "bg-sky-400/10",
          confirmVariant: "ghost",
          confirmClassName: "text-sky-400 hover:text-sky-300",
        };
    }
  };

  const config = getTypeConfig();

  const handleConfirm = () => {
    if (!loading) {
      onConfirm();
    }
  };

  const handleCancel = () => {
    if (!loading) {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* 背景遮罩 */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleCancel}
      />

      {/* 对话框 */}
      <div className="relative w-full max-w-md mx-4 bg-theme-bg-secondary border border-theme-border rounded-xl shadow-2xl">
        {/* 关闭按钮 */}
        <button
          onClick={handleCancel}
          disabled={loading}
          className="absolute right-4 top-4 p-1 text-white/60 hover:text-theme-text-primary transition-colors disabled:opacity-50"
        >
          <X size={20} weight="bold" />
        </button>

        {/* 内容区域 */}
        <div className="p-6">
          {/* 图标和标题 */}
          <div className="flex items-start gap-4 mb-4">
            <div
              className={`flex-shrink-0 w-12 h-12 rounded-full ${config.iconBg} flex items-center justify-center ${config.iconColor}`}
            >
              {config.icon}
            </div>
            <div className="flex-1 pt-1">
              <h3 className="text-lg font-semibold text-theme-text-primary mb-2">
                {title}
              </h3>
              {message && (
                <p className="text-white/80 text-sm leading-relaxed">
                  {message}
                </p>
              )}
            </div>
          </div>

          {/* 详细说明 */}
          {description.length > 0 && (
            <div className="ml-16 mb-6">
              <p className="text-white/60 text-sm mb-2">此操作将：</p>
              <ul className="space-y-1">
                {description.map((item, index) => (
                  <li
                    key={index}
                    className="text-white/60 text-sm flex items-start gap-2"
                  >
                    <span className="text-white/40 mt-0.5">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 按钮组 */}
          <div className="flex items-center justify-end gap-3">
            <Button onClick={handleCancel} disabled={loading} variant="muted">
              {cancelText}
            </Button>
            <Button
              className={config.confirmClassName}
              onClick={handleConfirm}
              disabled={loading}
              loading={loading}
              variant={config.confirmVariant}
            >
              {loading ? "处理中..." : confirmText}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
