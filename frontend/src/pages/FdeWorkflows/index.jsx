import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import Sidebar from "@/components/Sidebar";
import FdeWorkflow from "@/models/fdeWorkflow";
import { userFromStorage } from "@/utils/request";

const PAGE_SIZE = 10;
const TERMINAL = new Set(["succeeded", "failed", "cancelled"]);
const REMEDIATION = {
  STUDIO_DRAFT_STALE: "Request review again before publishing.",
  STUDIO_REVIEW_SEPARATION_REQUIRED:
    "Ask a different workspace administrator to approve and publish.",
  STUDIO_RUN_BINDING_MISSING: "Configure every required workspace binding.",
  STUDIO_RUN_APPROVAL_STALE: "Request review again for the current bindings.",
  STUDIO_CHECKPOINT_CONFLICT: "Wait for the active worker lease, then retry.",
};

function parsed(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizedDraft(draft) {
  if (!draft) return null;
  return {
    ...draft,
    missingBindings: parsed(draft.missingBindingsJson, []),
    resolvedBindings: parsed(draft.resolvedBindingsJson, {}),
  };
}

export function StableFdeError({ code }) {
  if (!code) return null;
  return (
    <div
      role="alert"
      className="rounded-lg border border-red-400/40 bg-red-500/10 p-3 text-sm"
    >
      <div className="font-mono text-red-300">{code}</div>
      <div className="mt-1 text-theme-text-secondary">
        {REMEDIATION[code] ||
          "Retry the action or contact a workspace administrator."}
      </div>
    </div>
  );
}

export function DescribeClarifyView({
  session,
  turns = [],
  busy = false,
  onStart = () => {},
  onSubmit = () => {},
  onCompile = () => {},
}) {
  const [message, setMessage] = useState("");
  return (
    <section aria-labelledby="fde-describe-title" className="space-y-3">
      <h2 id="fde-describe-title" className="text-lg font-semibold">
        Describe &amp; clarify
      </h2>
      {!session ? (
        <button
          type="button"
          onClick={onStart}
          disabled={busy}
          className="rounded-lg bg-primary-button px-4 py-2"
        >
          Describe requirement
        </button>
      ) : (
        <>
          <div aria-live="polite" className="space-y-2">
            {turns.map((turn) => (
              <p
                key={turn.turn_id || turn.id}
                className="rounded-lg bg-theme-bg-secondary p-3"
              >
                {turn.planner_reply ||
                  turn.question ||
                  "Clarification received"}
              </p>
            ))}
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!message.trim()) return;
              onSubmit(message.trim());
              setMessage("");
            }}
            className="space-y-2"
          >
            <label htmlFor="fde-requirement" className="block text-sm">
              Requirement or clarification answer
            </label>
            <textarea
              id="fde-requirement"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              className="min-h-24 w-full rounded-lg border border-theme-border bg-theme-bg-primary p-3"
            />
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-primary-button px-4 py-2"
            >
              Send answer
            </button>
          </form>
          <button
            type="button"
            onClick={onCompile}
            disabled={busy}
            className="rounded-lg border border-theme-border px-4 py-2"
          >
            Compile and import
          </button>
        </>
      )}
    </section>
  );
}

