import React, { useState, useEffect } from "react";
import {
  Folder,
  Plus,
  Trash,
  PencilSimple,
  Archive,
  CheckCircle,
  SpinnerGap,
} from "@phosphor-icons/react";
import Button from "@/components/Button";
import showToast from "@/utils/toast";
import Episode from "@/models/episode";
import CreateEpisodeModal from "./CreateEpisodeModal";
import EpisodeDetailModal from "./EpisodeDetailModal";

/**
 * Episode（项目）管理页面
 *
 * Phase 1: Episode 作为 Graph Node 的前端管理界面
 * 对外显示为"项目"，避免暴露技术术语
 */
export default function Episodes({ workspace }) {
  const [episodes, setEpisodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedEpisode, setSelectedEpisode] = useState(null);
  const [statusFilter, setStatusFilter] = useState(null);

  const fetchEpisodes = async () => {
    if (!workspace?.slug) return;
    setLoading(true);
    try {
      const result = await Episode.getAll(workspace.slug, statusFilter);
      setEpisodes(result.episodes || []);
    } catch (error) {
      console.error("获取项目列表失败:", error);
      showToast("获取项目列表失败", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEpisodes();
  }, [workspace?.slug, statusFilter]);

  const handleCreate = async (data) => {
    try {
      const result = await Episode.create(workspace.slug, data);
      if (result.success) {
        showToast("项目创建成功", "success");
        setShowCreateModal(false);
        fetchEpisodes();
      } else {
        showToast(result.error || "创建失败", "error");
      }
    } catch (error) {
      showToast("创建失败", "error");
    }
  };

  const handleUpdateStatus = async (episodeId, status) => {
    try {
      const result = await Episode.update(workspace.slug, episodeId, {
        status,
      });
      if (result.success) {
        showToast(
          `项目已${status === "completed" ? "完成" : status === "archived" ? "归档" : "更新"}`,
          "success"
        );
        fetchEpisodes();
      }
    } catch (error) {
      showToast("操作失败", "error");
    }
  };

  const handleDelete = async (episodeId) => {
    if (!confirm("确定要删除这个项目吗？相关联的对话记录不会被删除。")) return;
    try {
      const result = await Episode.delete(workspace.slug, episodeId);
      if (result.success) {
        showToast("项目已删除", "success");
        fetchEpisodes();
      }
    } catch (error) {
      showToast("删除失败", "error");
    }
  };

  const statusOptions = [
    { value: null, label: "全部" },
    { value: "active", label: "进行中" },
    { value: "completed", label: "已完成" },
    { value: "archived", label: "已归档" },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* 标题栏 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Folder className="h-6 w-6 text-sky-400" />
          <h2 className="text-xl font-semibold text-theme-text-primary">
            项目管理
          </h2>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="h-4 w-4" />
          创建项目
        </Button>
      </div>

      {/* 说明文字 */}
      <p className="text-white/60 text-sm">
        将相关对话组织成项目，便于管理和回顾。AI
        会根据项目上下文提供更精准的回答。
      </p>

      {/* 状态筛选 */}
      <div className="flex gap-2">
        {statusOptions.map((option) => (
          <button
            key={option.value || "all"}
            onClick={() => setStatusFilter(option.value)}
            className={`px-3 py-1.5 text-sm rounded-full transition-colors ${
              statusFilter === option.value
                ? "bg-sky-500 text-theme-text-primary"
                : "bg-white/10 text-white/60 hover:bg-white/20"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {/* 项目列表 */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-white/60">
          <SpinnerGap className="h-6 w-6 animate-spin mr-2" />
          加载中...
        </div>
      ) : episodes.length === 0 ? (
        <EmptyState onCreateClick={() => setShowCreateModal(true)} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {episodes.map((episode) => (
            <EpisodeCard
              key={episode.id}
              episode={episode}
              onClick={() => setSelectedEpisode(episode)}
              onStatusChange={handleUpdateStatus}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* 使用说明 */}
      <HowItWorksSection />

      {/* Modals */}
      {showCreateModal && (
        <CreateEpisodeModal
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreate}
        />
      )}
      {selectedEpisode && (
        <EpisodeDetailModal
          episode={selectedEpisode}
          workspace={workspace}
          onClose={() => setSelectedEpisode(null)}
          onUpdate={() => {
            fetchEpisodes();
            setSelectedEpisode(null);
          }}
        />
      )}
    </div>
  );
}

/**
 * 空状态组件
 */
function EmptyState({ onCreateClick }) {
  return (
    <div className="text-white/60 text-center py-12 border border-dashed border-theme-border-medium rounded-lg">
      <Folder className="h-12 w-12 mx-auto mb-2 opacity-50" />
      <p>暂无项目</p>
      <p className="text-sm mt-1 mb-4">创建项目来组织你的对话和工作</p>
      <button
        onClick={onCreateClick}
        className="px-4 py-2 bg-sky-500 hover:bg-sky-600 text-theme-text-primary rounded-lg transition-colors"
      >
        创建第一个项目
      </button>
    </div>
  );
}

/**
 * 项目卡片组件
 */
function EpisodeCard({ episode, onClick, onStatusChange, onDelete }) {
  const metadata =
    typeof episode.metadata === "string"
      ? JSON.parse(episode.metadata || "{}")
      : episode.metadata || {};

  const status = metadata.status || "active";
  const tags = metadata.tags || [];
  const threadCount = metadata.thread_count || 0;
  const lastActivity = metadata.last_activity
    ? new Date(metadata.last_activity).toLocaleDateString("zh-CN")
    : null;

  const statusConfig = {
    active: { color: "bg-green-500", label: "进行中" },
    completed: { color: "bg-blue-500", label: "已完成" },
    archived: { color: "bg-gray-500", label: "已归档" },
    paused: { color: "bg-yellow-500", label: "已暂停" },
  };

  const { color, label } = statusConfig[status] || statusConfig.active;

  return (
    <div
      className="p-4 rounded-lg border border-theme-border bg-white/5 hover:bg-white/10 transition-colors cursor-pointer group"
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${color}`} />
            <h3 className="text-theme-text-primary font-medium truncate">
              {episode.label}
            </h3>
          </div>
          {metadata.description && (
            <p className="text-white/60 text-sm mt-1 line-clamp-2">
              {metadata.description}
            </p>
          )}
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {tags.slice(0, 3).map((tag, i) => (
                <span
                  key={i}
                  className="px-2 py-0.5 text-xs bg-sky-500/20 text-sky-300 rounded-full"
                >
                  {tag}
                </span>
              ))}
              {tags.length > 3 && (
                <span className="px-2 py-0.5 text-xs bg-white/10 text-white/40 rounded-full">
                  +{tags.length - 3}
                </span>
              )}
            </div>
          )}
          <div className="flex items-center gap-4 mt-3 text-xs text-white/40">
            <span>💬 {threadCount} 对话</span>
            {lastActivity && <span>📅 {lastActivity}</span>}
            <span className="px-1.5 py-0.5 rounded bg-white/10">{label}</span>
          </div>
        </div>
        {/* 操作按钮 */}
        <div
          className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => e.stopPropagation()}
        >
          {status === "active" && (
            <button
              onClick={() => onStatusChange(episode.nodeId, "completed")}
              className="p-1.5 hover:bg-white/10 rounded"
              title="标记完成"
            >
              <CheckCircle className="h-4 w-4 text-green-400" />
            </button>
          )}
          <button
            onClick={() => onStatusChange(episode.nodeId, "archived")}
            className="p-1.5 hover:bg-white/10 rounded"
            title="归档"
          >
            <Archive className="h-4 w-4 text-yellow-400" />
          </button>
          <button
            onClick={() => onDelete(episode.nodeId)}
            className="p-1.5 hover:bg-white/10 rounded"
            title="删除"
          >
            <Trash className="h-4 w-4 text-red-400" />
          </button>
        </div>
      </div>
    </div>
  );
}

function HowItWorksSection() {
  return (
    <div className="mt-8 p-4 rounded-lg border border-theme-border bg-white/[0.03] text-sm text-white/70 space-y-2">
      <h3 className="text-base font-semibold text-theme-text-primary">
        项目是如何运作的？
      </h3>
      <p>
        「项目」是对话和知识的组织单元，用来把同一主题下的多次对话、文档和审核工作聚合在一起，方便长期跟进和回顾。
      </p>
      <ul className="list-disc list-inside space-y-1">
        <li>
          一个项目通常对应一个客户、一个评审任务或一条业务线，可以跨越多次对话和多个文件。
        </li>
        <li>
          在顶部点击「创建项目」，填写名称、简介和标签，即可为当前工作区建立一个新的项目。
        </li>
        <li>
          当对话在 AI
          流程中被绑定到某个项目后，该项目会自动累积关联的对话条数和最近活动时间。
        </li>
        <li>
          项目的状态（进行中 / 已完成 /
          已归档）用于标记当前进度，不会删除任何对话或文档。
        </li>
        <li>
          AI
          在回答与项目相关的问题时，会优先利用该项目下的对话和文档上下文，比单纯按时间线检索更聚焦。
        </li>
      </ul>
      <p className="text-white/50">
        建议：为每个重要客户或关键任务创建一个独立项目，把长期往来的对话都归入对应项目，便于后续做总结、复盘和自动生成报告。
      </p>
    </div>
  );
}
