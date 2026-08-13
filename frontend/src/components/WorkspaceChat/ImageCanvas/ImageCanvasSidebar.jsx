/**
 * ImageCanvasSidebar - 图像画布侧边栏
 *
 * 提供:
 * - 图像生成面板
 * - 项目列表
 * - 生成结果预览
 */

import React, { useEffect, useRef, useState } from "react";
import { isMobile } from "react-device-detect";
import {
  ArrowClockwise,
  CheckCircle,
  ClockCounterClockwise,
  SpinnerGap,
  Image as ImageIcon,
  WarningCircle,
  X,
  Plus,
  Trash,
} from "@phosphor-icons/react";
import { IMAGE_CANVAS_OPEN_EVENT, useImageCanvas } from "./ImageCanvasContext";
import ImageGenerationPanel from "./ImageGenerationPanel";
import CanvasWorkspaceModal from "./CanvasWorkspaceModal";
import WorkspaceImages from "@/models/workspaceImages";

export default function ImageCanvasSidebar() {
  const canvasState = useImageCanvas();
  const [open, setOpen] = useState(false);
  const [showGeneratePanel, setShowGeneratePanel] = useState(false);
  const [showCanvasWorkspace, setShowCanvasWorkspace] = useState(false);

  if (!canvasState) return null;

  const {
    enabled,
    loading,
    error,
    projects,
    selectedProjectId,
    selectedProject,
    refreshProjects,
    refreshJobs,
    selectProject,
    deleteProject,
    generatedImageUrl,
    jobs,
    jobsLoading,
    jobsError,
    previewJobOutput,
  } = canvasState;

  const handleRefresh = async () => {
    await refreshJobs?.();
    await refreshProjects?.();
  };

  // 监听打开事件
  useEffect(() => {
    function onOpenSidebar() {
      setOpen(true);
    }
    window.addEventListener(IMAGE_CANVAS_OPEN_EVENT, onOpenSidebar);
    return () =>
      window.removeEventListener(IMAGE_CANVAS_OPEN_EVENT, onOpenSidebar);
  }, []);

  // 生成完成后自动打开侧边栏
  useEffect(() => {
    if (generatedImageUrl) {
      setOpen(true);
      setShowGeneratePanel(false);
    }
  }, [generatedImageUrl]);

  // Mobile: render as overlay drawer when open
  if (isMobile) {
    return (
      <>
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-20 z-50 bg-theme-accent-primary text-theme-text-primary px-4 py-2 rounded-full shadow-lg"
        >
          <ImageIcon size={20} />
        </button>
        {open && (
          <div className="fixed inset-0 z-overlay bg-black/40">
            <div className="absolute inset-y-0 right-0 w-[90vw] max-w-[420px] bg-theme-bg-secondary border-l border-theme-border flex flex-col z-modal">
              {showGeneratePanel ? (
                <ImageGenerationPanel
                  onClose={() => setShowGeneratePanel(false)}
                />
              ) : (
                <>
                  <Header
                    onClose={() => setOpen(false)}
                    onRefresh={handleRefresh}
                    onGenerate={() => setShowGeneratePanel(true)}
                  />
                  <Body
                    enabled={enabled}
                    loading={loading}
                    error={error}
                    jobs={jobs}
                    jobsLoading={jobsLoading}
                    jobsError={jobsError}
                    onPreviewJob={previewJobOutput}
                    projects={projects}
                    selectedProjectId={selectedProjectId}
                    selectedProject={selectedProject}
                    onSelect={selectProject}
                    onDelete={deleteProject}
                    generatedImageUrl={generatedImageUrl}
                    onOpenCanvas={() => setShowCanvasWorkspace(true)}
                  />
                </>
              )}
            </div>
          </div>
        )}

        <CanvasWorkspaceModal
          isOpen={showCanvasWorkspace && !!selectedProject}
          onClose={() => setShowCanvasWorkspace(false)}
          project={selectedProject}
        />
      </>
    );
  }

  // Desktop: always mounted, can be collapsed
  return (
    <>
      <div
        className={`h-full ${open ? "w-[420px]" : "w-0"} transition-all duration-300 overflow-hidden`}
      >
        <div className="h-full w-[420px] bg-theme-bg-secondary border-l border-theme-border flex flex-col">
          {showGeneratePanel ? (
            <ImageGenerationPanel onClose={() => setShowGeneratePanel(false)} />
          ) : (
            <>
              <div className="flex items-center justify-between px-3 py-3 border-b border-theme-border">
                <div className="flex items-center gap-2">
                  <ImageIcon
                    className="text-white/80"
                    size={18}
                    weight="fill"
                  />
                  <div className="text-theme-text-primary font-semibold">
                    Image Canvas
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowGeneratePanel(true)}
                    className="p-2 rounded-md hover:bg-white/5 text-white/80"
                    title="Generate Image"
                  >
                    <Plus size={16} />
                  </button>
                  <button
                    onClick={handleRefresh}
                    className="p-2 rounded-md hover:bg-white/5 text-white/80"
                    title="Refresh"
                  >
                    <ArrowClockwise size={16} />
                  </button>
                  <button
                    onClick={() => setOpen(false)}
                    className="p-2 rounded-md hover:bg-white/5 text-white/80"
                    title="Close"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
              <Body
                enabled={enabled}
                loading={loading}
                error={error}
                jobs={jobs}
                jobsLoading={jobsLoading}
                jobsError={jobsError}
                onPreviewJob={previewJobOutput}
                projects={projects}
                selectedProjectId={selectedProjectId}
                selectedProject={selectedProject}
                onSelect={selectProject}
                onDelete={deleteProject}
                generatedImageUrl={generatedImageUrl}
                onOpenCanvas={() => setShowCanvasWorkspace(true)}
              />
            </>
          )}
        </div>
      </div>

      <CanvasWorkspaceModal
        isOpen={showCanvasWorkspace && !!selectedProject}
        onClose={() => setShowCanvasWorkspace(false)}
        project={selectedProject}
      />
    </>
  );
}

