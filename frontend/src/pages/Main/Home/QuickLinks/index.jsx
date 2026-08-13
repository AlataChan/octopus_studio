import { Robot, CaretLeft, CaretRight } from "@phosphor-icons/react";
import AssistantLibrary from "@/models/assistantLibrary";
import { useState, useEffect, useRef } from "react";
import Carousel3D from "@/components/Carousel3D";

/**
 * 检测是否为桌面端（宽度 >= 1024px）
 */
function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(
    typeof window !== "undefined" ? window.innerWidth >= 1024 : true
  );

  useEffect(() => {
    const handleResize = () => {
      setIsDesktop(window.innerWidth >= 1024);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return isDesktop;
}

/**
 * 员工卡片选择器组件 - 水平滑动卡片设计
 */
function AssistantSelector({ assistants, selectedId, onSelect }) {
  const scrollRef = useRef(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(false);

  // 检查是否需要显示箭头
  const checkArrows = () => {
    if (!scrollRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
    setShowLeftArrow(scrollLeft > 10);
    setShowRightArrow(scrollLeft < scrollWidth - clientWidth - 10);
  };

  useEffect(() => {
    checkArrows();
    const container = scrollRef.current;
    if (container) {
      container.addEventListener("scroll", checkArrows);
      window.addEventListener("resize", checkArrows);
    }
    return () => {
      if (container) container.removeEventListener("scroll", checkArrows);
      window.removeEventListener("resize", checkArrows);
    };
  }, [assistants]);

  const scroll = (direction) => {
    if (!scrollRef.current) return;
    const cardWidth = 130; // 卡片宽度 + gap
    scrollRef.current.scrollBy({
      left: direction === "left" ? -cardWidth * 2 : cardWidth * 2,
      behavior: "smooth",
    });
  };

  if (!assistants || assistants.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-theme-text-secondary py-4">
        <Robot size={16} />
        <span>暂无 AI 员工，请先从人才市场雇佣</span>
      </div>
    );
  }

  return (
    <div className="relative group">
      {/* 左箭头 */}
      {showLeftArrow && (
        <button
          onClick={() => scroll("left")}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-8 h-8 bg-black/60 hover:bg-black/80 rounded-full flex items-center justify-center text-theme-text-primary transition-all opacity-0 group-hover:opacity-100"
        >
          <CaretLeft size={18} weight="bold" />
        </button>
      )}

      {/* 卡片容器 - 添加 padding 防止选中卡片的边框溢出 */}
      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto py-2 px-1 scroll-smooth snap-x snap-mandatory scrollbar-none"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {assistants.map((assistant) => {
          const isSelected = selectedId === assistant.id;
          const name =
            assistant.instanceName ||
            assistant.template?.employeeName ||
            assistant.template?.name ||
            "AI 员工";
          const title = assistant.template?.employeeTitle || "";
          const description = assistant.template?.description || "智能助手";
          // 优先显示职位，否则显示简介
          const shortDesc =
            title ||
            (description.length > 18
              ? description.slice(0, 18) + "..."
              : description);
          // 头像 URL：优先 avatarUrl，其次 icon (emoji)
          const avatarUrl = assistant.template?.avatarUrl
            ? AssistantLibrary.getIconUrl(assistant.template.avatarUrl)
            : null;
          const iconEmoji = assistant.template?.icon;

          return (
            <button
              key={assistant.id}
              onClick={() => onSelect(assistant.id)}
              className={`
                flex-shrink-0 snap-start
                w-[120px] p-2.5 rounded-xl
                flex flex-col items-center text-center
                transition-all duration-200 ease-out
                ${
                  isSelected
                    ? "bg-blue-500/20 ring-2 ring-blue-400 shadow-lg shadow-blue-500/20 light:bg-[#DFF2FE] light:ring-[#A6D4FA] light:border light:border-[#A6D4FA] light:shadow-sm"
                    : "bg-white/5 hover:bg-white/10 light:bg-theme-bg-secondary light:border light:border-theme-border light:hover:bg-theme-bg-primary"
                }
              `}
            >
              {/* 头像 */}
              <div
                className={`
                w-12 h-12 rounded-full flex items-center justify-center overflow-hidden
                ${isSelected ? "ring-2 ring-blue-400/50 light:ring-[#A6D4FA]" : ""}
                ${!avatarUrl ? "bg-gradient-to-br from-blue-500/80 to-purple-500/80" : ""}
              `}
              >
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt={name}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.target.style.display = "none";
                      e.target.nextSibling.style.display = "flex";
                    }}
                  />
                ) : iconEmoji ? (
                  <span className="text-xl">{iconEmoji}</span>
                ) : (
                  <Robot size={22} className="text-theme-text-primary" />
                )}
                {/* 图片加载失败时的备用显示 */}
                {avatarUrl && (
                  <div className="hidden w-full h-full bg-gradient-to-br from-blue-500/80 to-purple-500/80 items-center justify-center">
                    <Robot size={22} className="text-theme-text-primary" />
                  </div>
                )}
              </div>

              {/* 名称 */}
              <span
                className={`
                mt-2 text-xs font-medium truncate w-full
                ${
                  isSelected
                    ? "text-blue-300 light:text-theme-home-text"
                    : "text-theme-home-text"
                }
              `}
              >
                {name}
              </span>

              {/* 职位/简介 */}
              <span className="mt-0.5 text-[10px] text-theme-text-secondary line-clamp-2 leading-relaxed h-[28px]">
                {shortDesc}
              </span>
            </button>
          );
        })}
      </div>

      {/* 右箭头 */}
      {showRightArrow && (
        <button
          onClick={() => scroll("right")}
          className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-8 h-8 bg-black/60 hover:bg-black/80 rounded-full flex items-center justify-center text-theme-text-primary transition-all opacity-0 group-hover:opacity-100"
        >
          <CaretRight size={18} weight="bold" />
        </button>
      )}
    </div>
  );
}

export default function QuickLinks({
  assistants = [],
  selectedAssistantId = null,
  onSelectAssistant,
  loading = false,
}) {
  const isDesktop = useIsDesktop();

  return (
    <div className="bg-theme-home-bg-card border border-theme-home-border shadow-sm rounded-xl p-5 flex flex-col min-h-[520px]">
      {/* 标题 */}
      <h1 className="text-theme-home-text text-base font-semibold mb-4 flex items-center gap-2">
        <Robot size={18} className="text-blue-400" />
        选一个 AI 员工，开始一个任务
      </h1>

      {/* 员工选择区域 - 桌面端使用 3D 轮播，移动端使用 2D 卡片 */}
      {loading ? (
        <div className="text-sm text-theme-text-secondary py-2">加载中...</div>
      ) : isDesktop && assistants.length > 0 ? (
        <div className="flex-1 min-h-0 flex items-center">
          <Carousel3D
            assistants={assistants}
            selectedId={selectedAssistantId}
            onSelect={onSelectAssistant}
          />
        </div>
      ) : (
        <AssistantSelector
          assistants={assistants}
          selectedId={selectedAssistantId}
          onSelect={onSelectAssistant}
        />
      )}
    </div>
  );
}
