import React, { useState, useEffect } from "react";
import {
  Brain,
  Database,
  Graph,
  HardDrive,
  ArrowsClockwise,
} from "@phosphor-icons/react";
import MemoryStats from "@/models/memoryStats";

/**
 * 记忆系统健康度监控面板
 *
 * Phase 1: 显示记忆系统的统计信息和健康状态
 */
export default function MemoryStatsPanel() {
  const [stats, setStats] = useState(null);
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const [statsResult, healthResult] = await Promise.all([
        MemoryStats.getSystemStats(),
        MemoryStats.getHealth(),
      ]);

      if (statsResult.success) {
        setStats(statsResult.stats);
      }
      if (healthResult.success) {
        setHealth(healthResult.health);
      }
    } catch (error) {
      console.error("获取记忆统计失败:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const getHealthColor = (status) => {
    switch (status) {
      case "healthy":
        return "text-green-400";
      case "warning":
        return "text-yellow-400";
      case "critical":
        return "text-red-400";
      default:
        return "text-white/60";
    }
  };

  const getHealthBg = (status) => {
    switch (status) {
      case "healthy":
        return "bg-green-500/20";
      case "warning":
        return "bg-yellow-500/20";
      case "critical":
        return "bg-red-500/20";
      default:
        return "bg-white/10";
    }
  };

  return (
    <div className="rounded-lg border border-theme-border bg-white/5 p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-purple-400" />
          <h3 className="text-theme-text-primary font-medium">记忆系统</h3>
        </div>
        <button
          onClick={fetchStats}
          disabled={loading}
          className="p-1.5 hover:bg-white/10 rounded transition-colors disabled:opacity-50"
          title="刷新"
        >
          <ArrowsClockwise
            className={`h-4 w-4 text-white/60 ${loading ? "animate-spin" : ""}`}
          />
        </button>
      </div>

      {loading && !stats ? (
        <div className="text-white/60 text-sm py-8 text-center">加载中...</div>
      ) : (
        <div className="space-y-4">
          {/* 健康状态 */}
          {health && (
            <div
              className={`flex items-center justify-between p-3 rounded-lg ${getHealthBg(health.status)}`}
            >
              <span className="text-white/80 text-sm">系统状态</span>
              <span
                className={`text-sm font-medium ${getHealthColor(health.status)}`}
              >
                {health.status === "healthy"
                  ? "健康"
                  : health.status === "warning"
                    ? "警告"
                    : "异常"}
              </span>
            </div>
          )}

          {/* 统计数据网格 */}
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              icon={<Database className="h-4 w-4 text-blue-400" />}
              label="向量记忆"
              value={stats?.vectorMemories || 0}
              unit="条"
            />
            <StatCard
              icon={<Graph className="h-4 w-4 text-green-400" />}
              label="图谱节点"
              value={stats?.graphNodes || 0}
              unit="个"
            />
            <StatCard
              icon={<HardDrive className="h-4 w-4 text-yellow-400" />}
              label="存储空间"
              value={formatSize(stats?.storageUsed || 0)}
              unit=""
            />
            <StatCard
              icon={<Brain className="h-4 w-4 text-purple-400" />}
              label="用户记忆"
              value={stats?.userMemories || 0}
              unit="条"
            />
          </div>

          {/* 健康检查详情 */}
          {health?.checks && (
            <div className="mt-4 pt-4 border-t border-theme-border">
              <p className="text-xs text-white/40 mb-2">健康检查</p>
              <div className="space-y-1">
                {Object.entries(health.checks).map(([key, value]) => (
                  <div
                    key={key}
                    className="flex items-center justify-between text-xs"
                  >
                    <span className="text-white/60">
                      {formatCheckName(key)}
                    </span>
                    <span className={value ? "text-green-400" : "text-red-400"}>
                      {value ? "✓" : "✗"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, label, value, unit }) {
  return (
    <div className="p-3 rounded-lg bg-white/5 border border-white/5">
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-xs text-white/40">{label}</span>
      </div>
      <p className="text-lg font-semibold text-theme-text-primary">
        {value}
        <span className="text-sm text-white/40 ml-1">{unit}</span>
      </p>
    </div>
  );
}

function formatSize(bytes) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function formatCheckName(key) {
  const names = {
    vectorDbConnected: "向量数据库连接",
    graphDbConnected: "图谱数据库连接",
    cacheAvailable: "缓存可用",
    storageHealthy: "存储健康",
  };
  return names[key] || key;
}
