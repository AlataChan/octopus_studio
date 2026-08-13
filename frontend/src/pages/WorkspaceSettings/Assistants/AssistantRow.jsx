import { useState } from "react";
import WorkspaceAssistant from "@/models/workspaceAssistant";
import AssistantLibrary from "@/models/assistantLibrary";
import { PencilSimple, Trash, Check, X, Gear } from "@phosphor-icons/react";
import moment from "moment";
import AssistantConfigModal from "./AssistantConfigModal";

/**
 * AI 员工行组件
 * 显示单个 AI 员工的信息和操作按钮
 */
export default function AssistantRow({ assistant, workspaceSlug, onUpdate }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(
    assistant.instanceName ||
      assistant.template?.employeeName ||
      assistant.template?.name ||
      "未命名员工"
  );
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState(null);
  const [showConfigModal, setShowConfigModal] = useState(false);

  // 获取员工显示名称
  const getDisplayName = () => {
    return (
      assistant.instanceName ||
      assistant.template?.employeeName ||
      assistant.template?.name ||
      "未命名员工"
    );
  };

  /**
   * 切换启用/禁用状态
   */
  const handleToggle = async () => {
    setIsUpdating(true);
    setError(null);

    const result = await WorkspaceAssistant.toggle(
      workspaceSlug,
      assistant.id,
      !assistant.enabled
    );

    if (result.success) {
      onUpdate();
    } else {
      setError(result.error || "切换状态失败");
    }

    setIsUpdating(false);
  };

  /**
   * 保存重命名
   */
  const handleSaveRename = async () => {
    if (!editName.trim()) {
      setError("名称不能为空");
      return;
    }

    setIsUpdating(true);
    setError(null);

    const result = await WorkspaceAssistant.rename(
      workspaceSlug,
      assistant.id,
      editName.trim()
    );

    if (result.success) {
      setIsEditing(false);
      onUpdate();
    } else {
      setError(result.error || "重命名失败");
    }

    setIsUpdating(false);
  };

  /**
   * 取消重命名
   */
  const handleCancelRename = () => {
    setEditName(getDisplayName());
    setIsEditing(false);
    setError(null);
  };

  /**
   * 卸载助手
   */
  const handleUninstall = async () => {
    const displayName = getDisplayName();

    if (
      !window.confirm(
        `确定要卸载助手"${displayName}"吗？\n\n此操作将：\n• 从此 Workspace 中移除该助手\n• 删除该助手的所有配置\n• 此操作不可撤销\n\n是否继续？`
      )
    ) {
      return;
    }

    setIsUpdating(true);
    setError(null);

    const result = await WorkspaceAssistant.uninstall(
      workspaceSlug,
      assistant.id
    );

    if (result.success) {
      onUpdate();
    } else {
      setError(result.error || "卸载失败");
    }

    setIsUpdating(false);
  };

  return (
    <tr className="bg-theme-bg-primary border-b border-theme-border hover:bg-theme-bg-secondary/50 transition-colors">
      <td className="px-6 py-4">
        <div className="flex items-center gap-x-3">
          {/* 员工头像或图标 */}
          {assistant.template?.avatarUrl ? (
            <img
              src={AssistantLibrary.getIconUrl(assistant.template.avatarUrl)}
              alt={assistant.template.employeeName}
              className="w-10 h-10 rounded-full object-cover"
            />
          ) : (
            <span className="text-2xl">{assistant.template?.icon || "🤖"}</span>
          )}
          <div className="flex flex-col">
            {isEditing ? (
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="bg-theme-bg-secondary border border-theme-border-medium rounded px-2 py-1 text-theme-text-primary text-sm focus:outline-none focus:border-theme-accent-primary"
                disabled={isUpdating}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleSaveRename();
                  } else if (e.key === "Escape") {
                    handleCancelRename();
                  }
                }}
              />
            ) : (
              <span className="text-theme-text-primary font-medium">
                {getDisplayName()}
              </span>
            )}
            {assistant.instanceName && assistant.template?.employeeName && (
              <span className="text-white/40 text-xs">
                原名: {assistant.template.employeeName}
              </span>
            )}
          </div>
        </div>
      </td>
      <td className="px-6 py-4">
        <div className="flex flex-col gap-1">
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-sky-500/20 text-sky-400 border border-sky-500/30">
            {assistant.template?.category || "未分类"}
          </span>
        </div>
      </td>
      <td className="px-6 py-4">
        <button
          onClick={handleToggle}
          disabled={isUpdating}
          className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium transition-all ${
            assistant.enabled
              ? "bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20"
              : "bg-gray-500/10 text-theme-text-secondary border border-gray-500/20 hover:bg-gray-500/20"
          } ${isUpdating ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          {assistant.enabled ? "已启用" : "已禁用"}
        </button>
      </td>
      <td className="px-6 py-4 text-white/60 text-sm">
        {moment(assistant.installedAt).format("YYYY-MM-DD HH:mm")}
      </td>
      <td className="px-6 py-4">
        <div className="flex items-center justify-end gap-x-2">
          {isEditing ? (
            <>
              <button
                onClick={handleSaveRename}
                disabled={isUpdating}
                className="p-1.5 text-green-400 hover:bg-green-500/10 rounded transition-all disabled:opacity-50"
                title="保存"
              >
                <Check size={18} weight="bold" />
              </button>
              <button
                onClick={handleCancelRename}
                disabled={isUpdating}
                className="p-1.5 text-red-400 hover:bg-red-500/10 rounded transition-all disabled:opacity-50"
                title="取消"
              >
                <X size={18} weight="bold" />
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setShowConfigModal(true)}
                disabled={isUpdating}
                className="p-1.5 text-purple-400 hover:bg-purple-500/10 rounded transition-all disabled:opacity-50"
                title="配置"
              >
                <Gear size={18} weight="bold" />
              </button>
              <button
                onClick={() => setIsEditing(true)}
                disabled={isUpdating}
                className="p-1.5 text-sky-400 hover:bg-sky-500/10 rounded transition-all disabled:opacity-50"
                title="重命名"
              >
                <PencilSimple size={18} weight="bold" />
              </button>
              <button
                onClick={handleUninstall}
                disabled={isUpdating}
                className="p-1.5 text-red-400 hover:bg-red-500/10 rounded transition-all disabled:opacity-50"
                title="卸载"
              >
                <Trash size={18} weight="bold" />
              </button>
            </>
          )}
        </div>
        {error && (
          <div className="text-red-400 text-xs mt-1 text-right">{error}</div>
        )}
      </td>

      {/* 配置弹窗 */}
      {showConfigModal && (
        <AssistantConfigModal
          assistant={assistant}
          workspaceSlug={workspaceSlug}
          onClose={() => setShowConfigModal(false)}
          onUpdate={onUpdate}
        />
      )}
    </tr>
  );
}
