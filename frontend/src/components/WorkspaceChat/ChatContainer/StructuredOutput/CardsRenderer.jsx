import React from "react";
import { ArrowSquareOut } from "@phosphor-icons/react";

/**
 * Cards Renderer Component
 *
 * Phase J: 卡片列表渲染器
 * 用于展示多项目列表
 */
export default function CardsRenderer({ data, title }) {
  if (!data?.items || !Array.isArray(data.items)) {
    return <p className="text-red-400 text-sm">卡片数据格式错误</p>;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {data.items.map((item, idx) => (
        <div
          key={idx}
          className="bg-zinc-700/30 rounded-lg p-4 border border-zinc-600 hover:border-zinc-500 transition-colors"
        >
          {/* 标题 */}
          {item.title && (
            <h5 className="font-semibold text-theme-text-primary mb-2 flex items-center justify-between">
              <span>{item.title}</span>
              {item.badge && (
                <span className="text-xs px-2 py-1 bg-blue-500/20 text-blue-400 rounded">
                  {item.badge}
                </span>
              )}
            </h5>
          )}

          {/* 描述 */}
          {item.description && (
            <p className="text-sm text-theme-text-secondary mb-3 line-clamp-3">
              {item.description}
            </p>
          )}

          {/* 元数据 */}
          {item.metadata && (
            <div className="flex flex-wrap gap-2 mb-3">
              {Object.entries(item.metadata).map(([key, value]) => (
                <span
                  key={key}
                  className="text-xs px-2 py-1 bg-zinc-600/50 text-theme-text-secondary rounded"
                >
                  {key}: {value}
                </span>
              ))}
            </div>
          )}

          {/* 链接 */}
          {item.link && (
            <a
              href={item.link}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1"
            >
              查看详情 <ArrowSquareOut size={14} />
            </a>
          )}

          {/* 标签 */}
          {item.tags && item.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-3">
              {item.tags.map((tag, tagIdx) => (
                <span
                  key={tagIdx}
                  className="text-xs px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded-full"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
