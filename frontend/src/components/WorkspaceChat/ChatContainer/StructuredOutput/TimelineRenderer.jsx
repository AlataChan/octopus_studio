import React from "react";
import {
  Circle,
  CheckCircle,
  Clock,
  WarningCircle,
} from "@phosphor-icons/react";

/**
 * Timeline Renderer Component
 *
 * Phase J: 时间线渲染器
 * 用于展示事件序列
 */
export default function TimelineRenderer({ data, title }) {
  if (!data?.events || !Array.isArray(data.events)) {
    return <p className="text-red-400 text-sm">时间线数据格式错误</p>;
  }

  const getStatusIcon = (status) => {
    switch (status) {
      case "completed":
        return (
          <CheckCircle size={20} className="text-green-500" weight="fill" />
        );
      case "pending":
        return <Clock size={20} className="text-yellow-500" />;
      case "error":
        return (
          <WarningCircle size={20} className="text-red-500" weight="fill" />
        );
      default:
        return <Circle size={20} className="text-blue-500" weight="fill" />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "completed":
        return "border-green-500/50 bg-green-500/10";
      case "pending":
        return "border-yellow-500/50 bg-yellow-500/10";
      case "error":
        return "border-red-500/50 bg-red-500/10";
      default:
        return "border-blue-500/50 bg-blue-500/10";
    }
  };

  return (
    <div className="relative">
      {/* 垂直连接线 */}
      <div className="absolute left-[9px] top-0 bottom-0 w-0.5 bg-zinc-600" />

      <div className="space-y-4">
        {data.events.map((event, idx) => (
          <div key={idx} className="relative flex gap-4 pl-8">
            {/* 状态图标 */}
            <div className="absolute left-0 top-0 bg-theme-bg-secondary z-10">
              {getStatusIcon(event.status)}
            </div>

            {/* 事件内容 */}
            <div
              className={`flex-1 p-3 rounded-lg border ${getStatusColor(event.status)}`}
            >
              <div className="flex items-center justify-between mb-1">
                <h5 className="font-semibold text-theme-text-primary">
                  {event.title}
                </h5>
                {event.time && (
                  <span className="text-xs text-theme-text-secondary">
                    {event.time}
                  </span>
                )}
              </div>

              {event.description && (
                <p className="text-sm text-theme-text-secondary">
                  {event.description}
                </p>
              )}

              {event.details && (
                <details className="mt-2">
                  <summary className="text-xs text-blue-400 cursor-pointer hover:text-blue-300">
                    查看详情
                  </summary>
                  <pre className="mt-2 text-xs text-theme-text-secondary bg-zinc-800/50 p-2 rounded overflow-auto">
                    {typeof event.details === "string"
                      ? event.details
                      : JSON.stringify(event.details, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
