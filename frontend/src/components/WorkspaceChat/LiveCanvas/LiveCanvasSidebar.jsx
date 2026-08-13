import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import { isMobile } from "react-device-detect";
import { fetchEventSource } from "@microsoft/fetch-event-source";
import {
  ArrowClockwise,
  Check,
  CircleNotch,
  Clock,
  DownloadSimple,
  ShieldCheck,
  ShieldWarning,
  SidebarSimple,
  X,
  Play,
  Wrench,
  Brain,
  CheckCircle,
  CurrencyDollar,
  FileText,
  Info,
} from "@phosphor-icons/react";
import { API_BASE } from "@/utils/constants";
import { baseHeaders } from "@/utils/request";
import { AuthContext } from "@/AuthContext";

export const LIVE_CANVAS_OPEN_EVENT = "livecanvas:open-sidebar";

const SSE_EVENTS = {
  SESSION_SUBSCRIBE: "session.subscribe",
  RUN_CREATED: "run.created",
  RUN_UPDATED: "run.updated",
  RUN_COMPLETED: "run.completed",
  RUN_BLOCKED: "run.blocked",
  RUN_EVENT: "run.event",
  ARTIFACT_CREATED: "artifact.created",
  APPROVAL_REQUESTED: "approval.requested",
  APPROVAL_RESOLVED: "approval.resolved",
  PING: "ping",
};

function statusMeta(status) {
  switch (status) {
    case "queued":
      return { label: "Queued", icon: Clock, cls: "text-white/70" };
    case "running":
      return { label: "Running", icon: CircleNotch, cls: "text-blue-400" };
    case "blocked":
      return { label: "Blocked", icon: ShieldWarning, cls: "text-yellow-400" };
    case "succeeded":
      return { label: "Succeeded", icon: Check, cls: "text-green-400" };
    case "failed":
      return { label: "Failed", icon: X, cls: "text-red-400" };
    case "cancelled":
      return { label: "Cancelled", icon: X, cls: "text-white/60" };
    default:
      return { label: status || "Unknown", icon: Clock, cls: "text-white/60" };
  }
}

function upsertById(list, item, idKey = "id") {
  const id = item?.[idKey] != null ? String(item[idKey]) : null;
  if (!id) return list;
  const idx = list.findIndex(
    (x) => (x?.[idKey] != null ? String(x[idKey]) : null) === id
  );
  if (idx === -1) return [item, ...list];
  const copy = [...list];
  copy[idx] = { ...copy[idx], ...item, [idKey]: id };
  return copy;
}

function removeById(list, id, idKey = "id") {
  const target = id != null ? String(id) : null;
  return list.filter(
    (x) => (x?.[idKey] != null ? String(x[idKey]) : null) !== target
  );
}

