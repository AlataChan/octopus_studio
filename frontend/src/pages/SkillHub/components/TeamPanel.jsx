import React, { useEffect, useMemo, useState } from "react";

import SkillHub from "@/models/skillHub";
import showToast from "@/utils/toast";

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

function formatTime(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString();
}

const JOB_TYPE_LABELS = {
  skill_hub_install: "Install",
  skill_hub_uninstall: "Uninstall",
  skill_hub_upgrade: "Upgrade",
  skill_hub_validate: "Validate",
  skill_hub_evolve: "Evolve",
  skill_hub_cycle: "Cycle",
  skill_hub_refresh_registry: "Refresh",
};

export default function TeamPanel({
  workspaceId,
  assistants = [],
  installations = [],
  skillById = {},
}) {
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [jobs, setJobs] = useState([]);

  const loadJobs = async () => {
    if (!workspaceId) return;
    setLoadingJobs(true);
    try {
      const res = await SkillHub.getJobs({ workspaceId, limit: 200 });
      if (!res?.success) throw new Error(res?.error || "加载任务失败");
      setJobs(res.jobs || []);
    } catch (error) {
      showToast(error.message || "加载失败", "error");
      setJobs([]);
    } finally {
      setLoadingJobs(false);
    }
  };

  useEffect(() => {
    loadJobs();
  }, [workspaceId]);

  const assistantBindings = useMemo(() => {
    const map = new Map();
    for (const row of installations || []) {
      if (!row || row.scopeType !== "assistant") continue;
      const key = String(row.scopeId || "");
      if (!key) continue;
      map.set(key, map.get(key) || []);
      map.get(key).push(String(row.skillId));
    }
    return map;
  }, [installations]);

  const assistantJobs = useMemo(() => {
    const map = new Map();
    for (const job of jobs || []) {
      if (!job || job.scopeType !== "assistant") continue;
      const key = String(job.scopeId || "");
      if (!key) continue;
      map.set(key, map.get(key) || []);
      map.get(key).push(job);
    }
    for (const [key, list] of map) {
      list.sort((a, b) => {
        const ta = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
        const tb = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
        return tb - ta;
      });
      map.set(key, list);
    }
    return map;
  }, [jobs]);

  const rows = useMemo(() => {
    const list = Array.isArray(assistants) ? assistants : [];
    return list.map((a) => {
      const id = String(a?.id || "");
      const boundSkillIds = assistantBindings.get(id) || [];
      const recent = (assistantJobs.get(id) || []).slice(0, 3);
      return { assistant: a, id, boundSkillIds, recent };
    });
  }, [assistants, assistantBindings, assistantJobs]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="text-lg font-bold text-theme-text-primary">Team</div>
        <span className="text-sm text-theme-text-secondary">
          {rows.length} assistants
        </span>
        <button
          onClick={loadJobs}
          className="ml-auto px-3 py-2 rounded-lg bg-theme-sidebar-item-default hover:bg-theme-sidebar-item-hover text-white/90 transition-all text-sm font-medium"
        >
          刷新任务
        </button>
      </div>

      {loadingJobs && (
        <div className="text-theme-text-secondary text-sm">加载中...</div>
      )}

      {!loadingJobs && rows.length === 0 && (
        <div className="text-theme-text-secondary text-sm">
          当前 Workspace 暂无 AI 员工。
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {rows.map(({ assistant, id, boundSkillIds, recent }) => {
          const name =
            assistant?.instanceName ||
            assistant?.template?.name ||
            id ||
            "Assistant";
          const enabled = assistant?.enabled !== false;
          const permissionMode =
            assistant?.customConfig?.permissionMode ||
            assistant?.template?.defaultPermissionMode ||
            "default";

          const skills = (boundSkillIds || [])
            .map((sid) => {
              const s = skillById?.[sid] || {};
              return {
                skillId: sid,
                name: s?.name || sid,
                icon: s?.icon || "🧩",
                status: s?.status || null,
                validationStatus: s?.validationStatus || null,
              };
            })
            .sort((a, b) => String(a.name).localeCompare(String(b.name)));

          return (
            <div
              key={id}
              className="bg-theme-bg-secondary border-2 border-theme-sidebar-border rounded-xl p-4 space-y-3"
            >
              <div className="flex items-start gap-3 flex-wrap">
                <div className="text-base font-bold text-theme-text-primary">
                  {name}
                </div>
                <span
                  className={`text-xs px-2 py-0.5 rounded-md ${
                    enabled
                      ? "bg-green-500/10 text-green-300 border border-green-500/20"
                      : "bg-white/5 text-theme-text-secondary border border-theme-border"
                  }`}
                >
                  {enabled ? "enabled" : "disabled"}
                </span>
                <span className="text-xs px-2 py-0.5 rounded-md bg-theme-bg-container text-theme-text-secondary">
                  mode:{permissionMode}
                </span>
                <span className="ml-auto text-xs text-theme-text-secondary break-all">
                  {id}
                </span>
              </div>

              <div className="space-y-2">
                <div className="text-xs font-semibold text-theme-text-primary">
                  Skills ({skills.length})
                </div>
                {skills.length === 0 && (
                  <div className="text-xs text-theme-text-secondary">
                    暂无绑定技能（assistant-scope）。
                  </div>
                )}
                {skills.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {skills.map((s) => (
                      <span
                        key={s.skillId}
                        className="text-xs px-2 py-1 rounded-lg bg-theme-bg-container text-theme-text-secondary flex items-center gap-1"
                        title={s.skillId}
                      >
                        <span>{s.icon}</span>
                        <span className="max-w-[220px] truncate">{s.name}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <div className="text-xs font-semibold text-theme-text-primary">
                  最近任务
                </div>
                {recent.length === 0 && (
                  <div className="text-xs text-theme-text-secondary">
                    暂无记录。
                  </div>
                )}
                {recent.length > 0 && (
                  <div className="space-y-2">
                    {recent.map((job) => (
                      <div
                        key={job.id}
                        className="flex items-center gap-2 text-xs"
                      >
                        <span
                          className={`px-2 py-0.5 rounded-md font-medium ${badgeClass(
                            job.status
                          )}`}
                        >
                          {String(job.status || "unknown")}
                        </span>
                        <span className="text-theme-text-secondary">
                          {JOB_TYPE_LABELS[String(job.type)] ||
                            String(job.type || "job")}
                        </span>
                        <span className="ml-auto text-theme-text-secondary">
                          {formatTime(job.createdAt)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
