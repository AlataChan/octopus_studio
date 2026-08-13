/**
 * PlanningPanel - Planning 决策面板（紧凑模式）
 *
 * Phase F: Planning 可视化
 * - 默认紧凑模式：一行显示关键信息
 * - 点击展开查看详细信息
 */

import { useState } from "react";
import {
  Brain,
  CheckCircle,
  ArrowRight,
  Graph,
  File,
  CaretDown,
  CaretUp,
  Lightning,
  Clock,
} from "@phosphor-icons/react";

/**
 * 获取覆盖度颜色样式
 */
function getCoverageStyle(coverage) {
  switch (coverage) {
    case "high":
      return {
        bg: "bg-green-500/20",
        text: "text-green-400",
        label: "充分覆盖",
        percent: 90,
      };
    case "medium":
      return {
        bg: "bg-yellow-500/20",
        text: "text-yellow-400",
        label: "部分覆盖",
        percent: 60,
      };
    case "low":
      return {
        bg: "bg-red-500/20",
        text: "text-red-400",
        label: "覆盖不足",
        percent: 30,
      };
    default:
      return {
        bg: "bg-gray-500/20",
        text: "text-theme-text-secondary",
        label: "未知",
        percent: 0,
      };
  }
}

/**
 * 获取策略信息
 */
function getStrategyInfo(strategy) {
  switch (strategy) {
    case "sequential":
      return { icon: ArrowRight, label: "串行" };
    case "parallel":
      return { icon: Lightning, label: "并行" };
    case "single":
      return { icon: CheckCircle, label: "单步" };
    default:
      return { icon: Clock, label: "自动" };
  }
}

/**
 * Planning 面板主组件（紧凑模式）
 */
export default function PlanningPanel({ planningData }) {
  const [expanded, setExpanded] = useState(false);

  if (!planningData) return null;

  const {
    strategy,
    reason,
    coverage,
    graphNodes = 0,
    vectorSources = 0,
  } = planningData;

  const coverageStyle = getCoverageStyle(coverage);
  const strategyInfo = getStrategyInfo(strategy);
  const StrategyIcon = strategyInfo.icon;

  return (
    <div className="bg-theme-bg-secondary/80 border border-theme-sidebar-border rounded-lg overflow-hidden">
      {/* 紧凑头部 - 始终显示 */}
      <div
        className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-white/5 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {/* 图标 + 标题 */}
          <div className="flex items-center gap-1.5">
            <Brain size={16} className="text-blue-400 flex-shrink-0" />
            <span className="text-xs font-medium text-white/80">编排</span>
          </div>

          {/* 分隔符 */}
          <span className="text-white/20">|</span>

          {/* 覆盖度标签 */}
          <span
            className={`text-xs px-1.5 py-0.5 rounded ${coverageStyle.bg} ${coverageStyle.text}`}
          >
            {coverageStyle.label}
          </span>

          {/* 分隔符 */}
          <span className="text-white/20">|</span>

          {/* 策略 */}
          <div className="flex items-center gap-1">
            <StrategyIcon size={12} className="text-purple-400" />
            <span className="text-xs text-white/60">{strategyInfo.label}</span>
          </div>

          {/* 分隔符 */}
          <span className="text-white/20">|</span>

          {/* 知识来源 */}
          <div className="flex items-center gap-2 text-xs text-white/50">
            <span className="flex items-center gap-1">
              <Graph size={12} />
              {graphNodes}
            </span>
            <span className="flex items-center gap-1">
              <File size={12} />
              {vectorSources}
            </span>
          </div>
        </div>

        {/* 展开/收起按钮 */}
        <button className="text-white/40 hover:text-white/60 p-1">
          {expanded ? <CaretUp size={14} /> : <CaretDown size={14} />}
        </button>
      </div>

      {/* 展开的详细内容 */}
      {expanded && reason && (
        <div className="px-3 pb-2 border-t border-white/5">
          <p className="text-xs text-white/50 mt-2 leading-relaxed">{reason}</p>
        </div>
      )}
    </div>
  );
}
