import { useEffect, useMemo, useRef, useState } from "react";
import VisualProduction from "@/models/visualProduction";

const DONE_STATUSES = new Set(["succeeded", "failed", "completed", "error"]);
const DEFAULT_FORM = {
  task: "",
  provider: "auto",
  ratio: "16:9",
  duration: 5,
  prompt: "",
};

function normalizeTasks(config) {
  if (Array.isArray(config?.tasks)) return config.tasks;
  return Object.keys(config?.routes || {});
}

function normalizeCost(estimate) {
  return estimate?.cost_cny ?? estimate?.cny ?? estimate?.cost ?? 0;
}

function resultFilesFromJob(job) {
  const candidates = [
    ...(Array.isArray(job?.results) ? job.results : []),
    ...(Array.isArray(job?.files) ? job.files : []),
  ];
  if (job?.file) candidates.push(job.file);
  if (job?.result_file) candidates.push(job.result_file);
  return candidates.filter(Boolean);
}

function shouldConfirmCost(estimate, config) {
  const cost = Number(normalizeCost(estimate));
  const threshold = Number(config?.budget?.confirm_threshold_cny);

  return (
    Number.isFinite(cost) && Number.isFinite(threshold) && cost > threshold
  );
}

function confirmHighCost(estimate, config) {
  if (!shouldConfirmCost(estimate, config)) return true;
  if (typeof window === "undefined" || typeof window.confirm !== "function") {
    return true;
  }

  const cost = Number(normalizeCost(estimate)).toFixed(2);
  const threshold = Number(config?.budget?.confirm_threshold_cny).toFixed(2);
  return window.confirm(
    `预计花费 ¥${cost}，超过确认阈值 ¥${threshold}。是否继续？`
  );
}

