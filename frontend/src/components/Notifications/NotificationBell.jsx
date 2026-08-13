import { useState, useEffect, useRef } from "react";
import { Bell, Check, Trash } from "@phosphor-icons/react";
import NotificationAPI from "@/models/notification";
import { useTranslation } from "react-i18next";
import {
  clearLocalAuthSession,
  hasValidatedLocalAuthSession,
} from "@/utils/request";

/**
 * 通知铃铛组件 - 显示未读数量和下拉列表
 * @param {Object} props
 * @param {string} props.variant - 样式变体: "default" (顶部样式) | "footer" (左下角样式)
 */
export default function NotificationBell({ variant = "default" }) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef(null);

  /**
   * 检查用户是否已登录
   * @returns {boolean}
   */
  const isAuthenticated = () => {
    if (hasValidatedLocalAuthSession()) return true;

    clearLocalAuthSession();
    return false;
  };

  // 获取未读数量
  const fetchUnreadCount = async () => {
    // 未登录时不发起请求
    if (!isAuthenticated()) return;

    const result = await NotificationAPI.getUnreadCount();
    if (result.success) {
      setUnreadCount(result.count);
    }
  };

  // 获取通知列表
  const fetchNotifications = async () => {
    // 未登录时不发起请求
    if (!isAuthenticated()) return;

    setLoading(true);
    const result = await NotificationAPI.getList({ limit: 10 });
    if (result.success) {
      setNotifications(result.notifications || []);
    }
    setLoading(false);
  };

  // 标记为已读
  const handleMarkAsRead = async (id) => {
    const result = await NotificationAPI.markAsRead(id);
    if (result.success) {
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    }
  };

  // 标记全部已读
  const handleMarkAllAsRead = async () => {
    const result = await NotificationAPI.markAllAsRead();
    if (result.success) {
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    }
  };

  // 删除通知
  const handleDelete = async (id) => {
    const result = await NotificationAPI.delete(id);
    if (result.success) {
      const deleted = notifications.find((n) => n.id === id);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      if (deleted && !deleted.isRead) {
        setUnreadCount((prev) => Math.max(0, prev - 1));
      }
    }
  };

  // 点击外部关闭
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // 定时刷新未读数量
  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 60000); // 每分钟刷新
    return () => clearInterval(interval);
  }, []);

  // 打开时加载列表
  useEffect(() => {
    if (isOpen) fetchNotifications();
  }, [isOpen]);

  const getTypeIcon = (type) => {
    switch (type) {
      case "billing_alert":
        return "💰";
      case "budget_alert":
        return "⚠️";
      case "error":
        return "❌";
      default:
        return "📢";
    }
  };

  // 根据 variant 确定按钮样式
  const buttonClassName =
    variant === "footer"
      ? "relative transition-all duration-300 p-2 rounded-full bg-theme-sidebar-footer-icon hover:bg-theme-sidebar-footer-icon-hover"
      : "relative p-2 text-theme-text-secondary hover:text-theme-text-primary transition-colors";

  // 根据 variant 确定下拉框位置
  const dropdownClassName =
    variant === "footer"
      ? "fixed bottom-16 left-4 w-80 bg-theme-action-menu-bg border border-theme-border rounded-lg shadow-xl z-50"
      : "absolute right-0 mt-2 w-80 bg-theme-bg-secondary border border-theme-modal-border rounded-lg shadow-xl z-50";

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={buttonClassName}
        title={t("notifications.title", "通知")}
        aria-label="Notifications"
        data-tooltip-id="footer-item"
        data-tooltip-content={t("notifications.title", "通知")}
      >
        <Bell
          className={variant === "footer" ? "h-5 w-5" : "w-5 h-5"}
          weight={variant === "footer" ? "fill" : "regular"}
          color={
            variant === "footer"
              ? "var(--theme-sidebar-footer-icon-fill)"
              : undefined
          }
        />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-theme-text-primary text-xs rounded-full w-5 h-5 flex items-center justify-center">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className={dropdownClassName}>
          <div className="flex items-center justify-between p-3 border-b border-theme-border">
            <span className="font-medium text-theme-text-primary">
              {t("notifications.title", "通知")}
            </span>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllAsRead}
                className="text-xs text-blue-400 hover:text-blue-300"
              >
                {t("notifications.mark-all-read", "全部已读")}
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <div className="p-4 text-center text-theme-text-secondary">
                {t("notifications.loading", "加载中...")}
              </div>
            ) : notifications.length === 0 ? (
              <div className="p-4 text-center text-theme-text-secondary">
                {t("notifications.empty", "暂无通知")}
              </div>
            ) : (
              notifications.map((notification) => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  onMarkAsRead={handleMarkAsRead}
                  onDelete={handleDelete}
                  getTypeIcon={getTypeIcon}
                  t={t}
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function NotificationItem({
  notification,
  onMarkAsRead,
  onDelete,
  getTypeIcon,
  t,
}) {
  const { id, type, title, content, isRead, createdAt } = notification;

  return (
    <div
      className={`p-3 border-b border-theme-border hover:bg-theme-action-menu-item-hover ${!isRead ? "bg-[var(--theme-accent-soft)]" : ""}`}
    >
      <div className="flex items-start gap-2">
        <span className="text-lg">{getTypeIcon(type)}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <span
              className={`font-medium text-sm ${!isRead ? "text-theme-text-primary" : "text-theme-text-secondary"}`}
            >
              {title}
            </span>
            <div className="flex items-center gap-1">
              {!isRead && (
                <button
                  onClick={() => onMarkAsRead(id)}
                  className="p-1 text-theme-text-secondary hover:text-green-400"
                  title={t("notifications.mark-read", "标记已读")}
                  aria-label={t("notifications.mark-read", "标记已读")}
                >
                  <Check className="w-3 h-3" />
                </button>
              )}
              <button
                onClick={() => onDelete(id)}
                className="p-1 text-theme-text-secondary hover:text-red-400"
                title={t("notifications.delete", "删除")}
                aria-label={t("notifications.delete", "删除")}
              >
                <Trash className="w-3 h-3" />
              </button>
            </div>
          </div>
          <p className="text-xs text-theme-text-secondary mt-1 line-clamp-2">
            {content}
          </p>
          <span className="text-xs text-theme-text-secondary mt-1 block">
            {new Date(createdAt).toLocaleString("zh-CN")}
          </span>
        </div>
      </div>
    </div>
  );
}
