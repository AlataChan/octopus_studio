/**
 * ToolExecutionCard - 工具调用可视化卡片
 *
 * Phase D: 工具调用实时可视化
 * - 实时显示工具执行状态
 * - 进度预估和动画效果
 * - 结果预览和展开
 */

import { useState, useEffect } from "react";
import {
  CheckCircle,
  Clock,
  XCircle,
  Spinner,
  CaretDown,
  CaretUp,
} from "@phosphor-icons/react";

/**
 * 工具名称到中文的映射
 */
const TOOL_NAME_MAP = {
  "rag-memory": "知识库检索",
  "knowledge-graph": "知识图谱查询",
  "web-browsing": "网页搜索",
  "web-scraping": "网页抓取",
  "sql-agent#query": "数据库查询",
  "sql-agent#list-database-connections": "列出数据库连接",
  "sql-agent#list-tables": "列出数据表",
  "sql-agent#get-table-schema": "获取表结构",
  "duckdb-agent#query": "DuckDB 查询",
  "generate-excel-report": "生成 Excel 报告",
  "generate-presentation": "生成 PPT",
  "generate-pdf-document": "生成 PDF",
  "generate-official-document": "生成 Word 文档",
  "create-chart": "创建图表",
  "visual-generate": "视觉生成",
  "document-summarizer": "文档摘要",
  "doris-data-platform": "Doris 数据平台",
  "datetime-info": "获取日期时间",
};

/**
 * 获取工具显示名称
 */
function getToolDisplayName(toolName) {
  return TOOL_NAME_MAP[toolName] || toolName;
}

/**
 * 格式化耗时显示
 */
function formatDuration(ms) {
  if (!ms) return "";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export default function ToolExecutionCard({ tool }) {
  const [expanded, setExpanded] = useState(false);
  const [progress, setProgress] = useState(0);

  // 模拟进度条动画
  useEffect(() => {
    if (tool.stage === "start" && tool.estimatedMs) {
      const interval = setInterval(() => {
        setProgress((prev) => {
          const elapsed = Date.now() - tool.timestamp;
          const newProgress = Math.min((elapsed / tool.estimatedMs) * 100, 95);
          return newProgress;
        });
      }, 100);

      return () => clearInterval(interval);
    } else if (tool.stage === "success" || tool.stage === "error") {
      setProgress(100);
    }
  }, [tool.stage, tool.estimatedMs, tool.timestamp]);

  const getIcon = () => {
    switch (tool.stage) {
      case "start":
        return <Spinner className="animate-spin text-blue-500" size={18} />;
      case "progress":
        return <Clock className="text-yellow-500" size={18} />;
      case "success":
        return <CheckCircle className="text-green-500" size={18} />;
      case "error":
        return <XCircle className="text-red-500" size={18} />;
      default:
        return <Clock className="text-gray-400" size={18} />;
    }
  };

  const getStatusColor = () => {
    switch (tool.stage) {
      case "start":
        return "border-l-blue-400 bg-blue-500/10";
      case "progress":
        return "border-l-yellow-400 bg-yellow-500/10";
      case "success":
        return "border-l-green-400 bg-green-500/10";
      case "error":
        return "border-l-red-400 bg-red-500/10";
      default:
        return "border-l-theme-border bg-theme-bg-secondary";
    }
  };

  const getStatusText = () => {
    switch (tool.stage) {
      case "start":
        return "执行中...";
      case "progress":
        return "处理中...";
      case "success":
        return "完成";
      case "error":
        return "失败";
      default:
        return "";
    }
  };

  return (
    <div
      className={`border-l-4 rounded-r-lg p-3 mb-2 transition-all duration-200 ${getStatusColor()}`}
    >
      {/* 头部 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {getIcon()}
          <span className="font-medium text-sm text-theme-text-primary">
            {getToolDisplayName(tool.toolName)}
          </span>
          <span className="text-xs text-theme-text-secondary">
            {getStatusText()}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {tool.durationMs && (
            <span className="text-xs text-theme-text-secondary">
              {formatDuration(tool.durationMs)}
            </span>
          )}

          {(tool.result || tool.error || tool.args) && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-theme-text-secondary hover:text-theme-text-primary transition-colors"
            >
              {expanded ? <CaretUp size={16} /> : <CaretDown size={16} />}
            </button>
          )}
        </div>
      </div>

      {/* 进度条 */}
      {tool.stage === "start" && (
        <div className="mt-2">
          <div className="h-1 bg-theme-border rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all duration-100 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
          {tool.estimatedMs && (
            <div className="text-xs text-gray-400 mt-1">
              预计 {formatDuration(tool.estimatedMs)}
            </div>
          )}
        </div>
      )}

      {/* 展开详情 */}
      {expanded && (
        <div className="mt-3 space-y-2 text-sm">
          {/* 参数 */}
          {tool.args && Object.keys(tool.args).length > 0 && (
            <div>
              <div className="text-xs font-medium text-theme-text-secondary mb-1">
                参数
              </div>
              <pre className="bg-theme-bg-secondary p-2 rounded text-xs overflow-x-auto max-h-32 border border-theme-border">
                {JSON.stringify(tool.args, null, 2)}
              </pre>
            </div>
          )}

          {/* 结果 */}
          {tool.stage === "success" && tool.result && (
            <div>
              <div className="text-xs font-medium text-theme-text-secondary mb-1">
                结果
              </div>
              <pre className="bg-theme-bg-secondary p-2 rounded text-xs overflow-x-auto max-h-48 border border-theme-border">
                {typeof tool.result === "string"
                  ? tool.result
                  : JSON.stringify(tool.result, null, 2)}
              </pre>
            </div>
          )}

          {/* 错误 */}
          {tool.stage === "error" && tool.error && (
            <div>
              <div className="text-xs font-medium text-red-500 mb-1">
                错误信息
              </div>
              <div className="bg-red-500/10 p-2 rounded text-xs text-red-500 border border-red-500/20">
                {tool.error}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