export default function GenerateView({ initialReady = null }) {
  const [ready, setReady] = useState(initialReady);
  const [config, setConfig] = useState(null);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [estimate, setEstimate] = useState(null);
  const [job, setJob] = useState(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const timer = useRef(null);

  const tasks = useMemo(() => normalizeTasks(config), [config]);
  const providers = Array.isArray(config?.providers) ? config.providers : [];
  const resultFiles = resultFilesFromJob(job);

  useEffect(() => {
    if (initialReady !== null) return;
    let cancelled = false;

    async function load() {
      const available = await VisualProduction.isReady();
      if (cancelled) return;
      setReady(available);
      if (!available) return;

      try {
        const nextConfig = await VisualProduction.getConfig();
        if (cancelled) return;
        const nextTasks = normalizeTasks(nextConfig);
        setConfig(nextConfig);
        if (nextTasks.length > 0) {
          setForm((current) => ({
            ...current,
            task: current.task || nextTasks[0],
          }));
        }
      } catch (e) {
        if (!cancelled) setError(e.message || "Unable to load visual config.");
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [initialReady]);

  useEffect(() => {
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

  useEffect(() => {
    if (ready !== true || !form.task || !form.prompt.trim()) {
      setEstimate(null);
      return;
    }

    let cancelled = false;
    const handle = setTimeout(async () => {
      try {
        const nextEstimate = await VisualProduction.estimate(form);
        if (!cancelled) setEstimate(nextEstimate);
      } catch (e) {
        if (!cancelled) setError(e.message || "Estimate failed.");
      }
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [form, ready]);

  const updateForm = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const pollJob = (jobId) => {
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(async () => {
      try {
        const nextJob = await VisualProduction.getJob(jobId);
        setJob(nextJob);
        if (DONE_STATUSES.has(nextJob?.status)) {
          clearInterval(timer.current);
          timer.current = null;
        }
      } catch (e) {
        setError(e.message || "Polling failed.");
      }
    }, 3000);
  };

  const onSubmit = async () => {
    if (ready !== true || !form.task || !form.prompt.trim()) return;
    if (!confirmHighCost(estimate, config)) return;

    setSubmitting(true);
    setError("");

    try {
      const created = await VisualProduction.submit(form);
      setJob(created);
      const jobId = created?.job_id || created?.id;
      if (jobId) pollJob(jobId);
    } catch (e) {
      setError(e.message || "Submit failed.");
    } finally {
      setSubmitting(false);
    }
  };

  const onDownload = async (file) => {
    setError("");
    try {
      await VisualProduction.downloadResult(file);
    } catch (e) {
      setError(e.message || "Download failed.");
    }
  };

  const notReady = ready === false;

  return (
    <div className="flex flex-col gap-5">
      {notReady && (
        <div
          role="alert"
          className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700"
        >
          视觉服务未启动（visual service not started）。请运行{" "}
          <code>yarn dev:visual</code>。
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="rounded-lg border border-theme-sidebar-border bg-theme-bg-primary p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-2 text-sm text-theme-text-secondary">
              Task
              <select
                value={form.task}
                onChange={(event) => updateForm("task", event.target.value)}
                className="rounded-md border border-theme-sidebar-border bg-theme-bg-secondary px-3 py-2 text-theme-text-primary"
                disabled={notReady}
              >
                <option value="">Select task</option>
                {tasks.map((task) => (
                  <option key={task} value={task}>
                    {task}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-2 text-sm text-theme-text-secondary">
              Provider
              <select
                value={form.provider}
                onChange={(event) => updateForm("provider", event.target.value)}
                className="rounded-md border border-theme-sidebar-border bg-theme-bg-secondary px-3 py-2 text-theme-text-primary"
                disabled={notReady}
              >
                <option value="auto">Auto</option>
                {providers.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.display_name || provider.id}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-2 text-sm text-theme-text-secondary">
              Ratio
              <select
                value={form.ratio}
                onChange={(event) => updateForm("ratio", event.target.value)}
                className="rounded-md border border-theme-sidebar-border bg-theme-bg-secondary px-3 py-2 text-theme-text-primary"
                disabled={notReady}
              >
                <option value="16:9">16:9</option>
                <option value="9:16">9:16</option>
                <option value="1:1">1:1</option>
                <option value="4:3">4:3</option>
              </select>
            </label>

            <label className="flex flex-col gap-2 text-sm text-theme-text-secondary">
              Duration
              <input
                type="number"
                min="1"
                value={form.duration}
                onChange={(event) =>
                  updateForm("duration", Number(event.target.value) || 1)
                }
                className="rounded-md border border-theme-sidebar-border bg-theme-bg-secondary px-3 py-2 text-theme-text-primary"
                disabled={notReady}
              />
            </label>
          </div>

          <label className="mt-4 flex flex-col gap-2 text-sm text-theme-text-secondary">
            Prompt
            <textarea
              value={form.prompt}
              onChange={(event) => updateForm("prompt", event.target.value)}
              rows={6}
              className="rounded-md border border-theme-sidebar-border bg-theme-bg-secondary px-3 py-2 text-theme-text-primary"
              placeholder="Describe the image or video to generate..."
              disabled={notReady}
            />
          </label>

          <div className="mt-5 flex items-center justify-between gap-4">
            <p className="text-sm text-theme-text-secondary">
              {estimate
                ? `预计花费 ≈ ¥${Number(normalizeCost(estimate)).toFixed(2)}`
                : "预计花费会在填写 prompt 后显示。"}
            </p>
            <button
              type="button"
              onClick={onSubmit}
              disabled={
                ready !== true ||
                !form.task ||
                !form.prompt.trim() ||
                submitting
              }
              className="rounded-lg bg-primary-button px-4 py-2 text-sm font-semibold text-[var(--theme-button-primary-text)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? "Generating..." : "生成 / Generate"}
            </button>
          </div>
        </section>

        <aside className="rounded-lg border border-theme-sidebar-border bg-theme-bg-primary p-5">
          <p className="text-sm font-semibold text-theme-text-primary">
            Current job
          </p>
          {job ? (
            <div className="mt-3 flex flex-col gap-3 text-sm text-theme-text-secondary">
              <p>Status: {job.status || "pending"}</p>
              <pre className="max-h-56 overflow-auto rounded-md bg-theme-bg-secondary p-3 text-xs">
                {JSON.stringify(job, null, 2)}
              </pre>
              {resultFiles.map((file) => (
                <button
                  key={file}
                  type="button"
                  onClick={() => onDownload(file)}
                  className="text-left text-theme-accent-primary underline"
                >
                  Download {file}
                </button>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-theme-text-secondary">
              Submitted jobs appear here while polling.
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
