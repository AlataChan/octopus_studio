/**
 * Episode 建议组件
 *
 * Phase 2: 当检测到对话可能属于某个项目时，显示建议提示
 *
 * @module components/WorkspaceChat/EpisodeSuggestion
 */

import { useState, useEffect } from "react";
import { X, FolderPlus, Link } from "@phosphor-icons/react";
import Episode from "@/models/episode";

/**
 * Episode 建议横幅
 * @param {Object} props
 * @param {Object} props.suggestion - 建议对象 { belongsTo, suggestNew, confidence }
 * @param {string} props.workspaceSlug - Workspace slug
 * @param {Function} props.onDismiss - 关闭回调
 * @param {Function} props.onAccept - 接受建议回调
 */
export default function EpisodeSuggestion({
  suggestion,
  workspaceSlug,
  onDismiss,
  onAccept,
}) {
  const [loading, setLoading] = useState(false);
  const [episodes, setEpisodes] = useState([]);

  // 如果是关联到已有项目，获取项目信息
  useEffect(() => {
    if (suggestion?.belongsTo) {
      Episode.get(workspaceSlug, suggestion.belongsTo)
        .then((res) => {
          if (res.success && res.episode) {
            setEpisodes([res.episode]);
          }
        })
        .catch(console.error);
    }
  }, [suggestion?.belongsTo, workspaceSlug]);

  if (!suggestion || (!suggestion.belongsTo && !suggestion.suggestNew)) {
    return null;
  }

  const handleCreateEpisode = async () => {
    if (!suggestion.suggestNew) return;

    setLoading(true);
    try {
      const result = await Episode.create(workspaceSlug, {
        name: suggestion.suggestNew,
        description: `自动检测创建于 ${new Date().toLocaleDateString()}`,
        tags: [],
      });

      if (result.success) {
        onAccept?.(result.episode);
      }
    } catch (error) {
      console.error("[EpisodeSuggestion] Error creating episode:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleLinkEpisode = async () => {
    if (!suggestion.belongsTo) return;
    // 关联逻辑由父组件处理
    onAccept?.({ id: suggestion.belongsTo });
  };

  return (
    <div className="mx-4 mb-2 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg flex items-center justify-between">
      <div className="flex items-center gap-3">
        {suggestion.suggestNew ? (
          <>
            <FolderPlus className="w-5 h-5 text-blue-400" />
            <div>
              <p className="text-sm text-theme-text-primary">
                检测到新项目：
                <span className="font-medium">{suggestion.suggestNew}</span>
              </p>
              <p className="text-xs text-white/60">
                置信度: {Math.round((suggestion.confidence || 0) * 100)}%
              </p>
            </div>
          </>
        ) : (
          <>
            <Link className="w-5 h-5 text-blue-400" />
            <div>
              <p className="text-sm text-theme-text-primary">
                此对话可能属于项目：
                <span className="font-medium">
                  {episodes[0]?.name || suggestion.belongsTo}
                </span>
              </p>
              <p className="text-xs text-white/60">
                置信度: {Math.round((suggestion.confidence || 0) * 100)}%
              </p>
            </div>
          </>
        )}
      </div>

      <div className="flex items-center gap-2">
        {suggestion.suggestNew ? (
          <button
            onClick={handleCreateEpisode}
            disabled={loading}
            className="px-3 py-1 text-xs bg-blue-500 hover:bg-blue-600 text-theme-text-primary rounded transition-colors disabled:opacity-50"
          >
            {loading ? "创建中..." : "创建项目"}
          </button>
        ) : (
          <button
            onClick={handleLinkEpisode}
            disabled={loading}
            className="px-3 py-1 text-xs bg-blue-500 hover:bg-blue-600 text-theme-text-primary rounded transition-colors disabled:opacity-50"
          >
            关联项目
          </button>
        )}

        <button
          onClick={onDismiss}
          className="p-1 text-white/60 hover:text-theme-text-primary transition-colors"
          title="忽略"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
