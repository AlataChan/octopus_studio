import React from "react";
import { Lock } from "@phosphor-icons/react";

/**
 * 始终启用技能的展示面板
 * 这些技能不可关闭，是系统级或输出级工具
 */
export default function AlwaysOnSkillPanel({
  title,
  description,
  image,
  icon,
  layer = 1,
}) {
  const layerLabel = layer === 1 ? "系统级" : "输出级";
  const layerColor =
    layer === 1
      ? "bg-blue-500/20 text-blue-400"
      : "bg-green-500/20 text-green-400";

  return (
    <div className="p-2">
      <div className="flex flex-col gap-y-[18px] max-w-[500px]">
        <div className="flex w-full justify-between items-center">
          <div className="flex items-center gap-x-2">
            {icon &&
              React.createElement(icon, {
                size: 24,
                color: "var(--theme-text-primary)",
                weight: "bold",
              })}
            <label className="text-theme-text-primary text-md font-bold">
              {title}
            </label>
            <span className={`text-xs px-2 py-0.5 rounded-full ${layerColor}`}>
              {layerLabel}
            </span>
          </div>
          <div className="flex items-center gap-x-2 text-theme-text-secondary">
            <Lock size={16} />
            <span className="text-sm font-medium text-green-400">始终启用</span>
          </div>
        </div>
        {image && <img src={image} alt={title} className="w-full rounded-md" />}
        <p className="text-theme-text-secondary text-opacity-60 text-xs font-medium py-1.5">
          {description}
          <br />
          <br />
          此技能是基础能力，始终启用且不可关闭。
          {layer === 1 && " 系统级工具用于补充 LLM 的固有限制。"}
          {layer === 2 && " 输出级工具是所有 Agent 的通用交付能力。"}
        </p>
      </div>
    </div>
  );
}
