import { useEffect, useMemo, useRef, useState } from "react";
import {
  CaretLeft,
  CaretRight,
  CheckCircle,
  Timer,
} from "@phosphor-icons/react";
import AITeam from "@/models/aiTeam";

const RIGHT_SIDEBAR_OPEN_KEY = "alata_home_right_sidebar_open";
const RIGHT_SIDEBAR_WIDTH_KEY = "alata_home_right_sidebar_width";

const RIGHT_SIDEBAR_MIN_WIDTH = 240;
const RIGHT_SIDEBAR_DEFAULT_WIDTH = 280;
const RIGHT_SIDEBAR_MAX_WIDTH = 420;

function clampWidth(width) {
  return Math.max(
    RIGHT_SIDEBAR_MIN_WIDTH,
    Math.min(RIGHT_SIDEBAR_MAX_WIDTH, width)
  );
}

function getStoredWidth() {
  const raw = window.localStorage.getItem(RIGHT_SIDEBAR_WIDTH_KEY);
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return RIGHT_SIDEBAR_DEFAULT_WIDTH;
  return clampWidth(parsed);
}

function getStoredOpen() {
  const raw = window.localStorage.getItem(RIGHT_SIDEBAR_OPEN_KEY);
  if (!raw) return true; // 默认展开
  return raw === "open";
}

/**
 * 格式化毫秒为可读时间
 * @param {number} ms
 * @returns {string}
 */
function formatMs(ms) {
  if (!ms || ms <= 0) return "0s";
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return `${minutes}m ${remainingSeconds}s`;
}

