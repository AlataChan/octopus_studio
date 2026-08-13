import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from "react";
import { CaretLeft, CaretRight, Robot } from "@phosphor-icons/react";
import AgentCard3D from "./AgentCard3D";
import AssistantLibrary from "@/models/assistantLibrary";

/** 每页显示的卡片数量 */
const DEFAULT_CARDS_PER_VIEW = 1;
/** 自动轮播间隔（毫秒） */
const AUTO_SCROLL_INTERVAL = 4000;

/**
 * 水平轮播组件 - 并排显示 1-2 张卡片
 * @param {Object} props
 * @param {Array} props.assistants - 助手列表
 * @param {string} props.selectedId - 当前选中的助手 ID
 * @param {Function} props.onSelect - 选中回调
 */
export default function Carousel3D({ assistants, selectedId, onSelect }) {
  const containerRef = useRef(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isAutoRotating, setIsAutoRotating] = useState(true);
  const [cardsPerView, setCardsPerView] = useState(DEFAULT_CARDS_PER_VIEW);

  const autoRotateTimerRef = useRef(null);
  const userPauseTimerRef = useRef(null);

  const cardCount = assistants?.length || 0;
  const totalPages = Math.ceil(cardCount / cardsPerView);

  // 图片预加载 - 组件挂载时预加载所有头像
  useEffect(() => {
    if (!assistants || assistants.length === 0) return;

    assistants.forEach((assistant) => {
      const avatarUrl = assistant.template?.avatarUrl
        ? AssistantLibrary.getIconUrl(assistant.template.avatarUrl)
        : null;

      if (avatarUrl) {
        const img = new Image();
        img.src = avatarUrl;
        img.onerror = () => {
          console.warn(`Failed to preload avatar: ${avatarUrl}`);
        };
      }
    });
  }, [assistants]);

  // 用 ref 追踪是否由内部触发的变化，避免循环
  const isInternalChange = useRef(false);

  // 同步外部 selectedId 到内部 index
  useEffect(() => {
    if (isInternalChange.current) {
      isInternalChange.current = false;
      return;
    }
    if (selectedId && assistants?.length > 0) {
      const index = assistants.findIndex((a) => a.id === selectedId);
      if (index !== -1 && index !== selectedIndex) {
        setSelectedIndex(index);
        // 自动跳转到包含选中卡片的页
        const targetPage = Math.floor(index / cardsPerView);
        setCurrentPage(targetPage);
      }
    }
  }, [selectedId, assistants, cardsPerView]);

  // 根据可用宽度动态调整展示卡片数：默认 1，宽屏显示 2
  useEffect(() => {
    if (!containerRef.current || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver((entries) => {
      const width = entries?.[0]?.contentRect?.width ?? 0;
      const next = width >= 980 ? 2 : 1;
      setCardsPerView((prev) => (prev === next ? prev : next));
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // 当 cardsPerView 变化时，确保分页与选中索引一致
  useEffect(() => {
    if (!assistants?.length) return;
    const nextPage = Math.floor(selectedIndex / cardsPerView);
    setCurrentPage((prev) => {
      const maxPage = Math.max(0, totalPages - 1);
      const desired = Math.min(maxPage, nextPage);
      return prev === desired ? prev : desired;
    });
  }, [assistants?.length, cardsPerView, selectedIndex, totalPages]);

  // 清理所有定时器
  const clearAllTimers = useCallback(() => {
    if (autoRotateTimerRef.current) {
      clearInterval(autoRotateTimerRef.current);
      autoRotateTimerRef.current = null;
    }
    if (userPauseTimerRef.current) {
      clearTimeout(userPauseTimerRef.current);
      userPauseTimerRef.current = null;
    }
  }, []);

  // 组件卸载时清理
  useEffect(() => {
    return () => clearAllTimers();
  }, [clearAllTimers]);

  // 自动轮播
  useEffect(() => {
    if (!isAutoRotating || totalPages <= 1) return;

    autoRotateTimerRef.current = setInterval(() => {
      setCurrentPage((prev) => {
        const nextPage = (prev + 1) % totalPages;
        // 自动选中新页的第一张卡片
        const newSelectedIndex = nextPage * cardsPerView;
        if (assistants?.[newSelectedIndex]) {
          setSelectedIndex(newSelectedIndex);
          isInternalChange.current = true;
          // 使用 setTimeout 延迟调用 onSelect，避免在 setState 回调中更新父组件
          setTimeout(() => {
            onSelect(assistants[newSelectedIndex].id);
          }, 0);
        }
        return nextPage;
      });
    }, AUTO_SCROLL_INTERVAL);

    return () => {
      if (autoRotateTimerRef.current) {
        clearInterval(autoRotateTimerRef.current);
      }
    };
  }, [isAutoRotating, totalPages, assistants, onSelect, cardsPerView]);

  // 页面可见性检测 - 隐藏时暂停
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        setIsAutoRotating(false);
      } else {
        setTimeout(() => setIsAutoRotating(true), 1000);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  // 用户交互处理 - 暂停自动轮播
  const handleUserInteraction = useCallback(() => {
    setIsAutoRotating(false);
    clearAllTimers();

    userPauseTimerRef.current = setTimeout(() => {
      setIsAutoRotating(true);
    }, 5000);
  }, [clearAllTimers]);

  // 下一页
  const nextPage = useCallback(() => {
    handleUserInteraction();
    setCurrentPage((prev) => {
      const nextP = (prev + 1) % totalPages;
      const newSelectedIndex = nextP * cardsPerView;
      if (assistants?.[newSelectedIndex]) {
        setSelectedIndex(newSelectedIndex);
        isInternalChange.current = true;
        setTimeout(() => onSelect(assistants[newSelectedIndex].id), 0);
      }
      return nextP;
    });
  }, [handleUserInteraction, totalPages, assistants, onSelect, cardsPerView]);

  // 上一页
  const prevPage = useCallback(() => {
    handleUserInteraction();
    setCurrentPage((prev) => {
      const nextP = (prev - 1 + totalPages) % totalPages;
      const newSelectedIndex = nextP * cardsPerView;
      if (assistants?.[newSelectedIndex]) {
        setSelectedIndex(newSelectedIndex);
        isInternalChange.current = true;
        setTimeout(() => onSelect(assistants[newSelectedIndex].id), 0);
      }
      return nextP;
    });
  }, [handleUserInteraction, totalPages, assistants, onSelect, cardsPerView]);

  // 点击卡片
  const handleCardClick = useCallback(
    (index) => {
      handleUserInteraction();
      setSelectedIndex(index);
      isInternalChange.current = true;
      if (assistants?.[index]) {
        onSelect(assistants[index].id);
      }
    },
    [handleUserInteraction, assistants, onSelect]
  );

  // 点击分页点
  const handleDotClick = useCallback(
    (pageIndex) => {
      handleUserInteraction();
      setCurrentPage(pageIndex);
      const newSelectedIndex = pageIndex * cardsPerView;
      if (assistants?.[newSelectedIndex]) {
        setSelectedIndex(newSelectedIndex);
        isInternalChange.current = true;
        setTimeout(() => onSelect(assistants[newSelectedIndex].id), 0);
      }
    },
    [handleUserInteraction, assistants, onSelect, cardsPerView]
  );

  // 键盘支持
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        prevPage();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        nextPage();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [prevPage, nextPage]);

  // 当前页可见的卡片
  const visibleCards = useMemo(() => {
    if (!assistants?.length) return [];
    const startIndex = currentPage * cardsPerView;
    return assistants
      .slice(startIndex, startIndex + cardsPerView)
      .map((assistant, idx) => ({
        assistant,
        index: startIndex + idx,
        isActive: startIndex + idx === selectedIndex,
      }));
  }, [assistants, currentPage, selectedIndex, cardsPerView]);

  // 空状态
  if (!assistants || assistants.length === 0) {
    return (
      <div className="flex items-center justify-center h-[500px] text-white/60">
        <Robot size={24} className="mr-2" />
        <span>暂无 AI 员工，请先从人才市场雇佣</span>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full py-4"
      onMouseEnter={() => setIsAutoRotating(false)}
      onMouseLeave={() => {
        userPauseTimerRef.current = setTimeout(() => {
          setIsAutoRotating(true);
        }, 1000);
      }}
    >
      {/* 主容器：箭头 + 卡片 */}
      <div className="flex items-center justify-center gap-3">
        {/* 左箭头 */}
        <button
          onClick={prevPage}
          disabled={totalPages <= 1}
          className={`
            flex-shrink-0 w-11 h-11 rounded-full flex items-center justify-center
            transition-all duration-200
            ${
              totalPages <= 1
                ? "bg-white/5 text-white/20 cursor-not-allowed light:bg-theme-bg-chat-input light:text-theme-text-secondary light:border light:border-theme-border light:opacity-60"
                : "bg-white/10 hover:bg-white/20 text-theme-text-primary hover:scale-110 active:scale-95 light:bg-theme-bg-chat-input light:text-theme-text-primary light:border light:border-theme-border light:hover:bg-theme-bg-primary"
            }
          `}
          aria-label="上一页"
        >
          <CaretLeft size={22} weight="bold" />
        </button>

        {/* 卡片容器 */}
        <div className="flex-1 overflow-hidden">
          <div className="flex gap-4 justify-center transition-transform duration-500 ease-out">
            {visibleCards.map(({ assistant, index, isActive }) => (
              <AgentCard3D
                key={assistant.id}
                assistant={assistant}
                isActive={isActive}
                onClick={() => handleCardClick(index)}
              />
            ))}
            {/* 如果当前页卡片不足，用占位符填充保持布局 */}
            {visibleCards.length < cardsPerView &&
              Array.from({ length: cardsPerView - visibleCards.length }).map(
                (_, idx) => (
                  <div
                    key={`placeholder-${idx}`}
                    className="w-[280px] h-[500px]"
                  />
                )
              )}
          </div>
        </div>

        {/* 右箭头 */}
        <button
          onClick={nextPage}
          disabled={totalPages <= 1}
          className={`
            flex-shrink-0 w-11 h-11 rounded-full flex items-center justify-center
            transition-all duration-200
            ${
              totalPages <= 1
                ? "bg-white/5 text-white/20 cursor-not-allowed light:bg-theme-bg-chat-input light:text-theme-text-secondary light:border light:border-theme-border light:opacity-60"
                : "bg-white/10 hover:bg-white/20 text-theme-text-primary hover:scale-110 active:scale-95 light:bg-theme-bg-chat-input light:text-theme-text-primary light:border light:border-theme-border light:hover:bg-theme-bg-primary"
            }
          `}
          aria-label="下一页"
        >
          <CaretRight size={22} weight="bold" />
        </button>
      </div>

      {/* 分页指示器 - 更大的点 */}
      <div className="flex justify-center items-center gap-3 mt-5">
        {Array.from({ length: totalPages }).map((_, idx) => (
          <button
            key={idx}
            onClick={() => handleDotClick(idx)}
            className={`
              rounded-full transition-all duration-300 cursor-pointer
              ${
                idx === currentPage
                  ? "w-8 h-3 bg-blue-400 shadow-lg shadow-blue-400/40 light:bg-theme-accent-primary light:shadow-none"
                  : "w-3 h-3 bg-white/30 hover:bg-white/50 hover:scale-110 light:bg-black/10 light:hover:bg-black/20"
              }
            `}
            aria-label={`跳转到第 ${idx + 1} 页`}
          />
        ))}
      </div>

      {/* 自动轮播指示器 */}
      {isAutoRotating && totalPages > 1 && (
        <div className="absolute top-2 right-2 text-xs text-white/40 flex items-center gap-1.5">
          <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
          自动播放
        </div>
      )}
    </div>
  );
}
