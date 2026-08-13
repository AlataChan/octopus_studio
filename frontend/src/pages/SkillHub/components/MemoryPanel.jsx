import React, { useEffect, useMemo, useState } from "react";

import SkillHub from "@/models/skillHub";
import showToast from "@/utils/toast";

function formatTime(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString();
}

function badgeClass(kind) {
  const k = String(kind || "").toLowerCase();
  if (k === "evolution")
    return "bg-purple-500/10 text-purple-300 border border-purple-500/20";
  if (k === "gene")
    return "bg-indigo-500/10 text-indigo-300 border border-indigo-500/20";
  if (k === "capsule")
    return "bg-teal-500/10 text-teal-300 border border-teal-500/20";
  if (k === "event")
    return "bg-white/5 text-theme-text-secondary border border-theme-border";
  return "bg-white/5 text-theme-text-secondary border border-theme-border";
}

export default function MemoryPanel({ workspaceId, skillById = {} }) {
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all"); // all | evolution | gene | capsule | event
  const [items, setItems] = useState([]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await SkillHub.searchMemory({
        q: query.trim() || undefined,
        kind,
        workspaceId,
        limit: 80,
      });
      if (!res?.success) throw new Error(res?.error || "加载失败");
      setItems(res.items || []);
    } catch (error) {
      showToast(error.message || "加载失败", "error");
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [workspaceId, kind]);

  const rows = useMemo(() => (Array.isArray(items) ? items : []), [items]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="text-lg font-bold text-theme-text-primary">Memory</div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-theme-text-secondary">Type</span>
          <select
            value={kind}
            onChange={(e) => setKind(String(e.target.value))}
            className="bg-theme-settings-input-bg text-theme-text-primary text-sm rounded-lg focus:outline-primary-button outline-none border-none p-2.5"
          >
            <option value="all">all</option>
            <option value="evolution">evolution</option>
            <option value="gene">gene</option>
            <option value="capsule">capsule</option>
            <option value="event">event</option>
          </select>
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(String(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === "Enter") load();
          }}
          placeholder="搜索 evolution / gene / capsule / event..."
          className="flex-1 min-w-[260px] bg-theme-settings-input-bg text-theme-text-primary text-sm rounded-lg focus:outline-primary-button outline-none border-none p-2.5"
        />
        <button
          onClick={load}
          className="px-3 py-2 rounded-lg bg-theme-sidebar-item-default hover:bg-theme-sidebar-item-hover text-white/90 transition-all text-sm font-medium"
        >
          Search
        </button>
      </div>

      {loading && (
        <div className="text-theme-text-secondary text-sm">加载中...</div>
      )}

      {!loading && rows.length === 0 && (
        <div className="text-theme-text-secondary text-sm">暂无结果。</div>
      )}

      <div className="space-y-3">
        {rows.map((item, idx) => {
          const skillId = item?.skillId ? String(item.skillId) : null;
          const displaySkill = skillId
            ? skillById?.[skillId]?.name || skillId
            : "(no skill)";
          return (
            <div
              key={`${item.type || "x"}-${item.createdAt || ""}-${idx}`}
              className="bg-theme-bg-secondary border-2 border-theme-sidebar-border rounded-xl p-4"
            >
              <div className="flex items-start gap-3 flex-wrap">
                <span
                  className={`text-xs px-2 py-0.5 rounded-md font-medium ${badgeClass(
                    item.type
                  )}`}
                >
                  {String(item.type || "unknown")}
                </span>
                <div className="text-sm font-semibold text-theme-text-primary">
                  {String(item.title || "")}
                </div>
                <div className="text-xs text-theme-text-secondary break-all">
                  {displaySkill}
                </div>
                <div className="ml-auto text-xs text-theme-text-secondary">
                  {formatTime(item.createdAt)}
                </div>
              </div>
              {item?.content && (
                <pre className="mt-2 text-xs bg-theme-bg-container/70 border border-white/5 rounded-lg p-3 overflow-x-auto text-theme-text-secondary">
                  {String(item.content)}
                </pre>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
