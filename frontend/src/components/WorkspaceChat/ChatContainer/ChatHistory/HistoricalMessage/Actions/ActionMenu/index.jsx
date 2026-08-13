import React from "react";
import { Trash, TreeView } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";

/**
 * 消息操作按钮组（分叉、删除）
 * 以图标按钮形式展示，与其他操作按钮保持一致
 */
function ActionMenu({ chatId, forkThread, isEditing, role }) {
  const { t } = useTranslation();

  const handleFork = () => {
    forkThread(chatId);
  };

  const handleDelete = () => {
    window.dispatchEvent(
      new CustomEvent("delete-message", { detail: { chatId } })
    );
  };

  if (!chatId || isEditing || role === "user") return null;

  return (
    <>
      {/* 分叉按钮 */}
      <div className="mt-3 relative">
        <button
          onClick={handleFork}
          data-tooltip-id="fork-thread"
          data-tooltip-content={t("chat_window.fork")}
          className="text-theme-text-secondary"
          aria-label={t("chat_window.fork")}
        >
          <TreeView
            color="var(--theme-sidebar-footer-icon-fill)"
            size={20}
            className="mb-1"
          />
        </button>
      </div>
      {/* 删除按钮 */}
      <div className="mt-3 relative">
        <button
          onClick={handleDelete}
          data-tooltip-id="delete-message"
          data-tooltip-content={t("chat_window.delete")}
          className="text-theme-text-secondary hover:text-red-400 transition-colors duration-200"
          aria-label={t("chat_window.delete")}
        >
          <Trash
            color="var(--theme-sidebar-footer-icon-fill)"
            size={20}
            className="mb-1"
          />
        </button>
      </div>
    </>
  );
}

export default ActionMenu;
