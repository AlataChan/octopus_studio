import React from "react";
import { CaretRight } from "@phosphor-icons/react";

/**
 * 来源类型卡片组件 - 科技感现代设计
 * @param {Object} props
 * @param {string} props.icon - 图标 emoji 或 Phosphor 图标
 * @param {string} props.title - 标题
 * @param {string} props.description - 描述
 * @param {string} props.badge - 可选，徽章文字（如"推荐"）
 * @param {boolean} props.selected - 是否选中
 * @param {function} props.onClick - 点击回调
 * @param {React.ReactNode} props.children - 子内容（展开区域）
 */
export default function SourceTypeCard({
  icon,
  title,
  description,
  badge,
  selected = false,
  onClick,
  children,
}) {
  return (
    <div
      className={`
        relative rounded-2xl transition-all duration-300 cursor-pointer
        ${
          selected
            ? "bg-[#1a2332] border-2 border-blue-500/50 shadow-lg shadow-blue-500/10"
            : "bg-[#151c28] border border-[#2a3a50] hover:bg-[#1a2332] hover:border-[#3a4a60]"
        }
      `}
      onClick={onClick}
    >
      {/* 卡片主体 */}
      <div className="p-5">
        <div className="flex items-start gap-4">
          {/* 图标容器 */}
          <div
            className={`
            text-2xl flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center transition-colors
            ${selected ? "bg-blue-500/20 text-blue-400" : "bg-[#1e2940] text-theme-text-secondary"}
          `}
          >
            {icon}
          </div>

          {/* 内容 */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-base font-bold text-theme-text-primary">
                {title}
              </h3>
              {badge && (
                <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  {badge}
                </span>
              )}
            </div>
            <p className="text-sm text-theme-text-secondary leading-relaxed">
              {description}
            </p>
          </div>

          {/* 箭头指示器 */}
          <CaretRight
            size={20}
            className={`
              flex-shrink-0 transition-all duration-300
              ${selected ? "text-blue-400 rotate-90" : "text-theme-text-secondary"}
            `}
          />
        </div>

        {/* 选中时的勾选指示 */}
        {selected && (
          <div className="absolute top-4 right-4">
            <div className="w-6 h-6 rounded-full bg-gradient-to-r from-blue-600 to-blue-500 flex items-center justify-center shadow-lg shadow-blue-500/30">
              <svg
                className="w-3.5 h-3.5 text-theme-text-primary"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={3}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
          </div>
        )}
      </div>

      {/* 展开内容区域 */}
      {selected && children && (
        <div className="px-5 pb-5 pt-3 border-t border-[#2a3a50]">
          {children}
        </div>
      )}
    </div>
  );
}
