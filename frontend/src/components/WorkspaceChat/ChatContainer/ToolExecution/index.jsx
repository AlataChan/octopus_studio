/**
 * ToolExecutionPanel - 工具执行面板
 *
 * Phase D: 工具调用实时可视化
 * - 管理多个工具调用的状态
 * - 折叠/展开面板
 */

import { useState, useEffect } from "react";
import { Wrench, CaretDown, CaretUp } from "@phosphor-icons/react";
import ToolExecutionCard from "./ToolExecutionCard";

export default function ToolExecutionPanel({ toolExecutions = [] }) {
  const [collapsed, setCollapsed] = useState(false);

  // 没有工具执行时不显示
  if (toolExecutions.length === 0) {
    return null;
  }

  // 统计各状态的工具数量
  const stats = {
    running: toolExecutions.filter(
      (t) => t.stage === "start" || t.stage === "progress"
    ).length,
    success: toolExecutions.filter((t) => t.stage === "success").length,
    error: toolExecutions.filter((t) => t.stage === "error").length,
  };

  const isAllComplete = stats.running === 0;

  return (
    <div className="bg-theme-bg-secondary rounded-lg border border-theme-border mb-4 overflow-hidden">
      {/* 头部 */}
      <div
        className="flex items-center justify-between px-4 py-2 cursor-pointer hover:bg-theme-bg-primary transition-colors"
        onClick={() => setCollapsed(!collapsed)}
      >
        <div className="flex items-center gap-2">
          <Wrench size={18} className="text-theme-text-secondary" />
          <span className="font-medium text-sm text-theme-text-primary">
            工具调用
          </span>
          <span className="text-xs text-theme-text-secondary">
            ({toolExecutions.length})
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* 状态统计 */}
          <div className="flex items-center gap-2 text-xs">
            {stats.running > 0 && (
              <span className="text-blue-500">{stats.running} 执行中</span>
            )}
            {stats.success > 0 && (
              <span className="text-green-500">{stats.success} 完成</span>
            )}
            {stats.error > 0 && (
              <span className="text-red-500">{stats.error} 失败</span>
            )}
          </div>

          {/* 折叠按钮 */}
          <button className="text-theme-text-secondary hover:text-theme-text-primary">
            {collapsed ? <CaretDown size={16} /> : <CaretUp size={16} />}
          </button>
        </div>
      </div>

      {/* 工具列表 */}
      {!collapsed && (
        <div className="px-4 pb-3">
          {toolExecutions.map((tool, index) => (
            <ToolExecutionCard
              key={
                tool.executionId ||
                `${tool.toolName}-${tool.timestamp}-${index}`
              }
              tool={tool}
            />
          ))}
        </div>
      )}
    </div>
  );
}
