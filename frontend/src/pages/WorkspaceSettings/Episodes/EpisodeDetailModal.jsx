import React, { useState, useEffect } from "react";
import {
  X,
  PencilSimple,
  ChatCircle,
  FileText,
  Link,
  Trash,
  Check,
} from "@phosphor-icons/react";
import Episode from "@/models/episode";
import showToast from "@/utils/toast";

/**
 * 项目详情弹窗
 */
export default function EpisodeDetailModal({
  episode,
  workspace,
  onClose,
  onUpdate,
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(episode.label || "");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState([]);
  const [linkedItems, setLinkedItems] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const metadata =
      typeof episode.metadata === "string"
        ? JSON.parse(episode.metadata || "{}")
        : episode.metadata || {};

    setDescription(metadata.description || "");
    setTags(metadata.tags || []);
  }, [episode]);

  // 获取关联的对话/文档列表
  useEffect(() => {
    // 从 episode 的 edges 中获取关联项
    // TODO: 后续可以添加 API 来获取详细的关联列表
    const items =
      episode.edges?.map((edge) => ({
        id: edge.toNodeId,
        type: edge.toNode?.type || "unknown",
        label: edge.toNode?.label || edge.toNodeId,
      })) || [];
    setLinkedItems(items);
  }, [episode]);

  const handleSave = async () => {
    setLoading(true);
    try {
      const result = await Episode.update(workspace.slug, episode.nodeId, {
        name: name.trim(),
        description: description.trim(),
        tags,
      });
      if (result.success) {
        showToast("项目已更新", "success");
        setIsEditing(false);
        onUpdate();
      } else {
        showToast(result.error || "更新失败", "error");
      }
    } catch (error) {
      showToast("更新失败", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleUnlink = async (targetNodeId) => {
    try {
      const result = await Episode.unlink(
        workspace.slug,
        episode.nodeId,
        targetNodeId
      );
      if (result.success) {
        showToast("已取消关联", "success");
        setLinkedItems(linkedItems.filter((item) => item.id !== targetNodeId));
      }
    } catch (error) {
      showToast("操作失败", "error");
    }
  };

  const metadata =
    typeof episode.metadata === "string"
      ? JSON.parse(episode.metadata || "{}")
      : episode.metadata || {};

  const statusLabels = {
    active: "进行中",
    completed: "已完成",
    archived: "已归档",
    paused: "已暂停",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-2xl max-h-[80vh] overflow-y-auto bg-theme-bg-secondary border border-theme-border rounded-xl shadow-xl">
        {/* Header */}
        <div className="sticky top-0 flex items-center justify-between p-4 border-b border-theme-border bg-theme-bg-secondary">
          <div className="flex items-center gap-3">
            {isEditing ? (
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="text-lg font-semibold text-theme-text-primary bg-white/5 border border-theme-border-medium rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            ) : (
              <h3 className="text-lg font-semibold text-theme-text-primary">
                {episode.label}
              </h3>
            )}
            <span className="px-2 py-0.5 text-xs bg-white/10 text-white/60 rounded">
              {statusLabels[metadata.status] || "进行中"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {isEditing ? (
              <>
                <button
                  onClick={() => setIsEditing(false)}
                  className="px-3 py-1.5 text-white/60 hover:text-theme-text-primary transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleSave}
                  disabled={loading}
                  className="px-3 py-1.5 bg-sky-500 hover:bg-sky-600 text-theme-text-primary rounded-lg transition-colors flex items-center gap-1"
                >
                  <Check className="h-4 w-4" />
                  保存
                </button>
              </>
            ) : (
              <button
                onClick={() => setIsEditing(true)}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
              >
                <PencilSimple className="h-5 w-5 text-white/60" />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            >
              <X className="h-5 w-5 text-white/60" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 space-y-6">
          {/* 描述 */}
          <div>
            <h4 className="text-sm font-medium text-white/60 mb-2">项目描述</h4>
            {isEditing ? (
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 bg-white/5 border border-theme-border rounded-lg text-theme-text-primary placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-sky-500 resize-none"
                placeholder="添加项目描述..."
              />
            ) : (
              <p className="text-white/80">{description || "暂无描述"}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
