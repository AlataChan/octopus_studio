import { useEffect, useRef, useState } from "react";
import VisualProduction from "@/models/visualProduction";

const DONE_STATUSES = new Set([
  "succeeded",
  "success",
  "completed",
  "done",
  "failed",
  "error",
]);

function normalizeJobs(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.jobs)) return payload.jobs;
  if (Array.isArray(payload?.items)) return payload.items;
  return [];
}

function jobId(job) {
  return job?.job_id || job?.id || job?.run_id || "";
}

function jobLabel(job) {
  return job?.task || job?.type || job?.route || "visual job";
}

function jobTime(job) {
  return job?.created_at || job?.updated_at || job?.time || "";
}

function resultFilesFromJob(job) {
  const candidates = [
    ...(Array.isArray(job?.results) ? job.results : []),
    ...(Array.isArray(job?.files) ? job.files : []),
    ...(Array.isArray(job?.output_files) ? job.output_files : []),
  ];

  if (job?.file) candidates.push(job.file);
  if (job?.result_file) candidates.push(job.result_file);
  if (job?.output_path) candidates.push(job.output_path);
  if (job?.output_video) candidates.push(job.output_video);
  if (job?.result?.file) candidates.push(job.result.file);
  if (job?.result?.path) candidates.push(job.result.path);

  return candidates.filter(Boolean);
}

export default function JobsView({ initialJobs = null }) {
  const [jobs, setJobs] = useState(() => normalizeJobs(initialJobs || []));
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(initialJobs === null);
  const timer = useRef(null);

  const loadJobs = async () => {
    setLoading(true);
    setError("");
    try {
      const payload = await VisualProduction.listJobs();
      setJobs(normalizeJobs(payload));
    } catch (e) {
      setError(e.message || "Unable to load jobs.");
    } finally {
      setLoading(false);
    }
  };

  const loadDetail = async (job) => {
    const id = jobId(job);
    if (!id) {
      setSelected(job);
      return;
    }

    if (timer.current) clearInterval(timer.current);
    setError("");

    async function refresh() {
      try {
        const detail = await VisualProduction.getJob(id);
        setSelected(detail);
        setJobs((current) =>
          current.map((item) => (jobId(item) === id ? detail : item))
        );

        if (DONE_STATUSES.has(detail?.status)) {
          clearInterval(timer.current);
          timer.current = null;
        }
      } catch (e) {
        setError(e.message || "Unable to load job detail.");
      }
    }

    await refresh();
    if (!DONE_STATUSES.has(job?.status)) {
      timer.current = setInterval(refresh, 3000);
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

  useEffect(() => {
    if (initialJobs !== null) return undefined;
    loadJobs();
    return undefined;
  }, [initialJobs]);

  useEffect(() => {
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <section className="rounded-lg border border-theme-sidebar-border bg-theme-bg-primary p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-base font-semibold text-theme-text-primary">
              My Jobs
            </p>
            <p className="text-sm text-theme-text-secondary">
              Recent visual generation jobs from the local sidecar.
            </p>
          </div>
          <button
            type="button"
            onClick={loadJobs}
            className="rounded-md border border-theme-sidebar-border px-3 py-2 text-sm text-theme-text-primary hover:bg-theme-bg-secondary"
          >
            Refresh
          </button>
        </div>

        {error && (
          <div
            role="alert"
            className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200"
          >
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-sm text-theme-text-secondary">Loading jobs...</p>
        ) : jobs.length === 0 ? (
          <p className="rounded-lg border border-dashed border-theme-sidebar-border p-6 text-sm text-theme-text-secondary">
            No visual jobs yet.
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-theme-sidebar-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-theme-bg-secondary text-theme-text-secondary">
                <tr>
                  <th className="px-3 py-2 font-medium">Job</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-theme-sidebar-border">
                {jobs.map((job, index) => {
                  const id = jobId(job) || `job-${index}`;
                  return (
                    <tr
                      key={id}
                      className="cursor-pointer hover:bg-theme-bg-secondary"
                      onClick={() => loadDetail(job)}
                    >
                      <td className="px-3 py-3 text-theme-text-primary">
                        <span className="block font-medium">
                          {jobLabel(job)}
                        </span>
                        <span className="block text-xs text-theme-text-secondary">
                          {id}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-theme-text-secondary">
                        {job?.status || "pending"}
                      </td>
                      <td className="px-3 py-3 text-theme-text-secondary">
                        {jobTime(job) || "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <aside className="rounded-lg border border-theme-sidebar-border bg-theme-bg-primary p-5">
        <p className="text-sm font-semibold text-theme-text-primary">
          Job detail
        </p>
        {selected ? (
          <div className="mt-3 flex flex-col gap-3 text-sm text-theme-text-secondary">
            <p>Status: {selected.status || "pending"}</p>
            <pre className="max-h-72 overflow-auto rounded-md bg-theme-bg-secondary p-3 text-xs">
              {JSON.stringify(selected, null, 2)}
            </pre>
            {resultFilesFromJob(selected).map((file) => (
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
            Select a job to inspect payload and outputs.
          </p>
        )}
      </aside>
    </div>
  );
}