export function DraftListView({
  drafts = [],
  page = 1,
  onSelect = () => {},
  onPage = () => {},
}) {
  const start = (page - 1) * PAGE_SIZE;
  const rows = drafts.slice(start, start + PAGE_SIZE);
  return (
    <section aria-labelledby="fde-drafts-title" className="space-y-3">
      <h2 id="fde-drafts-title" className="text-lg font-semibold">
        Drafts
      </h2>
      <ul className="space-y-2">
        {rows.map((draft) => (
          <li key={draft.id}>
            <button
              type="button"
              onClick={() => onSelect(draft.id)}
              className="w-full rounded-lg border border-theme-border p-3 text-left"
            >
              <span className="font-mono text-xs">{draft.id}</span>{" "}
              <span>{draft.status}</span> <span>revision {draft.revision}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          Previous
        </button>
        <span>Page {page}</span>
        <button
          type="button"
          disabled={start + PAGE_SIZE >= drafts.length}
          onClick={() => onPage(page + 1)}
        >
          Next
        </button>
      </div>
    </section>
  );
}

export function DraftDetailView({ draft, diff }) {
  if (!draft) return <section>Select a draft.</section>;
  return (
    <section aria-labelledby="fde-detail-title" className="space-y-3">
      <h2 id="fde-detail-title" className="text-lg font-semibold">
        Draft detail &amp; diff
      </h2>
      <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-theme-bg-secondary p-3 text-xs">
        {typeof draft.specJson === "string"
          ? draft.specJson
          : JSON.stringify(draft.specJson, null, 2)}
      </pre>
      {diff == null ? (
        <p>No previous version</p>
      ) : (
        <pre className="max-h-60 overflow-auto whitespace-pre-wrap rounded-lg bg-theme-bg-secondary p-3 text-xs">
          {JSON.stringify(diff, null, 2)}
        </pre>
      )}
    </section>
  );
}

export function BindingsPanel({ slug, missing = [] }) {
  return (
    <section aria-labelledby="fde-bindings-title" className="space-y-2">
      <h2 id="fde-bindings-title" className="text-lg font-semibold">
        Bindings
      </h2>
      {missing.length === 0 ? (
        <p>All bindings resolved.</p>
      ) : (
        <ul>
          {missing.map((binding) => (
            <li key={`${binding.kind}:${binding.handle}`}>
              <span>
                {binding.kind}: {binding.handle}
              </span>{" "}
              <a
                className="underline"
                href={`/workspace/${slug}/settings/vector-database`}
              >
                Configure binding
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function ReviewView({
  isAdmin = false,
  hasDraft = true,
  busy = false,
  onDecision = () => {},
}) {
  return (
    <section aria-labelledby="fde-review-title" className="space-y-2">
      <h2 id="fde-review-title" className="text-lg font-semibold">
        Review
      </h2>
      <button
        type="button"
        disabled={busy || !hasDraft}
        onClick={() => onDecision("request")}
      >
        Request review
      </button>
      {isAdmin && (
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy || !hasDraft}
            onClick={() => onDecision("approve")}
          >
            Approve
          </button>
          <button
            type="button"
            disabled={busy || !hasDraft}
            onClick={() => onDecision("reject")}
          >
            Reject
          </button>
        </div>
      )}
    </section>
  );
}

export function PublishView({ draft, busy = false, onPublish = () => {} }) {
  const missing = draft?.missingBindings || [];
  const approved = draft?.reviewStatus === "approved";
  const disabled = busy || missing.length > 0 || !approved;
  const reason = [
    missing.length
      ? `Resolve ${missing.map((item) => item.handle).join(", ")}`
      : null,
    !approved ? "obtain approval" : null,
  ]
    .filter(Boolean)
    .join(" and ");
  return (
    <section aria-labelledby="fde-publish-title" className="space-y-2">
      <h2 id="fde-publish-title" className="text-lg font-semibold">
        Publish
      </h2>
      <button type="button" disabled={disabled} onClick={onPublish}>
        Publish
      </button>
      {disabled && reason ? (
        <p>{reason[0].toUpperCase() + reason.slice(1)}.</p>
      ) : null}
    </section>
  );
}

export function RunMonitorView({
  run,
  events = [],
  artifacts = [],
  onResume = () => {},
}) {
  if (!run) return <section>Start a published workflow to monitor it.</section>;
  const cost = events.filter((event) => String(event.type).startsWith("cost"));
  return (
    <section aria-labelledby="fde-run-title" className="space-y-3">
      <h2 id="fde-run-title" className="text-lg font-semibold">
        Run monitor
      </h2>
      <p>
        <span className="font-mono">{run.id}</span> — {run.status}
      </p>
      <h3>Trace</h3>
      <ul>
        {events.map((event) => (
          <li key={event.id || event.seq}>
            {event.type} {event.payload?.nodeId || ""}
          </li>
        ))}
      </ul>
      <h3>Artifacts</h3>
      <ul>
        {artifacts.map((artifact) => (
          <li key={artifact.id}>{artifact.label || artifact.artifactType}</li>
        ))}
      </ul>
      <h3>Cost</h3>
      <p>
        {cost.length
          ? `${cost.length} model call(s)`
          : "No model cost recorded."}
      </p>
      <StableFdeError code={run.errorCode} />
      {!TERMINAL.has(run.status) || run.status === "failed" ? (
        <button type="button" onClick={onResume}>
          Resume run
        </button>
      ) : null}
    </section>
  );
}

export default function FdeWorkflows() {
  const { slug } = useParams();
  const user = userFromStorage();
  const [authoring, setAuthoring] = useState(null);
  const [turns, setTurns] = useState([]);
  const [drafts, setDrafts] = useState([]);
  const [selected, setSelected] = useState(null);
  const [diff, setDiff] = useState(null);
  const [page, setPage] = useState(1);
  const [run, setRun] = useState(null);
  const [events, setEvents] = useState([]);
  const [artifacts, setArtifacts] = useState([]);
  const [busy, setBusy] = useState(false);
  const [errorCode, setErrorCode] = useState(null);

  const fail = (error) => setErrorCode(error?.code || "STUDIO_REQUEST_FAILED");
  const refreshDrafts = useCallback(async () => {
    const data = await FdeWorkflow.list(slug);
    setDrafts(data.drafts || []);
  }, [slug]);
  const selectDraft = useCallback(
    async (id) => {
      try {
        const data = await FdeWorkflow.detail(slug, id);
        setSelected(normalizedDraft(data.draft));
        setDiff(data.diff);
        setErrorCode(null);
      } catch (error) {
        fail(error);
      }
    },
    [slug]
  );
  const refreshRun = useCallback(
    async (runId) => {
      const [detail, trace, files] = await Promise.all([
        FdeWorkflow.run(slug, runId),
        FdeWorkflow.events(slug, runId),
        FdeWorkflow.artifacts(slug, runId),
      ]);
      setRun(detail.run);
      setEvents(trace.events || []);
      setArtifacts(files.artifacts || []);
    },
    [slug]
  );

  useEffect(() => {
    refreshDrafts().catch(fail);
  }, [refreshDrafts]);
  useEffect(() => {
    if (!run?.id || TERMINAL.has(run.status)) return undefined;
    const timer = setInterval(() => refreshRun(run.id).catch(fail), 2000);
    return () => clearInterval(timer);
  }, [refreshRun, run?.id, run?.status]);

  const action = async (work) => {
    setBusy(true);
    setErrorCode(null);
    try {
      await work();
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  };
  const draft = useMemo(() => normalizedDraft(selected), [selected]);

  return (
    <div className="flex h-screen bg-theme-bg-primary text-theme-text-primary">
      <Sidebar />
      <main className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-6xl space-y-6">
          <header>
            <h1 className="text-2xl font-semibold">FDE Studio workflows</h1>
          </header>
          <StableFdeError code={errorCode} />
          <DescribeClarifyView
            session={authoring}
            turns={turns}
            busy={busy}
            onStart={() =>
              action(async () => {
                const data = await FdeWorkflow.startSession(slug);
                setAuthoring(data.session);
              })
            }
            onSubmit={(message) =>
              action(async () => {
                const data = await FdeWorkflow.createTurn(
                  slug,
                  authoring.id,
                  message
                );
                setTurns((current) => [...current, data.turn]);
              })
            }
            onCompile={() =>
              action(async () => {
                const data = await FdeWorkflow.compileImport(
                  slug,
                  authoring.id
                );
                await refreshDrafts();
                await selectDraft(data.draft.id);
              })
            }
          />
          <DraftListView
            drafts={drafts}
            page={page}
            onPage={setPage}
            onSelect={selectDraft}
          />
          <DraftDetailView draft={draft} diff={diff} />
          <BindingsPanel slug={slug} missing={draft?.missingBindings || []} />
          <ReviewView
            isAdmin={user?.role === "admin"}
            hasDraft={Boolean(draft)}
            busy={busy}
            onDecision={(decision) =>
              action(async () => {
                const data = await FdeWorkflow.review(
                  slug,
                  draft.id,
                  decision,
                  draft.stateVersion
                );
                setSelected(normalizedDraft(data.draft));
              })
            }
          />
          <PublishView
            draft={draft}
            busy={busy}
            onPublish={() =>
              action(async () => {
                const data = await FdeWorkflow.publish(
                  slug,
                  draft.id,
                  draft.stateVersion
                );
                setSelected(normalizedDraft(data.draft));
              })
            }
          />
          {draft?.status === "published" && !run ? (
            <button
              type="button"
              onClick={() =>
                action(async () => {
                  const data = await FdeWorkflow.createRun(slug, draft.id, {});
                  await refreshRun(data.run.id);
                })
              }
            >
              Run workflow
            </button>
          ) : null}
          <RunMonitorView
            run={run}
            events={events}
            artifacts={artifacts}
            onResume={() =>
              action(async () => {
                await FdeWorkflow.resume(slug, run.id);
                await refreshRun(run.id);
              })
            }
          />
        </div>
      </main>
    </div>
  );
}