function TeamStatsCard({ workspaceSlug }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      if (!workspaceSlug) {
        setLoading(false);
        return;
      }
      try {
        const res = await AITeam.getPerformance(workspaceSlug, {
          period: "7d",
        });
        if (res.success && res.data?.summary) {
          setStats(res.data.summary);
        }
      } catch (error) {
        console.error("[HomeRightSidebar] Failed to fetch team stats:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, [workspaceSlug]);

  return (
    <div className="bg-theme-bg-secondary border border-theme-sidebar-border rounded-xl p-5 shadow-lg flex flex-col gap-4">
      <h3 className="text-theme-text-secondary text-sm font-medium">
        团队统计
      </h3>
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Timer size={14} className="text-yellow-400 flex-shrink-0" />
            <span className="text-theme-text-secondary text-sm font-medium truncate">
              平均响应时间
            </span>
          </div>
          <span className="text-theme-text-primary text-sm font-medium flex-shrink-0">
            {loading ? "..." : formatMs(stats?.avgResponseTimeMs)}
          </span>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <CheckCircle
              size={14}
              className="text-green-400 flex-shrink-0"
              weight="fill"
            />
            <span className="text-theme-text-secondary text-sm font-medium truncate">
              本周完成任务
            </span>
          </div>
          <span className="text-theme-text-primary text-sm font-medium flex-shrink-0">
            {loading ? "..." : `${stats?.completedThisWeek || 0}个`}
          </span>
        </div>
      </div>
    </div>
  );
}

function QuickActionsCard({ onChat, onNewKnowledge, onNewWork }) {
  return (
    <div className="bg-theme-bg-secondary border border-theme-sidebar-border rounded-xl p-5 shadow-lg flex flex-col gap-4">
      <h3 className="text-theme-text-secondary text-sm font-medium">
        快捷操作
      </h3>
      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={onChat}
          className="w-full flex items-center justify-between p-3 rounded-xl border border-theme-border hover:border-theme-accent-primary hover:bg-theme-sidebar-item-hover transition-all group bg-theme-bg-chat-input"
        >
          <span className="text-sm text-theme-text-primary group-hover:text-theme-accent-primary transition-colors">
            和 AI 员工对话
          </span>
        </button>
        <button
          type="button"
          onClick={onNewKnowledge}
          className="w-full flex items-center justify-between p-3 rounded-xl border border-theme-border hover:border-theme-accent-primary hover:bg-theme-sidebar-item-hover transition-all group bg-theme-bg-chat-input"
        >
          <span className="text-sm text-theme-text-primary group-hover:text-theme-accent-primary transition-colors">
            新知识
          </span>
        </button>
        <button
          type="button"
          onClick={onNewWork}
          className="w-full flex items-center justify-between p-3 rounded-xl border border-theme-border hover:border-theme-accent-primary hover:bg-theme-sidebar-item-hover transition-all group bg-theme-bg-chat-input"
        >
          <span className="text-sm text-theme-text-primary group-hover:text-theme-accent-primary transition-colors">
            新工作
          </span>
        </button>
      </div>
    </div>
  );
}

export default function HomeRightSidebar({
  workspaceSlug,
  onChat,
  onNewKnowledge,
  onNewWork,
}) {
  const [isOpen, setIsOpen] = useState(() => getStoredOpen());
  const [width, setWidth] = useState(() => getStoredWidth());

  const resizeStartXRef = useRef(0);
  const resizeStartWidthRef = useRef(width);
  const isResizingRef = useRef(false);

  useEffect(() => {
    window.localStorage.setItem(
      RIGHT_SIDEBAR_OPEN_KEY,
      isOpen ? "open" : "closed"
    );
  }, [isOpen]);

  useEffect(() => {
    window.localStorage.setItem(RIGHT_SIDEBAR_WIDTH_KEY, String(width));
  }, [width]);

  function stopResize() {
    isResizingRef.current = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    window.removeEventListener("mousemove", handleMouseMove);
    window.removeEventListener("mouseup", stopResize);
  }

  function handleMouseMove(e) {
    if (!isResizingRef.current) return;
    const delta = resizeStartXRef.current - e.clientX;
    const nextWidth = clampWidth(resizeStartWidthRef.current + delta);
    setWidth(nextWidth);
  }

  function startResize(e) {
    e.preventDefault();
    isResizingRef.current = true;
    resizeStartXRef.current = e.clientX;
    resizeStartWidthRef.current = width;
    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", stopResize);
  }

  useEffect(() => {
    return () => stopResize();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const containerStyle = useMemo(() => {
    return {
      width: isOpen ? `${width}px` : "0px",
    };
  }, [isOpen, width]);

  return (
    <>
      {!isOpen && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="absolute top-6 right-3 z-30 p-2 rounded-lg bg-theme-bg-secondary border border-theme-sidebar-border shadow-lg hover:bg-theme-sidebar-item-hover transition-colors"
          aria-label="展开右侧栏"
          title="展开右侧栏"
        >
          <CaretLeft size={18} className="text-theme-text-secondary" />
        </button>
      )}

      <div
        className="relative h-full flex-shrink-0 transition-all duration-500 overflow-hidden"
        style={containerStyle}
      >
        {/* Resize handle */}
        {isOpen && (
          <div
            role="separator"
            aria-orientation="vertical"
            onMouseDown={startResize}
            className="absolute left-0 top-0 h-full w-2 cursor-ew-resize z-20 hover:bg-theme-sidebar-item-hover"
            title="拖动调整右侧栏宽度"
          />
        )}

        <aside className="h-full w-full bg-theme-bg-container border-l border-theme-sidebar-border flex flex-col p-4 gap-4">
          <div className="flex items-center justify-end">
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="p-2 rounded-lg hover:bg-theme-sidebar-item-hover transition-colors"
              aria-label="收起右侧栏"
              title="收起右侧栏"
            >
              <CaretRight size={18} className="text-theme-text-secondary" />
            </button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto no-scroll flex flex-col gap-4">
            <TeamStatsCard workspaceSlug={workspaceSlug} />
            <QuickActionsCard
              onChat={onChat}
              onNewKnowledge={onNewKnowledge}
              onNewWork={onNewWork}
            />
          </div>
        </aside>
      </div>
    </>
  );
}
