import React, { memo, useMemo, useState } from "react";
import { Robot, X } from "@phosphor-icons/react";
import AssistantLibrary from "@/models/assistantLibrary";
import { useTranslation } from "react-i18next";

/**
 * 水平轮播卡片组件
 * @param {Object} props
 * @param {Object} props.assistant - 助手数据
 * @param {boolean} props.isActive - 是否为当前选中
 * @param {Function} props.onClick - 点击回调
 */
const AgentCard3D = memo(
  function AgentCard3D({ assistant, isActive, onClick }) {
    const { t } = useTranslation();
    const [showDetail, setShowDetail] = useState(false);

    const name =
      assistant.instanceName ||
      assistant.template?.employeeName ||
      assistant.template?.name ||
      "AI 员工";
    const title = assistant.template?.employeeTitle || "";
    const description = assistant.template?.description || "智能助手";
    const shortDesc =
      title ||
      (description.length > 25
        ? description.slice(0, 25) + "..."
        : description);

    // 头像 URL
    const avatarUrl = assistant.template?.avatarUrl
      ? AssistantLibrary.getIconUrl(assistant.template.avatarUrl)
      : null;
    const iconEmoji = assistant.template?.icon;

    // 技能标签 - 解析 JSON 字符串并取前2个
    const skills = useMemo(() => {
      try {
        const skillsData = assistant.template?.skills;
        if (!skillsData) return [];

        const parsed =
          typeof skillsData === "string" ? JSON.parse(skillsData) : skillsData;
        return Array.isArray(parsed) ? parsed.slice(0, 2) : [];
      } catch (e) {
        console.error("Failed to parse skills:", e);
        return [];
      }
    }, [assistant.template?.skills]);

    /**
     * 处理卡片点击
     * - 如果已选中，则打开详情弹窗
     * - 如果未选中，则选中该卡片
     */
    const handleCardClick = (e) => {
      if (isActive) {
        e.stopPropagation();
        setShowDetail(true);
      } else {
        onClick?.(e);
      }
    };

    return (
      <>
        <div
          onClick={handleCardClick}
          className={`
            relative flex-shrink-0
            w-[280px] h-[500px]
            rounded-2xl px-5 pt-6 pb-5
            flex flex-col items-center
            cursor-pointer
            transition-all duration-300 ease-out
            overflow-hidden
            group
            ${
              isActive
                ? "bg-gradient-to-br from-blue-500/25 to-purple-500/25 ring-2 ring-blue-400 ring-inset shadow-lg shadow-blue-500/20 light:bg-none light:bg-[#DFF2FE] light:border light:border-[#A6D4FA] light:ring-0 light:shadow-md"
                : "bg-white/5 hover:bg-white/10 hover:scale-[1.01] opacity-80 hover:opacity-100 light:bg-theme-bg-secondary light:border light:border-theme-border light:shadow-sm light:opacity-100 light:hover:bg-theme-bg-primary light:hover:border-[#A6D4FA]"
            }
          `}
        >
          {/* 雇佣徽章 - 卡片右上角 */}
          <div
            className="absolute top-2 right-2 bg-blue-500 text-theme-text-primary light:text-[#ffffff] text-[10px] px-2.5 py-1 rounded-full font-semibold shadow-lg border border-blue-300/30 z-10"
            aria-label={t?.("badge.hired") || "已雇佣员工"}
          >
            {t?.("badge.hired") || "雇佣"}
          </div>

          {/* 头像 */}
          <div className="mt-3 flex items-center justify-center">
            <div
              className={`
                w-[240px] h-[240px] rounded-full flex items-center justify-center overflow-hidden
                transition-all duration-300
                ${
                  isActive
                    ? "ring-4 ring-blue-400/60 shadow-lg shadow-blue-500/20 light:ring-[#A6D4FA]"
                    : "ring-1 ring-white/10 light:ring-theme-border"
                }
                ${
                  !avatarUrl
                    ? "bg-gradient-to-br from-blue-500/80 to-purple-500/80"
                    : ""
                }
              `}
            >
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={name}
                  className="w-full h-full object-cover"
                  loading="lazy"
                  onError={(e) => {
                    e.target.style.display = "none";
                    if (e.target.nextSibling) {
                      e.target.nextSibling.style.display = "flex";
                    }
                  }}
                />
              ) : iconEmoji ? (
                <span className="text-7xl">{iconEmoji}</span>
              ) : (
                <Robot size={72} className="text-theme-text-primary" />
              )}
              {/* 图片加载失败时的备用显示 */}
              {avatarUrl && (
                <div className="hidden w-full h-full bg-gradient-to-br from-blue-500/80 to-purple-500/80 items-center justify-center">
                  <Robot size={72} className="text-theme-text-primary" />
                </div>
              )}
            </div>
          </div>

          {/* 名称 / 职位 */}
          <div className="mt-6 w-full text-center px-2">
            <h3
              className={`
                text-xl font-semibold leading-tight tracking-tight truncate
                ${isActive ? "text-blue-200 light:text-theme-home-text" : "text-theme-home-text"}
              `}
            >
              {name}
            </h3>
            <p className="mt-2 text-sm text-theme-home-text-secondary text-center line-clamp-2 leading-snug px-6">
              {shortDesc}
            </p>
          </div>

          {/* 技能标签 - 底部更集中，便于对比 */}
          {skills.length > 0 && (
            <div className="mt-auto w-full pt-5 flex flex-col items-center gap-2">
              {skills.map((skill, idx) => (
                <span
                  key={idx}
                  className={`
                    text-xs px-4 py-1.5 rounded-full whitespace-nowrap max-w-[240px] truncate
                    border transition-colors duration-200
                    ${
                      isActive
                        ? "bg-blue-500/40 text-theme-text-primary border-blue-300/30 light:bg-theme-accent-primary light:text-[#ffffff] light:border-transparent"
                        : "bg-white/10 text-white/70 border-theme-border group-hover:bg-white/15 group-hover:text-white/80 light:bg-theme-bg-chat-input light:text-theme-text-primary light:border-theme-border light:group-hover:bg-theme-bg-primary"
                    }
                  `}
                >
                  {skill}
                </span>
              ))}
            </div>
          )}

          {/* 选中指示器 */}
          {isActive && (
            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-14 h-1.5 bg-blue-400 rounded-full animate-pulse" />
          )}

          {/* 点击提示 - 仅选中状态显示 */}
          {isActive && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/0 hover:bg-black/20 transition-colors duration-200 rounded-2xl">
              <span className="text-white/0 hover:text-white/80 text-xs font-medium transition-colors duration-200">
                点击查看详情
              </span>
            </div>
          )}
        </div>

        {/* 详情弹窗 */}
        {showDetail && (
          <div
            className="fixed inset-0 bg-black/60 light:bg-black/40 flex items-center justify-center z-50"
            onClick={(e) => {
              e.stopPropagation();
              setShowDetail(false);
            }}
          >
            <div
              className="bg-gradient-to-br from-gray-900 to-gray-800 light:bg-none light:bg-theme-bg-secondary rounded-2xl p-6 max-w-md w-[90%] shadow-2xl border border-theme-border light:border-theme-border"
              onClick={(e) => e.stopPropagation()}
            >
              {/* 弹窗头部 */}
              <div className="flex items-start gap-4 mb-4">
                {/* 头像 */}
                <div className="w-16 h-16 rounded-full overflow-hidden flex-shrink-0 bg-gradient-to-br from-blue-500/80 to-purple-500/80 flex items-center justify-center">
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt={name}
                      className="w-full h-full object-cover"
                    />
                  ) : iconEmoji ? (
                    <span className="text-3xl">{iconEmoji}</span>
                  ) : (
                    <Robot size={32} className="text-theme-text-primary" />
                  )}
                </div>
                {/* 名称和职位 */}
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-bold text-theme-text-primary light:text-theme-text-primary truncate">
                    {name}
                  </h3>
                  <p className="text-sm text-white/60 light:text-theme-text-secondary">
                    {title || "AI 智能助手"}
                  </p>
                </div>
                {/* 关闭按钮 */}
                <button
                  onClick={() => setShowDetail(false)}
                  className="text-white/40 hover:text-theme-text-primary light:text-theme-text-secondary light:hover:text-theme-text-primary transition-colors p-1"
                >
                  <X size={20} />
                </button>
              </div>

              {/* 能力描述 */}
              <div className="mb-4">
                <h4 className="text-xs font-semibold text-white/40 light:text-theme-text-secondary uppercase tracking-wider mb-2">
                  能力简介
                </h4>
                <p className="text-sm text-white/80 light:text-theme-text-primary leading-relaxed">
                  {description}
                </p>
              </div>

              {/* 技能标签 */}
              {skills.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-white/40 light:text-theme-text-secondary uppercase tracking-wider mb-2">
                    专业技能
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {skills.map((skill, idx) => (
                      <span
                        key={idx}
                        className="text-xs px-3 py-1 rounded-full bg-blue-500/30 text-blue-200 border border-blue-400/20 light:bg-theme-bg-chat-input light:text-theme-text-primary light:border-theme-border"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* 操作按钮 */}
              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => setShowDetail(false)}
                  className="px-4 py-2 text-sm font-medium text-white/70 hover:text-theme-text-primary light:text-theme-text-secondary light:hover:text-theme-text-primary transition-colors"
                >
                  关闭
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  },
  (prev, next) =>
    prev.assistant.id === next.assistant.id && prev.isActive === next.isActive
);

export default AgentCard3D;
