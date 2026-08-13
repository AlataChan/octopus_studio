import { useEffect, useState } from "react";
import { Users, Timer, CheckCircle } from "@phosphor-icons/react";
import AITeam from "@/models/aiTeam";
import Workspace from "@/models/workspace";

/**
 * 格式化毫秒为可读时间
 * @param {number} ms - 毫秒数
 * @returns {string} 格式化后的时间字符串
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

/**
 * AI 团队概览条组件
 * 显示团队统计数据和快速入口
 */
export default function TeamSummary() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const workspaces = await Workspace.all();
        if (workspaces.length === 0) {
          setLoading(false);
          return;
        }

        const firstWorkspace = workspaces[0];
        const res = await AITeam.getPerformance(firstWorkspace.slug, {
          period: "7d",
        });
        if (res.success && res.data?.summary) {
          setStats(res.data.summary);
        }
      } catch (error) {
        console.error("[TeamSummary] Failed to fetch stats:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  return (
    <div className="bg-gradient-to-r from-blue-600/20 to-purple-600/20 rounded-xl p-4 mb-2 border border-blue-500/20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
        {/* 左侧：标题 */}
        <div className="flex items-center gap-2">
          <Users size={20} className="text-blue-400" />
          <h2 className="text-lg font-semibold text-theme-text-primary">
            今天让你的 AI 团队帮你完成什么？
          </h2>
        </div>

        {/* 右侧：统计信息 */}
        <div className="flex flex-wrap items-center gap-4 text-sm text-theme-text-secondary">
          <div className="flex items-center gap-1.5">
            <Timer size={14} className="text-yellow-400" />
            <span>
              平均响应时间:{" "}
              <span className="text-theme-text-primary font-medium">
                {loading ? "..." : formatMs(stats?.avgResponseTimeMs)}
              </span>
            </span>
          </div>
          <span className="text-theme-text-secondary/50">|</span>
          <div className="flex items-center gap-1.5">
            <CheckCircle size={14} className="text-green-400" />
            <span>
              本周完成任务:{" "}
              <span className="text-theme-text-primary font-medium">
                {loading ? "..." : `${stats?.completedThisWeek || 0}个`}
              </span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
