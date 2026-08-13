/**
 * AgentDebugPanel - Agent 调试面板
 *
 * Phase L: Agent 调试面板
 * - 实时 trace 可视化
 * - Planning 决策追踪
 * - 工具调用链追踪
 * - 性能指标收集
 */

import { useState, useEffect, useMemo } from "react";
import {
  Bug,
  CaretDown,
  CaretUp,
  Clock,
  Lightning,
  TreeStructure,
  Wrench,
  CheckCircle,
  XCircle,
  Info,
  Warning,
} from "@phosphor-icons/react";

/**
 * 事件类型图标映射
 */
const EVENT_ICONS = {
  "planning:start": TreeStructure,
  "planning:knowledge_loaded": Info,
  "planning:decision": Lightning,
  "planning:end": CheckCircle,
  "tool:start": Wrench,
  "tool:end": CheckCircle,
  "tool:error": XCircle,
  "llm:request_start": Clock,
  "llm:request_end": CheckCircle,
  diagnostic: Info,
  warning: Warning,
  error: XCircle,
};

/**
 * 事件类型颜色映射
 */
const EVENT_COLORS = {
  "planning:start": "text-blue-500",
  "planning:knowledge_loaded": "text-cyan-500",
  "planning:decision": "text-purple-500",
  "planning:end": "text-green-500",
  "tool:start": "text-yellow-500",
  "tool:end": "text-green-500",
  "tool:error": "text-red-500",
  "llm:request_start": "text-orange-500",
  "llm:request_end": "text-green-500",
  diagnostic: "text-gray-500",
  warning: "text-yellow-500",
  error: "text-red-500",
};

/**
 * 格式化事件类型名称
 */
function formatEventType(type) {
  const typeMap = {
    "planning:start": "Planning 开始",
    "planning:knowledge_loaded": "知识加载完成",
    "planning:decision": "Planning 决策",
    "planning:end": "Planning 结束",
    "tool:start": "工具调用开始",
    "tool:end": "工具调用结束",
    "tool:error": "工具调用错误",
    "llm:request_start": "LLM 请求开始",
    "llm:request_end": "LLM 请求结束",
    diagnostic: "诊断信息",
    warning: "警告",
    error: "错误",
  };
  return typeMap[type] || type;
}

/**
 * 格式化时间
 */
function formatTime(ms) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

/**
 * 单个调试事件卡片
 */
function DebugEventCard({ event }) {
  const [expanded, setExpanded] = useState(false);
  const IconComponent = EVENT_ICONS[event.type] || Info;
  const colorClass = EVENT_COLORS[event.type] || "text-gray-500";

  return (
    <div className="border-l-2 border-theme-border pl-3 py-1 mb-2">
      <div
        className="flex items-center gap-2 cursor-pointer hover:bg-theme-bg-primary rounded px-2 py-1"
        onClick={() => setExpanded(!expanded)}
      >
        <IconComponent size={14} className={colorClass} />
        <span className="text-xs text-theme-text-secondary">
          +{formatTime(event.relativeTimeMs)}
        </span>
        <span className="text-xs font-medium text-theme-text-primary">
          {formatEventType(event.type)}
        </span>
        {event.data?.toolName && (
          <span className="text-xs text-theme-text-secondary">
            ({event.data.toolName})
          </span>
        )}
        {event.data?.durationMs && (
          <span className="text-xs text-green-500">
            {formatTime(event.data.durationMs)}
          </span>
        )}
        <button className="ml-auto text-gray-400">
          {expanded ? <CaretUp size={12} /> : <CaretDown size={12} />}
        </button>
      </div>

      {expanded && event.data && (
        <div className="mt-1 ml-6 text-xs bg-theme-bg-secondary rounded p-2">
          <pre className="whitespace-pre-wrap text-theme-text-secondary">
            {JSON.stringify(event.data, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

/**
 * 性能指标面板
 */
function MetricsPanel({ metrics }) {
  if (!metrics) return null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
      <div className="bg-blue-500/10 rounded p-2">
        <div className="text-xs text-blue-500">总耗时</div>
        <div className="text-sm font-medium text-blue-500">
          {formatTime(metrics.totalDurationMs)}
        </div>
      </div>
      <div className="bg-purple-500/10 rounded p-2">
        <div className="text-xs text-purple-500">Planning</div>
        <div className="text-sm font-medium text-purple-500">
          {formatTime(metrics.planningDurationMs)}
        </div>
      </div>
      <div className="bg-yellow-500/10 rounded p-2">
        <div className="text-xs text-yellow-500">工具调用</div>
        <div className="text-sm font-medium text-yellow-500">
          {metrics.toolCallCount} 次
        </div>
      </div>
      <div className="bg-red-500/10 rounded p-2">
        <div className="text-xs text-red-500">错误</div>
        <div className="text-sm font-medium text-red-500">
          {metrics.errorCount} 个
        </div>
      </div>
    </div>
  );
}

/**
 * Agent 调试面板主组件
 */
export default function AgentDebugPanel({ debugData = {} }) {
  const [collapsed, setCollapsed] = useState(true);
  const { events = [], metrics = null } = debugData;

  // 按时间排序事件
  const sortedEvents = useMemo(() => {
    return [...events].sort((a, b) => a.timestamp - b.timestamp);
  }, [events]);

  // 如果没有调试数据，不显示面板
  if (!events.length && !metrics) {
    return null;
  }

  return (
    <div className="bg-theme-bg-secondary rounded-lg border border-theme-border mb-4 overflow-hidden">
      {/* 头部 */}
      <div
        className="flex items-center justify-between px-4 py-2 cursor-pointer hover:bg-theme-bg-primary transition-colors"
        onClick={() => setCollapsed(!collapsed)}
      >
        <div className="flex items-center gap-2">
          <Bug size={18} className="text-purple-500" />
          <span className="font-medium text-sm text-theme-text-primary">
            Agent 调试
          </span>
          <span className="text-xs text-theme-text-secondary">
            ({events.length} 事件)
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* 快速指标 */}
          {metrics && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-blue-500">
                {formatTime(metrics.totalDurationMs)}
              </span>
              {metrics.toolCallCount > 0 && (
                <span className="text-yellow-500">
                  {metrics.toolCallCount} 工具
                </span>
              )}
              {metrics.errorCount > 0 && (
                <span className="text-red-500">{metrics.errorCount} 错误</span>
              )}
            </div>
          )}

          {/* 折叠按钮 */}
          <button className="text-theme-text-secondary hover:text-theme-text-primary">
            {collapsed ? <CaretDown size={16} /> : <CaretUp size={16} />}
          </button>
        </div>
      </div>

      {/* 详情内容 */}
      {!collapsed && (
        <div className="px-4 pb-3">
          {/* 性能指标 */}
          <MetricsPanel metrics={metrics} />

          {/* 事件时间线 */}
          <div className="mt-2">
            <div className="text-xs font-medium text-theme-text-secondary mb-2">
              事件时间线
            </div>
            <div className="max-h-60 overflow-y-auto">
              {sortedEvents.map((event, index) => (
                <DebugEventCard
                  key={`${event.type}-${event.timestamp}-${index}`}
                  event={event}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