function Header({ onClose, onRefresh, onGenerate }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-theme-border">
      <div className="flex items-center gap-2">
        <ImageIcon className="text-white/80" size={18} weight="fill" />
        <div className="text-theme-text-primary font-semibold">
          Image Canvas
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={onGenerate}
          className="p-2 rounded-md hover:bg-white/5 text-white/80"
          title="Generate"
        >
          <Plus size={18} />
        </button>
        <button
          onClick={onRefresh}
          className="p-2 rounded-md hover:bg-white/5 text-white/80"
          title="Refresh"
        >
          <ArrowClockwise size={18} />
        </button>
        <button
          onClick={onClose}
          className="p-2 rounded-md hover:bg-white/5 text-white/80"
          title="Close"
        >
          <X size={18} />
        </button>
      </div>
    </div>
  );
}

function Body({
  enabled,
  loading,
  error,
  jobs,
  jobsLoading,
  jobsError,
  onPreviewJob,
  projects,
  selectedProjectId,
  selectedProject,
  onSelect,
  onDelete,
  generatedImageUrl,
  onOpenCanvas,
}) {
  const [showAllJobs, setShowAllJobs] = useState(false);
  const collapsedJobCount = 3;
  const [previewBroken, setPreviewBroken] = useState(false);
  const recoverAttemptedRef = useRef(false);

  useEffect(() => {
    setPreviewBroken(false);
    recoverAttemptedRef.current = false;
  }, [generatedImageUrl]);

  const recoverPreview = async () => {
    if (recoverAttemptedRef.current) return;
    recoverAttemptedRef.current = true;
    const latestCompleted = (jobs || []).find(
      (j) => j?.status === "completed" && !!j.outputAssetId
    );
    if (latestCompleted) await onPreviewJob?.(latestCompleted);
  };

  if (!enabled) {
    return (
      <div className="p-4 text-white/60 text-sm">
        Image Canvas requires a workspace. Select a workspace to use this
        feature.
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      {/* 预览（始终在上方，占位避免“历史任务顶上来”） */}
      <div className="p-4 border-b border-theme-border">
        <div className="flex items-center justify-between mb-2">
          <div className="text-white/60 text-xs">Result</div>
          <button
            onClick={onOpenCanvas}
            disabled={!selectedProject}
            className={`text-xs px-2 py-1 rounded-md border ${
              selectedProject
                ? "border-theme-border bg-white/5 hover:bg-white/10 text-white/80"
                : "border-theme-border bg-white/5 text-white/30 cursor-not-allowed"
            }`}
            title={selectedProject ? "Open Canvas" : "Select a project to edit"}
          >
            Open Canvas
          </button>
        </div>
        <div className="rounded-lg overflow-hidden border border-theme-border bg-black/20">
          {generatedImageUrl && !previewBroken ? (
            <img
              src={generatedImageUrl}
              alt="Generated"
              className="w-full h-auto"
              onError={() => {
                setPreviewBroken(true);
                recoverPreview();
              }}
            />
          ) : (
            <div className="w-full h-[180px] flex items-center justify-center text-white/50 text-sm">
              {previewBroken
                ? "Preview failed. Click a job to reload."
                : "No preview yet"}
            </div>
          )}
        </div>
      </div>

      {/* 历史任务（Jobs） */}
      <div className="p-2 border-b border-theme-border">
        <div className="flex items-center justify-between px-2 mb-2">
          <div className="flex items-center gap-2 text-white/60 text-xs">
            <ClockCounterClockwise size={14} />
            Recent Jobs
          </div>
          {jobs?.length > collapsedJobCount && (
            <button
              onClick={() => setShowAllJobs((v) => !v)}
              className="text-xs text-white/50 hover:text-white/80"
            >
              {showAllJobs ? "Collapse" : "Expand"}
            </button>
          )}
        </div>
        {jobsLoading ? (
          <div className="px-2 py-2 text-white/60 text-sm flex items-center gap-2">
            <SpinnerGap className="w-4 h-4 animate-spin" />
            Loading...
          </div>
        ) : jobsError ? (
          <div className="px-2 py-2 text-red-400 text-sm">{jobsError}</div>
        ) : !jobs || jobs.length === 0 ? (
          <div className="px-2 py-2 text-white/60 text-sm">No jobs yet.</div>
        ) : (
          <div
            className={`${showAllJobs ? "max-h-[30vh] overflow-y-auto pr-1" : ""} space-y-1 px-1`}
          >
            {(showAllJobs ? jobs : jobs.slice(0, collapsedJobCount)).map(
              (job) => (
                <JobRow key={job.id} job={job} onPreview={onPreviewJob} />
              )
            )}
          </div>
        )}
      </div>

      {/* 项目列表 */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="p-2">
          <div className="text-white/60 text-xs px-2 mb-2">Projects</div>
          {loading ? (
            <div className="p-4 text-white/60 text-sm">Loading...</div>
          ) : error ? (
            <div className="p-4 text-red-400 text-sm">{error}</div>
          ) : projects.length === 0 ? (
            <div className="p-4 text-white/60 text-sm">
              No projects yet. Generate an image to create your first project.
            </div>
          ) : (
            projects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                isSelected={project.id === selectedProjectId}
                onSelect={() => onSelect(project.id)}
                onDelete={() => onDelete(project.id)}
              />
            ))
          )}
        </div>
      </div>

      {/* 选中项目详情 */}
      {selectedProject && (
        <div className="flex-shrink-0 p-4 border-t border-theme-border max-h-[40%] overflow-y-auto">
          <div className="text-theme-text-primary font-semibold mb-2">
            {selectedProject.title || "Untitled Project"}
          </div>
          <button
            onClick={onOpenCanvas}
            className="w-full mb-3 px-3 py-2 rounded-lg bg-theme-accent-primary text-theme-text-primary text-sm hover:opacity-90"
          >
            Open Canvas
          </button>
          {selectedProject.sourcePrompt && (
            <div className="text-white/60 text-xs mb-3">
              <span className="text-white/40">Prompt: </span>
              {selectedProject.sourcePrompt}
            </div>
          )}
          {selectedProject.versions && selectedProject.versions.length > 0 && (
            <div className="space-y-2">
              <div className="text-white/60 text-xs">Versions</div>
              <div className="flex gap-2 flex-wrap">
                {selectedProject.versions.map((version, idx) => (
                  <div
                    key={version.id}
                    className="px-2 py-1 rounded text-xs border border-theme-border text-white/70"
                  >
                    v{idx + 1} - {version.versionType}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ProjectCard({ project, isSelected, onSelect, onDelete }) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [thumbUrl, setThumbUrl] = useState(null);
  const currentThumbAssetId = project?.currentVersionOutputAssetId || null;

  useEffect(() => {
    let cancelled = false;
    let objectUrl = null;

    async function load() {
      if (!currentThumbAssetId) {
        setThumbUrl(null);
        return;
      }

      const blobUrl =
        await WorkspaceImages.fetchAssetBlobUrl(currentThumbAssetId);
      if (cancelled) {
        if (blobUrl && blobUrl.startsWith("blob:"))
          URL.revokeObjectURL(blobUrl);
        return;
      }

      objectUrl = blobUrl;
      setThumbUrl(blobUrl);
    }

    load();
    return () => {
      cancelled = true;
      if (objectUrl && objectUrl.startsWith("blob:"))
        URL.revokeObjectURL(objectUrl);
    };
  }, [currentThumbAssetId]);

  const handleDelete = (e) => {
    e.stopPropagation();
    if (showDeleteConfirm) {
      onDelete();
      setShowDeleteConfirm(false);
    } else {
      setShowDeleteConfirm(true);
      setTimeout(() => setShowDeleteConfirm(false), 3000);
    }
  };

  return (
    <div
      onClick={onSelect}
      className={`w-full text-left p-3 rounded-lg mb-2 border cursor-pointer ${
        isSelected
          ? "border-theme-accent-primary bg-white/5"
          : "border-theme-border hover:bg-white/5"
      }`}
    >
      {thumbUrl && (
        <div className="mb-2 rounded-md overflow-hidden border border-theme-border bg-black/20">
          <img
            src={thumbUrl}
            alt="Project thumbnail"
            className="w-full h-auto"
          />
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <div className="text-theme-text-primary text-sm font-semibold truncate">
          {project.title || "Untitled"}
        </div>
        <div className="flex items-center gap-2">
          <div className="text-xs px-2 py-0.5 rounded bg-white/10 text-white/70 flex-shrink-0">
            {project.sourceType}
          </div>
          <button
            onClick={handleDelete}
            className={`p-1 rounded hover:bg-white/10 ${
              showDeleteConfirm ? "text-red-400" : "text-white/40"
            }`}
            title={showDeleteConfirm ? "Click again to confirm" : "Delete"}
          >
            <Trash size={14} />
          </button>
        </div>
      </div>
      {project.sourceProvider && (
        <div className="text-xs text-white/40 mt-1">
          via {project.sourceProvider}
        </div>
      )}
      {project.sourcePrompt && (
        <div className="text-xs text-white/60 mt-1 line-clamp-2">
          {project.sourcePrompt}
        </div>
      )}
    </div>
  );
}

function JobRow({ job, onPreview }) {
  const status = job?.status || "unknown";
  const isCompleted = status === "completed";
  const isFailed = status === "failed";
  const isRunning = status === "running" || status === "pending";

  const prompt = job?.params?.prompt || job?.params?.negativePrompt || "";
  const previewable = isCompleted && !!job?.outputAssetId;

  const statusColor = isCompleted
    ? "text-green-400"
    : isFailed
      ? "text-red-400"
      : "text-white/50";

  const statusIcon = isCompleted ? (
    <CheckCircle size={14} className={statusColor} weight="fill" />
  ) : isFailed ? (
    <WarningCircle size={14} className={statusColor} weight="fill" />
  ) : (
    <SpinnerGap
      size={14}
      className={`${statusColor} ${isRunning ? "animate-spin" : ""}`}
    />
  );

  const handleClick = async () => {
    if (!previewable) return;
    await onPreview?.(job);
  };

  return (
    <button
      onClick={handleClick}
      disabled={!previewable}
      className={`w-full flex items-center gap-2 px-2 py-2 rounded-md border text-left ${
        previewable
          ? "border-theme-border hover:bg-white/5 text-theme-text-primary"
          : "border-transparent text-white/40 cursor-not-allowed"
      }`}
      title={previewable ? "Click to preview" : "No output available"}
    >
      <div className="flex-shrink-0">{statusIcon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium truncate">
          {prompt ? prompt : `Job ${job.id?.slice(0, 8)}`}
        </div>
        <div className="text-[11px] text-white/40 truncate">
          {status}
          {typeof job?.progress === "number" ? ` · ${job.progress}%` : ""}
        </div>
      </div>
    </button>
  );
}
