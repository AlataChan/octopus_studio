import React from "react";
import { Check } from "@phosphor-icons/react";

/**
 * 根据分类获取图标背景色
 * @param {string} category - 分类名称
 * @returns {string} - Tailwind CSS 类名
 */
function getIconColorByCategory(category) {
  const colorMap = {
    通用基础: "bg-amber-500/20 text-amber-400",
    跨境电商: "bg-cyan-500/20 text-cyan-400",
    自媒体: "bg-pink-500/20 text-pink-400",
    制造业: "bg-emerald-500/20 text-emerald-400",
  };
  return colorMap[category] || "bg-blue-500/20 text-blue-400";
}

/**
 * 预配置模板卡片组件 - 科技感现代设计
 * @param {Object} props
 * @param {Object} props.preset - 预配置模板对象
 * @param {boolean} props.selected - 是否选中
 * @param {function} props.onClick - 点击回调
 */
export default function PresetTemplateCard({
  preset,
  selected = false,
  onClick,
}) {
  const { icon, name, description, category, hasPresetPersona } = preset;

  const iconColorClass = getIconColorByCategory(category);

  return (
    <div
      className={`
        group relative flex flex-col rounded-2xl p-5 cursor-pointer transition-all duration-300
        bg-[#1a2332] hover:bg-[#1e2940] border border-[#2a3a50]
        ${
          selected
            ? "ring-2 ring-blue-500 border-blue-500/50"
            : "hover:border-[#3a4a60]"
        }
      `}
      onClick={onClick}
    >
      {/* 选中指示器 */}
      {selected && (
        <div className="absolute top-3 right-3 w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center shadow-lg shadow-blue-500/30">
          <Check size={14} weight="bold" className="text-theme-text-primary" />
        </div>
      )}

      {/* 明星员工标识 */}
      {hasPresetPersona && !selected && (
        <div
          className="absolute top-3 right-3 text-lg"
          title="明星员工 - 含完整人格设定"
        >
          🌟
        </div>
      )}

      {/* 图标容器 - 彩色背景 */}
      <div
        className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${iconColorClass}`}
      >
        <span className="text-2xl">{icon}</span>
      </div>

      {/* 标题 */}
      <h4 className="font-bold text-theme-text-primary text-base mb-2 line-clamp-1">
        {name}
      </h4>

      {/* 描述 */}
      <p className="text-sm text-theme-text-secondary mb-4 line-clamp-2 flex-grow min-h-[40px]">
        {description}
      </p>

      {/* 选择按钮 - 渐变蓝色 */}
      <button
        className={`
          w-full py-2.5 rounded-xl font-medium text-sm transition-all duration-300
          ${
            selected
              ? "bg-gradient-to-r from-blue-600 to-blue-500 text-theme-text-primary shadow-lg shadow-blue-500/30"
              : "bg-gradient-to-r from-blue-600/80 to-blue-500/80 text-theme-text-primary hover:from-blue-600 hover:to-blue-500 hover:shadow-lg hover:shadow-blue-500/20"
          }
        `}
      >
        {selected ? "已选择" : "选择"}
      </button>
    </div>
  );
}
