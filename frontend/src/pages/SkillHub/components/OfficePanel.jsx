import React, { useEffect, useMemo, useState } from "react";

import SkillHub from "@/models/skillHub";
import showToast from "@/utils/toast";

function formatTime(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString();
}

const JOB_TYPE_LABELS = {
  skill_hub_install: "安装",
  skill_hub_uninstall: "卸载",
  skill_hub_upgrade: "升级",
  skill_hub_validate: "校验",
  skill_hub_evolve: "演化",
  skill_hub_cycle: "周期任务",
  skill_hub_refresh_registry: "刷新索引",
  "scheduler:knowledge_sync": "知识同步",
  "scheduler:skill_hub_discovery": "技能中心发现",
};

function statusFromJobs(jobs = []) {
  const list = Array.isArray(jobs) ? jobs : [];
  const running = list.find(
    (j) => String(j?.status || "").toLowerCase() === "running"
  );
  if (running) return { state: "working", job: running };
  const failed = list.find(
    (j) => String(j?.status || "").toLowerCase() === "failed"
  );
  if (failed) return { state: "blocked", job: failed };
  const last = list[0] || null;
  return { state: "idle", job: last };
}

function stateBadge(state) {
  if (state === "working")
    return "bg-blue-500/10 text-blue-300 border border-blue-500/20";
  if (state === "blocked")
    return "bg-red-500/10 text-red-300 border border-red-500/20";
  return "bg-green-500/10 text-green-300 border border-green-500/20";
}

export default function OfficePanel({
  workspaceId,
  assistants = [],
  installations = [],
  skillById = {},
}) {
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [jobs, setJobs] = useState([]);

  const load = async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const res = await SkillHub.getJobs({ workspaceId, limit: 200 });
      if (!res?.success) throw new Error(res?.error || "加载任务失败");
      setJobs(res.jobs || []);
    } catch (error) {
      showToast(error.message || "加载失败", "error");
      setJobs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [workspaceId]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => load(), 10000);
    return () => clearInterval(id);
  }, [autoRefresh, workspaceId]);

  const assistantSkillCount = useMemo(() => {
    const map = new Map();
    for (const row of installations || []) {
      if (!row || row.scopeType !== "assistant") continue;
      const aid = String(row.scopeId || "");
      if (!aid) continue;
      map.set(aid, (map.get(aid) || 0) + 1);
    }
    return map;
  }, [installations]);

  const jobsByAssistant = useMemo(() => {
    const map = new Map();
    for (const job of jobs || []) {
      if (!job || job.scopeType !== "assistant") continue;
      const aid = String(job.scopeId || "");
      if (!aid) continue;
      map.set(aid, map.get(aid) || []);
      map.get(aid).push(job);
    }
    for (const [aid, list] of map) {
      list.sort((a, b) => {
        const ta = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
        const tb = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
        return tb - ta;
      });
      map.set(aid, list);
    }
    return map;
  }, [jobs]);

  const desks = useMemo(() => {
    const list = Array.isArray(assistants) ? assistants : [];
    return list.map((a) => {
      const id = String(a?.id || "");
      const name = a?.instanceName || a?.template?.name || id || "Assistant";
      const enabled = a?.enabled !== false;
      const deskJobs = jobsByAssistant.get(id) || [];
      const { state, job } = statusFromJobs(deskJobs);
      const skillCount = assistantSkillCount.get(id) || 0;
      return { id, name, enabled, state, job, skillCount };
    });
  }, [assistants, jobsByAssistant, assistantSkillCount]);

  const summary = useMemo(() => {
    const s = { working: 0, blocked: 0, idle: 0 };
    for (const d of desks) {
      s[d.state] = (s[d.state] || 0) + 1;
    }
    return s;
  }, [desks]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="text-lg font-bold text-theme-text-primary">Office</div>
        <span className="text-sm text-theme-text-secondary">
          working {summary.working} · blocked {summary.blocked} · idle{" "}
          {summary.idle}
        </span>
        <label className="ml-auto flex items-center gap-2 text-xs text-theme-text-secondary">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
          />
          auto refresh
        </label>
        <button
          onClick={load}
          className="px-3 py-2 rounded-lg bg-theme-sidebar-item-default hover:bg-theme-sidebar-item-hover text-white/90 transition-all text-sm font-medium"
        >
          刷新
        </button>
      </div>

      {loading && (
        <div className="text-theme-text-secondary text-sm">加载中...</div>
      )}

      {!loading && desks.length === 0 && (
        <div className="text-theme-text-secondary text-sm">暂无 AI 员工。</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {desks.map((d) => {
          const jobType = d.job?.type ? String(d.job.type) : null;
          const jobLabel = jobType ? JOB_TYPE_LABELS[jobType] || jobType : null;
          const statusText = d.enabled ? d.state : "disabled";
          const statusClass = d.enabled
            ? stateBadge(d.state)
            : "bg-white/5 text-theme-text-secondary border border-theme-border";

          return (
            <div
              key={d.id}
              className="bg-theme-bg-secondary border-2 border-theme-sidebar-border rounded-xl p-4 space-y-3"
            >
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-2xl bg-theme-bg-container flex items-center justify-center text-2xl">
                  🤖
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="text-base font-bold text-theme-text-primary truncate">
                      {d.name}
                    </div>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-md ${statusClass}`}
                    >
                      {statusText}
                    </span>
                  </div>
                  <div className="text-xs text-theme-text-secondary mt-1 break-all">
                    {d.id}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs text-theme-text-secondary">
                <div>
                  <span className="text-theme-text-primary/80">skills:</span>{" "}
                  {d.skillCount}
                </div>
                <div>
                  <span className="text-theme-text-primary/80">last:</span>{" "}
                  {d.job?.createdAt ? formatTime(d.job.createdAt) : "-"}
                </div>
              </div>

              <div className="text-xs text-theme-text-secondary">
                <span className="text-theme-text-primary/80">job:</span>{" "}
                {jobLabel || "-"}
              </div>
              {d.job?.error && (
                <div className="text-xs text-red-300 break-all">
                  error: {String(d.job.error)}
                </div>
              )}
              {d.job?.result && (
                <pre className="text-xs bg-theme-bg-container/70 border border-white/5 rounded-lg p-3 overflow-x-auto text-theme-text-secondary">
                  {JSON.stringify(d.job.result, null, 2)}
                </pre>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
