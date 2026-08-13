import { useEffect, useMemo, useState } from "react";
import VisualProduction from "@/models/visualProduction";

const COMPLETE_STATUSES = new Set([
  "succeeded",
  "success",
  "completed",
  "done",
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

function completedVideosFromJobs(jobs) {
  return jobs
    .filter((job) => COMPLETE_STATUSES.has(job?.status))
    .flatMap((job) =>
      resultFilesFromJob(job)
        .filter((file) => /\.mp4(?:$|\?)/i.test(file))
        .map((file) => ({
          key: `${jobId(job) || file}:${file}`,
          file,
          job,
        }))
    );
}

function firstResultFile(payload) {
  return (
    resultFilesFromJob(payload)[0] || payload?.video || payload?.path || ""
  );
}

function responseError(payload) {
  return payload?.error || payload?.detail || payload?.message || "";
}

export default function StitchView({ initialJobs = null }) {
  const initialJobList = normalizeJobs(initialJobs || []);
  const [jobs, setJobs] = useState(initialJobList);
  const [selected, setSelected] = useState(() =>
    completedVideosFromJobs(initialJobList).map((item) => item.key)
  );
  const [outName, setOutName] = useState("visual-stitch.mp4");
  const [titleForm, setTitleForm] = useState({
    title: "",
    subtitle: "",
    bg: "",
  });
  const [stitchResult, setStitchResult] = useState(null);
  const [titleResult, setTitleResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(initialJobs === null);
  const [submitting, setSubmitting] = useState(false);

  const videos = useMemo(() => completedVideosFromJobs(jobs), [jobs]);
  const videoKeys = useMemo(() => videos.map((video) => video.key), [videos]);
  const selectedInputs = videos
    .filter((video) => selected.includes(video.key))
    .map((video) => video.file);
  const stitchedVideo = firstResultFile(stitchResult);
  const titledVideo = firstResultFile(titleResult);
  const canStitch = videos.length > 0 && selectedInputs.length > 0;

  useEffect(() => {
    if (initialJobs !== null) return undefined;

    let cancelled = false;
    async function loadJobs() {
      setLoading(true);
      setError("");
      try {
        const payload = await VisualProduction.listJobs();
        if (!cancelled) setJobs(normalizeJobs(payload));
      } catch (e) {
        if (!cancelled) setError(e.message || "Unable to load jobs.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadJobs();
    return () => {
      cancelled = true;
    };
  }, [initialJobs]);

  useEffect(() => {
    const validKeys = new Set(videoKeys);
    setSelected((current) => {
      const filtered = current.filter((key) => validKeys.has(key));
      return filtered.length > 0 ? filtered : videoKeys;
    });
  }, [videoKeys]);

  const toggleVideo = (key) => {
    setSelected((current) =>
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key]
    );
  };

  const moveVideo = (key, direction) => {
    setSelected((current) => {
      const index = current.indexOf(key);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) {
        return current;
      }

      const next = [...current];
      const [item] = next.splice(index, 1);
      next.splice(nextIndex, 0, item);
      return next;
    });
  };

  const onStitch = async () => {
    if (!canStitch || submitting) return;
    setSubmitting(true);
    setError("");
    setTitleResult(null);

    try {
      const result = await VisualProduction.stitch({
        inputs: selectedInputs,
        out_name: outName,
      });
      const maybeError = responseError(result);
      if (maybeError) {
        setError(maybeError);
        return;
      }
      setStitchResult(result);
    } catch (e) {
      setError(e.message || "Stitch failed.");
    } finally {
      setSubmitting(false);
    }
  };

  const onTitle = async () => {
    if (!stitchedVideo || submitting) return;
    setSubmitting(true);
    setError("");

    try {
      const result = await VisualProduction.title({
        video: stitchedVideo,
        title: titleForm.title,
        subtitle: titleForm.subtitle,
        bg: titleForm.bg || undefined,
      });
      const maybeError = responseError(result);
      if (maybeError) {
        setError(maybeError);
        return;
      }
      setTitleResult(result);
    } catch (e) {
      setError(e.message || "Title card failed.");
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

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <section className="rounded-lg border border-theme-sidebar-border bg-theme-bg-primary p-5">
        <div className="mb-4">
          <p className="text-base font-semibold text-theme-text-primary">
            Stitch Videos
          </p>
          <p className="text-sm text-theme-text-secondary">
            Select completed MP4 outputs, order them, then stitch into one
            video.
          </p>
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
        ) : videos.length === 0 ? (
          <p className="rounded-lg border border-dashed border-theme-sidebar-border p-6 text-sm text-theme-text-secondary">
            No completed MP4 videos are available for stitching.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {videos.map((video) => {
              const selectedIndex = selected.indexOf(video.key);
              return (
                <div
                  key={video.key}
                  className="flex flex-wrap items-center gap-3 rounded-lg border border-theme-sidebar-border bg-theme-bg-secondary px-3 py-3"
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(video.key)}
                    onChange={() => toggleVideo(video.key)}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-theme-text-primary">
                      {video.file}
                    </p>
                    <p className="text-xs text-theme-text-secondary">
                      {jobId(video.job) || "completed job"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => moveVideo(video.key, -1)}
                    disabled={selectedIndex <= 0}
                    className="rounded-md border border-theme-sidebar-border px-2 py-1 text-xs text-theme-text-primary disabled:opacity-40"
                  >
                    Up
                  </button>
                  <button
                    type="button"
                    onClick={() => moveVideo(video.key, 1)}
                    disabled={
                      selectedIndex < 0 || selectedIndex >= selected.length - 1
                    }
                    className="rounded-md border border-theme-sidebar-border px-2 py-1 text-xs text-theme-text-primary disabled:opacity-40"
                  >
                    Down
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <label className="mt-5 flex flex-col gap-2 text-sm text-theme-text-secondary">
          Output name
          <input
            value={outName}
            onChange={(event) => setOutName(event.target.value)}
            className="rounded-md border border-theme-sidebar-border bg-theme-bg-secondary px-3 py-2 text-theme-text-primary"
          />
        </label>

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onStitch}
            disabled={!canStitch || submitting}
            className="rounded-lg bg-primary-button px-4 py-2 text-sm font-semibold text-[var(--theme-button-primary-text)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Stitching..." : "拼接 / Stitch"}
          </button>
        </div>
      </section>

      <aside className="rounded-lg border border-theme-sidebar-border bg-theme-bg-primary p-5">
        <p className="text-sm font-semibold text-theme-text-primary">
          Stitch result
        </p>
        {stitchedVideo ? (
          <div className="mt-3 flex flex-col gap-4 text-sm text-theme-text-secondary">
            <button
              type="button"
              onClick={() => onDownload(stitchedVideo)}
              className="text-theme-accent-primary underline"
            >
              Download stitched video
            </button>

            <div className="rounded-lg border border-theme-sidebar-border p-4">
              <p className="mb-3 font-semibold text-theme-text-primary">
                中文标题
              </p>
              <label className="mb-3 flex flex-col gap-2">
                Title
                <input
                  value={titleForm.title}
                  onChange={(event) =>
                    setTitleForm((current) => ({
                      ...current,
                      title: event.target.value,
                    }))
                  }
                  className="rounded-md border border-theme-sidebar-border bg-theme-bg-secondary px-3 py-2 text-theme-text-primary"
                />
              </label>
              <label className="mb-3 flex flex-col gap-2">
                Subtitle
                <input
                  value={titleForm.subtitle}
                  onChange={(event) =>
                    setTitleForm((current) => ({
                      ...current,
                      subtitle: event.target.value,
                    }))
                  }
                  className="rounded-md border border-theme-sidebar-border bg-theme-bg-secondary px-3 py-2 text-theme-text-primary"
                />
              </label>
              <label className="mb-4 flex flex-col gap-2">
                Background
                <input
                  value={titleForm.bg}
                  onChange={(event) =>
                    setTitleForm((current) => ({
                      ...current,
                      bg: event.target.value,
                    }))
                  }
                  placeholder="optional image path or color"
                  className="rounded-md border border-theme-sidebar-border bg-theme-bg-secondary px-3 py-2 text-theme-text-primary"
                />
              </label>
              <button
                type="button"
                onClick={onTitle}
                disabled={!stitchedVideo || submitting}
                className="rounded-lg border border-theme-sidebar-border px-4 py-2 text-sm font-semibold text-theme-text-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                生成标题卡 / Title card
              </button>
            </div>

            {titledVideo && (
              <button
                type="button"
                onClick={() => onDownload(titledVideo)}
                className="text-theme-accent-primary underline"
              >
                Download titled video
              </button>
            )}
          </div>
        ) : (
          <p className="mt-3 text-sm text-theme-text-secondary">
            Stitch output and title-card controls appear after a successful
            stitch request.
          </p>
        )}
      </aside>
    </div>
  );
}
