import React from "react";
import { Graph } from "@phosphor-icons/react";
import { useNavigate } from "react-router-dom";
import paths from "@/utils/paths";

/**
 * 知识图谱按钮组件
 * 显示在聊天界面顶部,点击后跳转到图谱页面
 */
export default function GraphButton({ workspaceSlug }) {
  const navigate = useNavigate();

  const handleClick = () => {
    navigate(paths.workspace.graph(workspaceSlug));
  };

  return (
    <button
      onClick={handleClick}
      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-theme-bg-primary hover:bg-theme-bg-secondary transition-colors border border-theme-sidebar-border"
      title="查看知识图谱"
    >
      <Graph size={20} className="text-theme-text-primary" />
      <span className="text-sm text-theme-text-primary hidden sm:inline">
        知识图谱
      </span>
    </button>
  );
}