export default function LiveCanvasSidebar({ workspace, threadSlug }) {
  const { store } = useContext(AuthContext);
  const user = store?.user || null;
  const [open, setOpen] = useState(!isMobile);
  const [tab, setTab] = useState("active"); // active | history | approvals

  const [runs, setRuns] = useState([]);
  const [approvals, setApprovals] = useState([]);
  const [selectedRunId, setSelectedRunId] = useState(null);
  const [sseError, setSseError] = useState(null);
  const ctrlRef = useRef(null);

  const activeRun = useMemo(() => {
    if (selectedRunId) {
      return runs.find((r) => r.id === selectedRunId) || null;
    }
    const running =
      runs.find((r) => r.status === "running") ||
      runs.find((r) => r.status === "blocked") ||
      null;
    return running || runs[0] || null;
  }, [runs, selectedRunId]);

  const runApprovals = useMemo(() => {
    if (!activeRun) return approvals;
    return approvals.filter(
      (a) => String(a.runId || "") === String(activeRun.id)
    );
  }, [approvals, activeRun]);

  const pendingCount = approvals.length;

  const connect = async () => {
    if (!threadSlug) return;
    if (ctrlRef.current) ctrlRef.current.abort();
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    setSseError(null);

    await fetchEventSource(
      `${API_BASE}/canvas/events?sessionId=${encodeURIComponent(threadSlug)}`,
      {
        method: "GET",
        headers: baseHeaders(),
        signal: ctrl.signal,
        openWhenHidden: true,
        async onopen(res) {
          if (res.ok) return;
          throw new Error(`SSE failed: ${res.status}`);
        },
        async onmessage(msg) {
          if (!msg?.event || msg.event === SSE_EVENTS.PING) return;
          let data = null;
          try {
            data = JSON.parse(msg.data || "null");
          } catch {
            return;
          }

          switch (msg.event) {
            case SSE_EVENTS.SESSION_SUBSCRIBE: {
              const nextRuns = Array.isArray(data.runs) ? data.runs : [];
              const nextApprovals = Array.isArray(data.pendingApprovals)
                ? data.pendingApprovals
                : [];
              setRuns(nextRuns);
              setApprovals(
                nextApprovals.map((a) => ({
                  ...a,
                  id: a?.id != null ? String(a.id) : null,
                  runId: a?.runId != null ? String(a.runId) : null,
                }))
              );
              if (nextApprovals.length > 0 || nextRuns.length > 0)
                setOpen(true);
              return;
            }
            case SSE_EVENTS.RUN_CREATED: {
              setRuns((prev) => upsertById(prev, { id: data.runId, ...data }));
              setOpen(true);
              return;
            }
            case SSE_EVENTS.RUN_UPDATED:
            case SSE_EVENTS.RUN_BLOCKED:
            case SSE_EVENTS.RUN_COMPLETED: {
              setRuns((prev) => {
                const id = data.runId || data.id;
                if (!id) return prev;
                return upsertById(prev, { id, ...data });
              });
              if (msg.event === SSE_EVENTS.RUN_BLOCKED) setOpen(true);
              return;
            }
            case SSE_EVENTS.RUN_EVENT: {
              setRuns((prev) => {
                const runId = data.runId;
                if (!runId) return prev;
                const idx = prev.findIndex((r) => r.id === runId);
                if (idx === -1) return prev;
                const copy = [...prev];
                const r = copy[idx];
                const events = Array.isArray(r.events) ? [...r.events] : [];
                events.push(data);
                copy[idx] = { ...r, events };
                return copy;
              });
              return;
            }
            case SSE_EVENTS.ARTIFACT_CREATED: {
              setRuns((prev) => {
                const runId = data.runId;
                if (!runId) return prev;
                const idx = prev.findIndex((r) => r.id === runId);
                if (idx === -1) return prev;
                const copy = [...prev];
                const r = copy[idx];
                const artifacts = Array.isArray(r.artifacts)
                  ? [...r.artifacts]
                  : [];
                artifacts.push({
                  id: data.artifactId,
                  artifactType: data.artifactType,
                  label: data.label,
                  createdAt: data.createdAt,
                  metadata: data.metadata || {},
                });
                copy[idx] = { ...r, artifacts };
                return copy;
              });
              setOpen(true);
              return;
            }
            case SSE_EVENTS.APPROVAL_REQUESTED: {
              setApprovals((prev) =>
                upsertById(prev, { id: data.approvalId, ...data })
              );
              setTab("approvals");
              setOpen(true);
              return;
            }
            case SSE_EVENTS.APPROVAL_RESOLVED: {
              const id = data.approvalId || data.id;
              if (!id) return;
              setApprovals((prev) => removeById(prev, String(id)));
              return;
            }
            default:
              return;
          }
        },
        onclose() {
          // allow reconnect via refresh button
        },
        onerror(err) {
          setSseError(err?.message || "SSE error");
          // keep retrying
        },
      }
    );
  };

  useEffect(() => {
    connect();
    return () => {
      if (ctrlRef.current) ctrlRef.current.abort();
      ctrlRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadSlug]);

  useEffect(() => {
    function onOpen() {
      setOpen(true);
      setTab("active");
    }
    window.addEventListener(LIVE_CANVAS_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(LIVE_CANVAS_OPEN_EVENT, onOpen);
  }, []);

  if (!threadSlug) return null;

  const handleResolve = async ({ approvalId, runId, approved, reason }) => {
    await fetch(`${API_BASE}/canvas/action`, {
      method: "POST",
      headers: { ...baseHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        runId,
        actionType: "approval.resolve",
        payload: {
          approvalId,
          value: approved ? "approved" : "rejected",
          reason,
        },
        timestamp: Date.now(),
      }),
    });
  };

  const headerBadge = activeRun ? statusMeta(activeRun.status) : null;

  // Mobile: floating button + drawer
  if (isMobile) {
    return (
      <>
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 bg-theme-accent-primary text-theme-text-primary px-4 py-2 rounded-full shadow-lg"
          title="Open Live Canvas"
        >
          <SidebarSimple size={20} />
        </button>
        {open && (
          <div className="fixed inset-0 z-overlay bg-black/40">
            <div className="absolute inset-y-0 right-0 w-[90vw] max-w-[420px] bg-theme-bg-secondary border-l border-theme-border flex flex-col z-modal">
              <SidebarHeader
                title="Live Canvas"
                badge={headerBadge}
                onRefresh={connect}
                onClose={() => setOpen(false)}
              />
              <SidebarTabs
                tab={tab}
                setTab={setTab}
                pendingCount={pendingCount}
              />
              <SidebarBody
                tab={tab}
                runs={runs}
                approvals={approvals}
                activeRun={activeRun}
                runApprovals={runApprovals}
                onSelectRun={(id) => {
                  setSelectedRunId(id);
                  setTab("active");
                }}
                onResolve={handleResolve}
                sseError={sseError}
                canFullAuthorize={user?.role === "admin"}
                workspaceSlug={workspace?.slug}
                threadSlug={threadSlug}
              />
            </div>
          </div>
        )}
      </>
    );
  }

  // Desktop: collapsible sidebar
  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-40 bg-theme-accent-primary text-theme-text-primary px-4 py-2 rounded-full shadow-lg"
          title="Open Live Canvas"
        >
          <SidebarSimple size={20} />
        </button>
      )}
      <div
        className={`h-full ${open ? "w-[420px]" : "w-0"} transition-all duration-300 overflow-hidden`}
      >
        <div className="h-full w-[420px] bg-theme-bg-secondary border-l border-theme-border flex flex-col">
          <SidebarHeader
            title="Live Canvas"
            badge={headerBadge}
            onRefresh={connect}
            onClose={() => setOpen(false)}
          />
          <SidebarTabs tab={tab} setTab={setTab} pendingCount={pendingCount} />
          <SidebarBody
            tab={tab}
            runs={runs}
            approvals={approvals}
            activeRun={activeRun}
            runApprovals={runApprovals}
            onSelectRun={(id) => {
              setSelectedRunId(id);
              setTab("active");
            }}
            onResolve={handleResolve}
            sseError={sseError}
            canFullAuthorize={user?.role === "admin"}
            workspaceSlug={workspace?.slug}
            threadSlug={threadSlug}
          />
        </div>
      </div>
    </>
  );
}

