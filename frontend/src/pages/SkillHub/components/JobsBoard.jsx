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
  skill_hub_install: "Install",
  skill_hub_uninstall: "Uninstall",
  skill_hub_create: "Create",
  skill_hub_upgrade: "Upgrade",
  skill_hub_validate: "Validate",
  skill_hub_evolve: "Evolve",
  skill_hub_cycle: "Cycle",
  skill_hub_refresh_registry: "Refresh Registry",
};

export default function JobsBoard({ workspaceId, skillById = {} }) {
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState([]);
  const [status, setStatus] = useState("all"); // all | pending | running | done | failed | blocked

  const loadJobs = async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const res = await SkillHub.getJobs({
        workspaceId,
        status: status === "all" ? undefined : status,
        limit: 50,
      });
      if (!res?.success) throw new Error(res?.error || "加载 Jobs 失败");
      setJobs(res.jobs || []);
    } catch (error) {
      showToast(error.message || "加载失败", "error");
      setJobs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadJobs();
  }, [workspaceId, status]);

  const rows = useMemo(() => {
    if (!Array.isArray(jobs)) return [];
    return jobs;
  }, [jobs]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="text-lg font-bold text-theme-text-primary">
          Tasks Board
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-theme-text-secondary">Status</span>
          <select
            value={status}
            onChange={(e) => setStatus(String(e.target.value))}
            className="bg-theme-settings-input-bg text-theme-text-primary text-sm rounded-lg focus:outline-primary-button outline-none border-none p-2.5"
          >
            <option value="all">all</option>
            <option value="pending">pending</option>
            <option value="running">running</option>
            <option value="done">done</option>
            <option value="failed">failed</option>
            <option value="blocked">blocked</option>
          </select>
        </div>
        <button
          onClick={loadJobs}
          className="ml-auto px-3 py-2 rounded-lg bg-theme-sidebar-item-default hover:bg-theme-sidebar-item-hover text-white/90 transition-all text-sm font-medium"
        >
          刷新
        </button>
      </div>

      {loading && (
        <div className="text-theme-text-secondary text-sm">加载中...</div>
      )}

      {!loading && rows.length === 0 && (
        <div className="text-theme-text-secondary text-sm">暂无任务记录。</div>
      )}

      <div className="space-y-3">
        {rows.map((job) => {
          const type = String(job?.type || "");
          const statusValue = String(job?.status || "");
          const skillId = job?.skillId ? String(job.skillId) : null;
          const displayName = skillId
            ? skillById?.[skillId]?.name || skillId
            : "(no skill)";
          const label = TYPE_LABELS[type] || type || "Job";

          return (
            <div
              key={job.id}
              className="bg-theme-bg-secondary border-2 border-theme-sidebar-border rounded-xl p-4"
            >
              <div className="flex items-start gap-3 flex-wrap">
                <span
                  className={`text-xs px-2 py-0.5 rounded-md font-medium ${badgeClass(
                    statusValue
                  )}`}
                >
                  {statusValue || "unknown"}
                </span>
                <div className="text-sm font-semibold text-theme-text-primary">
                  {label}
                </div>
                <div className="text-xs text-theme-text-secondary break-all">
                  {displayName}
                </div>
                <div className="ml-auto text-xs text-theme-text-secondary">
                  {formatTime(job.createdAt)}
                </div>
              </div>

              <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
                <div className="text-theme-text-secondary break-all">
                  <span className="text-theme-text-primary/80">jobId:</span>{" "}
                  {job.id}
                </div>
                <div className="text-theme-text-secondary">
                  <span className="text-theme-text-primary/80">started:</span>{" "}
                  {formatTime(job.startedAt) || "-"}
                </div>
                <div className="text-theme-text-secondary">
                  <span className="text-theme-text-primary/80">finished:</span>{" "}
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
    </div>
  );
}
