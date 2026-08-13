import React, { useEffect, useMemo, useState } from "react";

import SkillHub from "@/models/skillHub";
import showToast from "@/utils/toast";

function formatTime(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString();
}

function badgeClass(status) {
  const s = String(status || "").toLowerCase();
  if (s === "running")
    return "bg-blue-500/10 text-blue-300 border border-blue-500/20";
  if (s === "done")
    return "bg-green-500/10 text-green-300 border border-green-500/20";
  if (s === "failed")
    return "bg-red-500/10 text-red-300 border border-red-500/20";
  if (s === "blocked")
    return "bg-yellow-500/10 text-yellow-300 border border-yellow-500/20";
  if (s === "pending")
    return "bg-white/5 text-theme-text-secondary border border-theme-border";
  return "bg-white/5 text-theme-text-secondary border border-theme-border";
}

const TYPE_LABELS = {
  "scheduler:knowledge_sync": "知识同步",
  "scheduler:skill_hub_discovery": "技能中心发现",
};

export default function SchedulerPanel() {
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState(null);
  const [recentJobs, setRecentJobs] = useState([]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await SkillHub.getSchedulerStatus();
      if (!res?.success) throw new Error(res?.error || "加载失败");
      setStatus(res.status || null);
      setRecentJobs(res.recentJobs || []);
    } catch (error) {
      showToast(error.message || "加载失败", "error");
      setStatus(null);
      setRecentJobs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const jobs = useMemo(() => {
    if (!Array.isArray(recentJobs)) return [];
    return recentJobs;
  }, [recentJobs]);

  const runTask = async (task) => {
    setRunning(true);
    try {
      const res = await SkillHub.runSchedulerTask(task);
      if (!res?.success) throw new Error(res?.error || "触发失败");
      const jobId = res?.result?.jobId || null;
      showToast(
        `已触发: ${res.task}${jobId ? ` (job=${jobId})` : ""}`,
        "success"
      );
      await load();
    } catch (error) {
      showToast(error.message || "触发失败", "error");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="text-lg font-bold text-theme-text-primary">
          Calendar
        </div>
        <button
          onClick={load}
          className="ml-auto px-3 py-2 rounded-lg bg-theme-sidebar-item-default hover:bg-theme-sidebar-item-hover text-white/90 transition-all text-sm font-medium"
        >
          刷新
        </button>
      </div>

      {loading && (
        <div className="text-theme-text-secondary text-sm">加载中...</div>
      )}

      {!loading && status && (
        <div className="bg-theme-bg-secondary border-2 border-theme-sidebar-border rounded-xl p-4 space-y-3">
          <div className="text-sm text-theme-text-primary font-semibold">
            Scheduler 状态
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs text-theme-text-secondary">
            <div>
              <span className="text-theme-text-primary/80">
                systemCronEnabled:
              </span>{" "}
              {status.systemCronEnabled ? "true" : "false"}
            </div>
            <div>
              <span className="text-theme-text-primary/80">
                systemTaskCount:
              </span>{" "}
              {status.systemTaskCount}
            </div>
            <div>
              <span className="text-theme-text-primary/80">userTaskCount:</span>{" "}
              {status.userTaskCount}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="border border-white/5 rounded-lg p-3 bg-theme-bg-container/70">
              <div className="text-xs font-semibold text-theme-text-primary">
                知识同步
              </div>
              <div className="text-xs text-theme-text-secondary mt-1">
                schedule: {status?.knowledgeSync?.schedule || "-"}
              </div>
              <div className="text-xs text-theme-text-secondary mt-1">
                lastSyncTime:{" "}
                {formatTime(status?.knowledgeSync?.lastSyncTime) || "-"}
              </div>
              <div className="mt-2">
                <button
                  onClick={() => runTask("knowledge-sync")}
                  disabled={running}
                  className="px-3 py-2 rounded-lg bg-theme-sidebar-item-default hover:bg-theme-sidebar-item-hover text-white/90 transition-all text-sm font-medium disabled:opacity-60"
                >
                  立即执行
                </button>
              </div>
            </div>

            <div className="border border-white/5 rounded-lg p-3 bg-theme-bg-container/70">
              <div className="text-xs font-semibold text-theme-text-primary">
                技能中心发现
              </div>
              <div className="text-xs text-theme-text-secondary mt-1">
                schedule: {status?.skillHubDiscovery?.schedule || "-"}
              </div>
              <div className="mt-2">
                <button
                  onClick={() => runTask("skill-hub-discovery")}
                  disabled={running}
                  className="px-3 py-2 rounded-lg bg-theme-sidebar-item-default hover:bg-theme-sidebar-item-hover text-white/90 transition-all text-sm font-medium disabled:opacity-60"
                >
                  立即执行
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {!loading && (
        <div className="space-y-3">
          <div className="text-sm font-semibold text-theme-text-primary">
            最近执行记录
          </div>
          {jobs.length === 0 && (
            <div className="text-theme-text-secondary text-sm">暂无记录。</div>
          )}
          {jobs.map((job) => {
            const type = String(job?.type || "");
            const label = TYPE_LABELS[type] || type || "Job";
            return (
              <div
                key={job.id}
                className="bg-theme-bg-secondary border-2 border-theme-sidebar-border rounded-xl p-4"
              >
                <div className="flex items-start gap-3 flex-wrap">
                  <span
                    className={`text-xs px-2 py-0.5 rounded-md font-medium ${badgeClass(
                      job?.status
                    )}`}
                  >
                    {String(job?.status || "unknown")}
                  </span>
                  <div className="text-sm font-semibold text-theme-text-primary">
                    {label}
                  </div>
                  <div className="ml-auto text-xs text-theme-text-secondary">
                    {formatTime(job.createdAt)}
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-2 text-xs text-theme-text-secondary">
                  <div className="break-all">
                    <span className="text-theme-text-primary/80">jobId:</span>{" "}
                    {job.id}
                  </div>
                  <div>
                    <span className="text-theme-text-primary/80">started:</span>{" "}
                    {formatTime(job.startedAt) || "-"}
                  </div>
                  <div>
                    <span className="text-theme-text-primary/80">
                      finished:
                    </span>{" "}
                    {formatTime(job.finishedAt) || "-"}
                  </div>
                </div>
                {job?.error && (
                  <div className="mt-2 text-xs text-red-300 break-all">
                    error: {String(job.error)}
                  </div>
                )}
                {job?.result && (
                  <pre className="mt-2 text-xs bg-theme-bg-container/70 border border-white/5 rounded-lg p-3 overflow-x-auto text-theme-text-secondary">
                    {JSON.stringify(job.result, null, 2)}
                  </pre>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