function SidebarHeader({ title, badge, onRefresh, onClose }) {
  const Icon = badge?.icon || SidebarSimple;
  return (
    <div className="flex items-center justify-between px-3 py-3 border-b border-theme-border">
      <div className="flex items-center gap-2">
        <Icon className={badge?.cls || "text-white/70"} size={18} />
        <div className="text-theme-text-primary font-semibold">{title}</div>
        {badge && (
          <div
            className={`text-xs ${badge.cls} bg-white/5 px-2 py-0.5 rounded`}
          >
            {badge.label}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={onRefresh}
          className="p-2 rounded-md hover:bg-white/5 text-white/80"
          title="Reconnect"
        >
          <ArrowClockwise size={16} />
        </button>
        <button
          onClick={onClose}
          className="p-2 rounded-md hover:bg-white/5 text-white/80"
          title="Close"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}

function SidebarTabs({ tab, setTab, pendingCount }) {
  const TabBtn = ({ id, label, badge }) => (
    <button
      onClick={() => setTab(id)}
      className={`flex-1 px-3 py-2 text-xs ${
        tab === id
          ? "text-theme-text-primary bg-white/5"
          : "text-white/60 hover:bg-white/5"
      }`}
    >
      <span className="inline-flex items-center gap-2">
        {label}
        {badge != null && badge > 0 && (
          <span className="text-[10px] bg-theme-accent-primary/30 text-theme-accent-primary px-2 py-0.5 rounded-full">
            {badge}
          </span>
        )}
      </span>
    </button>
  );

  return (
    <div className="flex border-b border-theme-border">
      <TabBtn id="active" label="Active" />
      <TabBtn id="history" label="History" />
      <TabBtn id="approvals" label="Approvals" badge={pendingCount} />
    </div>
  );
}

function SidebarBody({
  tab,
  runs,
  approvals,
  activeRun,
  runApprovals,
  onSelectRun,
  onResolve,
  sseError,
  workspaceSlug,
  threadSlug,
}) {
  if (sseError) {
    return (
      <div className="p-3 text-xs text-red-400 border-b border-theme-border">
        SSE error: {sseError}
      </div>
    );
  }

  if (tab === "history") {
    return (
      <div className="flex-1 overflow-y-auto p-2">
        {runs.length === 0 ? (
          <Empty text="No runs yet." />
        ) : (
          <div className="space-y-2">
            {runs.map((r) => (
              <RunRow key={r.id} run={r} onClick={() => onSelectRun(r.id)} />
            ))}
          </div>
        )}
      </div>
    );
  }

  if (tab === "approvals") {
    return (
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {approvals.length === 0 ? (
          <Empty text="No pending approvals." />
        ) : (
          approvals.map((a) => (
            <ApprovalCard key={a.id} approval={a} onResolve={onResolve} />
          ))
        )}
      </div>
    );
  }

  // active
  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-3">
      <StartWorkAgentForm workspaceSlug={workspaceSlug} threadSlug={threadSlug} />
      {!activeRun ? (
        <Empty text="No active run." />
      ) : (
        <>
          <ActiveRunHeader run={activeRun} />
          <Section title="Timeline">
            <RunTimeline events={activeRun.events} />
          </Section>
          <Section title="Artifacts">
            <ArtifactsList artifacts={activeRun.artifacts || []} />
          </Section>
          <Section title="Approvals">
            {runApprovals.length === 0 ? (
              <Empty text="No pending approvals for this run." />
            ) : (
              <div className="space-y-3">
                {runApprovals.map((a) => (
                  <ApprovalCard key={a.id} approval={a} onResolve={onResolve} />
                ))}
              </div>
            )}
          </Section>
        </>
      )}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="bg-white/3 border border-theme-border rounded-lg p-3">
      <div className="text-xs text-white/70 mb-2">{title}</div>
      {children}
    </div>
  );
}

function Empty({ text }) {
  return <div className="text-xs text-white/50">{text}</div>;
}

function RunRow({ run, onClick }) {
  const meta = statusMeta(run.status);
  const Icon = meta.icon;
  return (
    <button
      onClick={onClick}
      className="w-full text-left flex items-center justify-between gap-2 bg-white/3 hover:bg-white/5 border border-theme-border rounded-lg px-3 py-2"
    >
      <div className="min-w-0">
        <div className="text-xs text-theme-text-primary truncate">
          {run.triggerType || "run"} · {String(run.id || "").slice(0, 8)}
        </div>
        <div className="text-[10px] text-white/50 truncate">
          {run.createdAt ? new Date(run.createdAt).toLocaleString() : ""}
        </div>
      </div>
      <div className={`text-xs ${meta.cls} flex items-center gap-1`}>
        <Icon size={14} className={meta.cls} />
        {meta.label}
      </div>
    </button>
  );
}

function ActiveRunHeader({ run }) {
  const meta = statusMeta(run.status);
  const Icon = meta.icon;
  return (
    <div className="bg-white/3 border border-theme-border rounded-lg p-3">
      <div className="flex items-center justify-between">
        <div className="text-xs text-white/70">Run</div>
        <div className={`text-xs ${meta.cls} flex items-center gap-1`}>
          <Icon size={14} className={meta.cls} />
          {meta.label}
        </div>
      </div>
      <div className="mt-2 text-xs text-theme-text-primary">
        <div className="truncate">id: {run.id}</div>
        <div className="text-white/60 truncate">
          trigger: {run.triggerType || "unknown"}
        </div>
        {run.errorCode && (
          <div className="text-red-400 truncate">
            error: {run.errorCode}{" "}
            {run.errorDetail ? `— ${run.errorDetail}` : ""}
          </div>
        )}
      </div>
    </div>
  );
}

function ArtifactsList({ artifacts }) {
  const list = Array.isArray(artifacts) ? artifacts : [];
  if (list.length === 0) return <Empty text="No artifacts yet." />;

  return (
    <div className="space-y-2">
      {list.map((a) => (
        <div
          key={a.id}
          className="flex items-center justify-between gap-2 bg-white/3 border border-theme-border rounded-lg px-3 py-2"
        >
          <div className="min-w-0">
            <div className="text-xs text-theme-text-primary truncate">
              {a.label || a.artifactType || "artifact"}
            </div>
            <div className="text-[10px] text-white/50 truncate">
              {a.createdAt ? new Date(a.createdAt).toLocaleString() : ""}
            </div>
          </div>
          <a
            className="p-2 rounded-md hover:bg-white/5 text-white/80"
            title="Download"
            href={`${API_BASE}/run-artifacts/${encodeURIComponent(a.id)}/download`}
          >
            <DownloadSimple size={16} />
          </a>
        </div>
      ))}
    </div>
  );
}

function ApprovalCard({ approval, onResolve }) {
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");

  const toolName =
    approval?.toolName ||
    approval?.planDetails?.toolName ||
    approval?.planDetails?.toolId ||
    null;

  const risk =
    approval?.riskLevel ||
    approval?.planDetails?.riskLevel ||
    approval?.planDetails?.risk ||
    null;

  const riskIcon = risk ? ShieldWarning : ShieldCheck;
  const RiskIcon = riskIcon;

  const doResolve = async (approved) => {
    if (busy) return;
    setBusy(true);
    try {
      await onResolve({
        approvalId: approval.id,
        runId: approval.runId,
        approved,
        reason,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-white/3 border border-theme-border rounded-lg p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs text-theme-text-primary truncate">
            {approval.planTitle || "Approval required"}
          </div>
          {toolName && (
            <div className="text-[10px] text-white/60 truncate">
              tool: {toolName}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 text-[10px] text-yellow-300 bg-yellow-300/10 px-2 py-0.5 rounded">
          <RiskIcon size={12} />
          {risk ? String(risk) : "risk"}
        </div>
      </div>

      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason (optional)"
        className="w-full text-xs bg-theme-bg-chat-input light:bg-white/5 border border-theme-border rounded px-2 py-1 text-theme-text-primary placeholder:text-white/30"
      />

      <div className="flex items-center justify-end gap-2">
        <button
          onClick={() => doResolve(false)}
          disabled={busy}
          className="text-xs px-3 py-1.5 rounded bg-red-500/20 hover:bg-red-500/30 text-red-300 disabled:opacity-50"
        >
          Reject
        </button>
        <button
          onClick={() => doResolve(true)}
          disabled={busy}
          className="text-xs px-3 py-1.5 rounded bg-green-500/20 hover:bg-green-500/30 text-green-300 disabled:opacity-50 inline-flex items-center gap-2"
        >
          {busy ? <CircleNotch className="animate-spin" size={14} /> : null}
          Approve
        </button>
      </div>
    </div>
  );
}

function RunTimeline({ events }) {
  const list = Array.isArray(events) ? events : [];
  if (list.length === 0) return <Empty text="No events yet." />;

  return (
    <div className="space-y-2 relative border-l border-theme-border ml-2 pl-3">
      {list.map((e, idx) => (
        <EventItem key={e.id || e.seq || idx} event={e} />
      ))}
    </div>
  );
}

function EventItem({ event }) {
  const { type, payload, createdAt } = event;
  const time = createdAt ? new Date(createdAt).toLocaleTimeString() : "";
  let icon = <Info size={14} />;
  let color = "text-white/70";
  let content = null;

  switch (type) {
    case "step.started":
      icon = <Play size={14} />;
      color = "text-blue-400";
      content = <div className="text-xs text-theme-text-primary">{payload?.title || "Step started"}</div>;
      break;
    case "step.completed":
      icon = <CheckCircle size={14} />;
      color = "text-green-400";
      content = <div className="text-xs text-theme-text-primary">{payload?.title || "Step completed"}</div>;
      break;
    case "tool.call":
      icon = <Wrench size={14} />;
      color = "text-yellow-400";
      content = (
        <div className="text-xs">
          <span className="text-theme-text-primary font-medium">{payload?.toolName}</span>
          <div className="text-[10px] text-white/50 truncate">args: {JSON.stringify(payload?.args)}</div>
        </div>
      );
      break;
    case "tool.result":
      icon = <Check size={14} />;
      color = "text-green-400";
      content = (
        <div className="text-xs">
          <span className="text-theme-text-primary font-medium">{payload?.toolName} result</span>
          <div className="text-[10px] text-white/50 truncate">{typeof payload?.result === "string" ? payload.result : JSON.stringify(payload?.result)}</div>
        </div>
      );
      break;
    case "thinking":
      icon = <Brain size={14} />;
      color = "text-purple-400";
      content = <div className="text-xs text-white/70 italic">{payload?.text}</div>;
      break;
    case "status":
      icon = <Info size={14} />;
      color = "text-white/70";
      content = <div className="text-xs text-theme-text-primary">{payload?.message || payload?.status}</div>;
      break;
    case "artifact.created":
      icon = <FileText size={14} />;
      color = "text-blue-400";
      content = <div className="text-xs text-theme-text-primary">Artifact: {payload?.label || payload?.artifactType}</div>;
      break;
    case "cost.updated":
      icon = <CurrencyDollar size={14} />;
      color = "text-green-400";
      content = <div className="text-xs text-theme-text-primary">Cost: ${payload?.costUsd?.toFixed(4)} ({payload?.totalTokens} tokens)</div>;
      break;
    case "approval.requested":
      icon = <ShieldWarning size={14} />;
      color = "text-yellow-400";
      content = <div className="text-xs text-theme-text-primary">Approval: {payload?.title}</div>;
      break;
    case "approval.resolved":
      icon = <ShieldCheck size={14} />;
      color = payload?.decision === "approved" ? "text-green-400" : "text-red-400";
      content = <div className="text-xs text-theme-text-primary">Approval {payload?.decision}</div>;
      break;
    default:
      content = <div className="text-xs text-theme-text-primary">{type}</div>;
      break;
  }

  return (
    <div className="relative">
      <div className={`absolute -left-[19px] top-1 bg-theme-bg-secondary ${color}`}>
        {icon}
      </div>
      <div className="bg-white/3 border border-theme-border rounded-lg p-2">
        <div className="flex justify-between items-start mb-1">
          {content}
        </div>
        <div className="text-[9px] text-white/40">{time}</div>
      </div>
    </div>
  );
}

function StartWorkAgentForm({ workspaceSlug, threadSlug }) {
  const [goal, setGoal] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!goal.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/work-agent/runs`, {
        method: "POST",
        headers: { ...baseHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          goal: goal.trim(),
          workspaceSlug,
          threadSlug,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to start run");
      }
      setGoal("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white/3 border border-theme-border rounded-lg p-3 flex flex-col gap-2">
      <div className="text-xs text-theme-text-primary font-medium">Start work agent</div>
      <textarea
        value={goal}
        onChange={(e) => setGoal(e.target.value)}
        placeholder="Enter your goal..."
        disabled={loading}
        className="w-full text-xs bg-theme-bg-chat-input border border-theme-border rounded px-2 py-1 text-theme-text-primary placeholder:text-white/30 resize-none min-h-[60px]"
      />
      {error && <div className="text-xs text-red-400">{error}</div>}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={loading || !goal.trim()}
          className="text-xs px-3 py-1.5 rounded bg-theme-accent-primary/20 hover:bg-theme-accent-primary/30 text-[var(--theme-accent-primary)] disabled:opacity-50 inline-flex items-center gap-2"
        >
          {loading ? <CircleNotch className="animate-spin" size={14} /> : <Play size={14} />}
          Start
        </button>
      </div>
    </form>
  );
}
