import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import ModalWrapper from "@/components/ModalWrapper";
import WorkspaceImages from "@/models/workspaceImages";
import {
  ArrowsOut,
  ArrowDown,
  ArrowUp,
  DownloadSimple,
  Eye,
  EyeSlash,
  FloppyDisk,
  Lock,
  LockOpen,
  Minus,
  Plus,
  TextT,
  Trash,
  UploadSimple,
  X,
} from "@phosphor-icons/react";
import { useImageCanvas } from "./ImageCanvasContext";

function safeJsonParse(value, fallback = null) {
  if (!value) return fallback;
  if (typeof value === "object") return value;
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function deepClone(value) {
  if (!value || typeof value !== "object") return value;
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function newId() {
  if (typeof crypto !== "undefined" && crypto?.randomUUID)
    return crypto.randomUUID();
  return `id_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function getElementBaseBox(sceneGraph, element) {
  const sgW = toNumber(sceneGraph?.width, 1);
  const sgH = toNumber(sceneGraph?.height, 1);

  if (element?.type === "background") return { w: sgW, h: sgH };
  if (element?.type === "text") {
    return {
      w: toNumber(element?.layout?.boxW, 720),
      h: toNumber(element?.layout?.boxH, 200),
    };
  }
  if (element?.type === "image") {
    return {
      w: toNumber(element?.layout?.boxW, 512),
      h: toNumber(element?.layout?.boxH, 512),
    };
  }
  return { w: 200, h: 200 };
}

export default function CanvasWorkspaceModal({ isOpen, onClose, project }) {
  const canvasCtx = useImageCanvas();
  const workspaceSlug = canvasCtx?.workspaceSlug || null;
  const uploadImage = canvasCtx?.uploadImage;
  const selectProject = canvasCtx?.selectProject;

  const viewportRef = useRef(null);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [panning, setPanning] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const interactionRef = useRef(null);

  const fileInputRef = useRef(null);

  const parsedVersions = useMemo(() => {
    const versions = Array.isArray(project?.versions) ? project.versions : [];
    return versions.map((v) => ({
      ...v,
      sceneGraph: safeJsonParse(v.sceneGraph, null),
      derivedAssets: safeJsonParse(v.derivedAssets, null),
      metrics: safeJsonParse(v.metrics, null),
    }));
  }, [project]);

  const nonCurrentVersions = useMemo(() => {
    const currentId = project?.currentVersion?.id || null;
    return parsedVersions.filter((v) => v?.id && v.id !== currentId);
  }, [parsedVersions, project]);

  const [activeVersionId, setActiveVersionId] = useState(null);
  const activeVersion = useMemo(() => {
    const current = project?.currentVersion;
    const currentId = current?.id || null;

    if (!activeVersionId) {
      if (currentId) return current;
      return parsedVersions[0] || null;
    }

    if (currentId && activeVersionId === currentId) return current;
    return parsedVersions.find((v) => v.id === activeVersionId) || null;
  }, [activeVersionId, parsedVersions, project]);

  const [draftSceneGraph, setDraftSceneGraph] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  useEffect(() => {
    if (!isOpen) return;
    const sg = activeVersion?.sceneGraph;
    setDraftSceneGraph(sg && typeof sg === "object" ? deepClone(sg) : null);
    setDirty(false);
    setSaveError(null);
    setSelectedElementId(null);
  }, [activeVersion?.id, isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const sceneGraph = useMemo(() => {
    const sg = draftSceneGraph;
    return sg && typeof sg === "object" ? sg : null;
  }, [draftSceneGraph]);

  const elements = useMemo(() => {
    const list = Array.isArray(sceneGraph?.elements) ? sceneGraph.elements : [];
    return [...list].sort((a, b) => (a?.zIndex ?? 0) - (b?.zIndex ?? 0));
  }, [sceneGraph]);

  const [selectedElementId, setSelectedElementId] = useState(null);
  const selectedElement = useMemo(() => {
    if (!selectedElementId) return null;
    return elements.find((e) => e?.id === selectedElementId) || null;
  }, [elements, selectedElementId]);

  const updateElement = useCallback((elementId, updater) => {
    if (!elementId) return;
    setDraftSceneGraph((prev) => {
      if (!prev) return prev;
      const list = Array.isArray(prev.elements) ? prev.elements : [];
      const next = list.map((el) => {
        if (el?.id !== elementId) return el;
        const updated = typeof updater === "function" ? updater(el) : updater;
        return updated && typeof updated === "object" ? updated : el;
      });
      return { ...prev, elements: next };
    });
    setDirty(true);
  }, []);

  const setElementTransform = useCallback(
    (elementId, partialTransform) => {
      updateElement(elementId, (el) => ({
        ...el,
        transform: {
          x: 0,
          y: 0,
          scaleX: 1,
          scaleY: 1,
          rotate: 0,
          ...(el?.transform || {}),
          ...(partialTransform || {}),
        },
      }));
    },
    [updateElement]
  );

  const toggleElementLock = useCallback(
    (elementId) => {
      updateElement(elementId, (el) => ({ ...el, locked: !el?.locked }));
    },
    [updateElement]
  );

  const toggleElementVisible = useCallback(
    (elementId) => {
      updateElement(elementId, (el) => ({
        ...el,
        visible: el?.visible === false ? true : false,
      }));
    },
    [updateElement]
  );

  const moveElementZ = useCallback((elementId, direction) => {
    setDraftSceneGraph((prev) => {
      if (!prev) return prev;
      const list = Array.isArray(prev.elements) ? [...prev.elements] : [];
      const ordered = list
        .slice()
        .sort((a, b) => (a?.zIndex ?? 0) - (b?.zIndex ?? 0));
      const idx = ordered.findIndex((e) => e?.id === elementId);
      if (idx < 0) return prev;

      const el = ordered[idx];
      if (el?.type === "background") return prev;

      const nextIdx = direction === "up" ? idx + 1 : idx - 1;
      if (nextIdx < 0 || nextIdx >= ordered.length) return prev;

      const swapWith = ordered[nextIdx];
      if (swapWith?.type === "background") return prev;

      ordered[idx] = swapWith;
      ordered[nextIdx] = el;

      const zById = Object.fromEntries(ordered.map((e, z) => [e.id, z]));
      const nextElements = list.map((e) => ({
        ...e,
        zIndex: zById[e.id] ?? e.zIndex ?? 0,
      }));

      setDirty(true);
      return { ...prev, elements: nextElements };
    });
  }, []);

  const deleteElement = useCallback((elementId) => {
    if (!elementId) return;
    setDraftSceneGraph((prev) => {
      if (!prev) return prev;
      const list = Array.isArray(prev.elements) ? prev.elements : [];
      const next = list.filter((e) => e?.id !== elementId);
      setDirty(true);
      return { ...prev, elements: next };
    });
    setSelectedElementId((cur) => (cur === elementId ? null : cur));
  }, []);

  const addTextElement = useCallback(() => {
    setDraftSceneGraph((prev) => {
      if (!prev) return prev;
      const list = Array.isArray(prev.elements) ? prev.elements : [];
      const nextZ =
        Math.max(-1, ...list.map((e) => toNumber(e?.zIndex, 0))) + 1;
      const el = {
        id: newId(),
        type: "text",
        name: "Text",
        locked: false,
        visible: true,
        zIndex: nextZ,
        transform: { x: 120, y: 120, scaleX: 1, scaleY: 1, rotate: 0 },
        text: "双击编辑文字",
        fontFamily: "Inter",
        fontSize: 56,
        fontWeight: "600",
        fill: "#FFFFFF",
        layout: { boxW: 720, boxH: 200, align: "left" },
        source: { kind: "user" },
      };
      setSelectedElementId(el.id);
      setDirty(true);
      return { ...prev, elements: [...list, el] };
    });
  }, []);

  const onPickImage = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const onImagePicked = useCallback(
    async (e) => {
      const file = e.target.files?.[0] || null;
      e.target.value = "";
      if (!file || !uploadImage) return;

      const res = await uploadImage(file);
      if (!res?.success || !res?.asset?.id) return;

      const assetId = String(res.asset.id);
      const w = toNumber(res.asset.width, 512);
      const h = toNumber(res.asset.height, 512);

      setDraftSceneGraph((prev) => {
        if (!prev) return prev;
        const list = Array.isArray(prev.elements) ? prev.elements : [];
        const nextZ =
          Math.max(-1, ...list.map((el) => toNumber(el?.zIndex, 0))) + 1;
        const el = {
          id: newId(),
          type: "image",
          name: file.name || "Image",
          locked: false,
          visible: true,
          zIndex: nextZ,
          transform: { x: 160, y: 160, scaleX: 1, scaleY: 1, rotate: 0 },
          assetId,
          opacity: 1,
          layout: { boxW: w, boxH: h, align: "left" },
        };
        setSelectedElementId(el.id);
        setDirty(true);
        return { ...prev, elements: [...list, el] };
      });
    },
    [uploadImage]
  );

  const [assetUrls, setAssetUrls] = useState({});
  const assetUrlsRef = useRef({});
  useEffect(() => {
    assetUrlsRef.current = assetUrls;
  }, [assetUrls]);

  const requiredAssetIds = useMemo(() => {
    return Array.from(
      new Set(
        elements
          .map((e) => e?.assetId)
          .filter(Boolean)
          .map(String)
      )
    );
  }, [elements]);

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    const previousUrls = assetUrlsRef.current || {};

    async function load() {
      const next = {};
      for (const assetId of requiredAssetIds) {
        if (previousUrls?.[assetId]) {
          next[assetId] = previousUrls[assetId];
          continue;
        }

        const blobUrl = await WorkspaceImages.fetchAssetBlobUrl(assetId);
        if (cancelled) {
          if (blobUrl && blobUrl.startsWith("blob:"))
            URL.revokeObjectURL(blobUrl);
          return;
        }
        if (blobUrl) next[assetId] = blobUrl;
      }

      for (const [assetId, url] of Object.entries(previousUrls || {})) {
        if (next[assetId]) continue;
        if (typeof url === "string" && url.startsWith("blob:"))
          URL.revokeObjectURL(url);
      }

      if (!cancelled) setAssetUrls(next);
    }

    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, requiredAssetIds.join("|"), activeVersion?.id]);

  useEffect(() => {
    if (isOpen) return;
    for (const url of Object.values(assetUrlsRef.current || {})) {
      if (typeof url === "string" && url.startsWith("blob:"))
        URL.revokeObjectURL(url);
    }
    setAssetUrls({});
    setSelectedElementId(null);
    setActiveVersionId(null);
    setDraftSceneGraph(null);
    setDirty(false);
    setSaveError(null);
    setSaving(false);
    interactionRef.current = null;
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setPanning(false);
  }, [isOpen]);

  const fitToView = useCallback(() => {
    const w = toNumber(sceneGraph?.width, 1);
    const h = toNumber(sceneGraph?.height, 1);
    const vw = toNumber(viewportSize.width, 0);
    const vh = toNumber(viewportSize.height, 0);
    if (!vw || !vh) return;

    const padding = 32;
    const scale = Math.min((vw - padding) / w, (vh - padding) / h);
    const nextZoom = clamp(scale, 0.1, 4);
    const nextPan = {
      x: (vw - w * nextZoom) / 2,
      y: (vh - h * nextZoom) / 2,
    };
    setZoom(nextZoom);
    setPan(nextPan);
  }, [sceneGraph, viewportSize.height, viewportSize.width]);

  useEffect(() => {
    if (!isOpen) return;
    const el = viewportRef.current;
    if (!el) return;

    const update = () =>
      setViewportSize({
        width: el.clientWidth || 0,
        height: el.clientHeight || 0,
      });

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    fitToView();
  }, [fitToView, isOpen, activeVersion?.id]);

  const handleWheel = (e) => {
    e.preventDefault();
    const el = viewportRef.current;
    if (!el) return;

    const delta = e.deltaY || 0;
    const factor = delta > 0 ? 0.92 : 1.08;

    const rect = el.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;

    const canvasX = (cx - pan.x) / zoom;
    const canvasY = (cy - pan.y) / zoom;

    const nextZoom = clamp(zoom * factor, 0.1, 6);
    const nextPan = {
      x: cx - canvasX * nextZoom,
      y: cy - canvasY * nextZoom,
    };

    setZoom(nextZoom);
    setPan(nextPan);
  };

  const startPan = (e) => {
    if (e.button !== 0) return;
    setSelectedElementId(null);
    setPanning(true);
    panStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      panX: pan.x,
      panY: pan.y,
    };
  };

  const stopAllInteractions = () => {
    setPanning(false);
    interactionRef.current = null;
  };

  const onPointerMove = (e) => {
    const action = interactionRef.current;
    if (action) {
      const dx = (e.clientX - action.startClientX) / zoom;
      const dy = (e.clientY - action.startClientY) / zoom;

      if (action.mode === "move") {
        setElementTransform(action.elementId, {
          x: action.startX + dx,
          y: action.startY + dy,
        });
        return;
      }

      if (action.mode === "resize") {
        const baseW = action.baseW || 1;
        const baseH = action.baseH || 1;

        const clampScale = (v) => clamp(v, 0.05, 20);

        let nextScaleX = action.startScaleX;
        let nextScaleY = action.startScaleY;
        let nextX = action.startX;
        let nextY = action.startY;

        if (action.handle === "se") {
          nextScaleX = clampScale((baseW * action.startScaleX + dx) / baseW);
          nextScaleY = clampScale((baseH * action.startScaleY + dy) / baseH);
        } else if (action.handle === "sw") {
          nextScaleX = clampScale((baseW * action.startScaleX - dx) / baseW);
          nextScaleY = clampScale((baseH * action.startScaleY + dy) / baseH);
          nextX = action.startX + dx;
        } else if (action.handle === "ne") {
          nextScaleX = clampScale((baseW * action.startScaleX + dx) / baseW);
          nextScaleY = clampScale((baseH * action.startScaleY - dy) / baseH);
          nextY = action.startY + dy;
        } else if (action.handle === "nw") {
          nextScaleX = clampScale((baseW * action.startScaleX - dx) / baseW);
          nextScaleY = clampScale((baseH * action.startScaleY - dy) / baseH);
          nextX = action.startX + dx;
          nextY = action.startY + dy;
        }

        setElementTransform(action.elementId, {
          x: nextX,
          y: nextY,
          scaleX: nextScaleX,
          scaleY: nextScaleY,
        });
        return;
      }
      return;
    }

    if (!panning) return;
    const start = panStartRef.current;
    setPan({
      x: start.panX + (e.clientX - start.x),
      y: start.panY + (e.clientY - start.y),
    });
  };

  const onElementPointerDown = (e, el) => {
    e.stopPropagation();
    if (!el?.id) return;
    setSelectedElementId(el.id);

    if (e.button !== 0) return;
    if (el.locked) return;
    if (el.visible === false) return;
    if (el.type === "background") return;

    const t = el.transform || {};
    interactionRef.current = {
      mode: "move",
      elementId: el.id,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startX: toNumber(t.x, 0),
      startY: toNumber(t.y, 0),
    };
    e.currentTarget?.setPointerCapture?.(e.pointerId);
  };

  const onResizeHandlePointerDown = (e, el, handle) => {
    e.stopPropagation();
    if (!el?.id) return;
    if (e.button !== 0) return;
    if (el.locked) return;
    if (el.type === "background") return;

    const t = el.transform || {};
    const { w: baseW, h: baseH } = getElementBaseBox(sceneGraph, el);
    interactionRef.current = {
      mode: "resize",
      handle,
      elementId: el.id,
      baseW,
      baseH,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startX: toNumber(t.x, 0),
      startY: toNumber(t.y, 0),
      startScaleX: toNumber(t.scaleX, 1),
      startScaleY: toNumber(t.scaleY, 1),
    };
    e.currentTarget?.setPointerCapture?.(e.pointerId);
  };

  const canvasTitle = project?.title || "Untitled Project";
  const background =
    elements.find((e) => e?.type === "background") || elements[0] || null;
  const backgroundUrl = background?.assetId
    ? assetUrls?.[String(background.assetId)]
    : null;
  const downloadUrl = backgroundUrl || null;

  const selectedBase = selectedElement
    ? getElementBaseBox(sceneGraph, selectedElement)
    : null;
  const selectedTransform = selectedElement?.transform || {};
  const selectedX = toNumber(selectedTransform?.x, 0);
  const selectedY = toNumber(selectedTransform?.y, 0);
  const selectedScaleX = toNumber(selectedTransform?.scaleX, 1);
  const selectedScaleY = toNumber(selectedTransform?.scaleY, 1);
  const selectedRotate = toNumber(selectedTransform?.rotate, 0);

  const canEditSelected =
    !!selectedElement &&
    selectedElement.visible !== false &&
    selectedElement.locked !== true &&
    selectedElement.type !== "background";

  const handleSave = async () => {
    if (!workspaceSlug || !project?.id || !activeVersion?.id || !sceneGraph)
      return;
    if (!dirty || saving) return;

    setSaving(true);
    setSaveError(null);

    const nextVersionType =
      activeVersion?.versionType === "raw"
        ? "edited"
        : activeVersion?.versionType;

    const res = await WorkspaceImages.updateProjectVersion(
      workspaceSlug,
      project.id,
      activeVersion.id,
      {
        sceneGraph,
        ...(nextVersionType ? { versionType: nextVersionType } : {}),
      }
    );

    if (!res?.success) {
      setSaveError(res?.error || "Save failed.");
      setSaving(false);
      return;
    }

    setDirty(false);
    setSaving(false);
    await selectProject?.(project.id);
  };

  if (!isOpen) return null;

  return (
    <ModalWrapper isOpen={isOpen}>
      <div className="w-[96vw] h-[92vh] max-w-[1400px] bg-theme-bg-secondary rounded-xl border border-theme-border shadow-2xl overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-theme-border">
          <div className="min-w-0">
            <div className="text-theme-text-primary font-semibold truncate">
              {canvasTitle}
            </div>
            <div className="text-xs text-white/50 truncate">
              {activeVersion?.versionType
                ? `Version: ${activeVersion.versionType}`
                : "Version"}
              {dirty ? " · Unsaved" : ""}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={!dirty || saving || !sceneGraph}
              className={`px-3 py-2 rounded-md text-white/80 text-sm flex items-center gap-2 ${
                !dirty || saving || !sceneGraph
                  ? "bg-white/5 opacity-50 cursor-not-allowed"
                  : "bg-white/5 hover:bg-white/10"
              }`}
              title="Save scene graph"
            >
              <FloppyDisk size={16} />
              {saving ? "Saving..." : "Save"}
            </button>
            {downloadUrl && (
              <a
                href={downloadUrl}
                download={`canvas-${Date.now()}.png`}
                className="px-3 py-2 rounded-md bg-white/5 hover:bg-white/10 text-white/80 text-sm flex items-center gap-2"
              >
                <DownloadSimple size={16} />
                Download
              </a>
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-md hover:bg-white/10 text-white/70"
              title="Close"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 flex">
          <div className="w-[260px] border-r border-theme-border bg-theme-bg-primary/30">
            <div className="px-3 py-2 text-xs text-white/50 border-b border-theme-border">
              Layers
            </div>
            <div className="p-2 space-y-1 overflow-y-auto h-full">
              {elements.length === 0 ? (
                <div className="text-white/50 text-sm p-2">No elements</div>
              ) : (
                elements
                  .slice()
                  .sort((a, b) => (b?.zIndex ?? 0) - (a?.zIndex ?? 0))
                  .map((el) => (
                    <LayerRow
                      key={el.id}
                      element={el}
                      isSelected={el.id === selectedElementId}
                      onSelect={() => setSelectedElementId(el.id)}
                      onToggleVisible={() => toggleElementVisible(el.id)}
                      onToggleLock={() => toggleElementLock(el.id)}
                      onMoveUp={() => moveElementZ(el.id, "up")}
                      onMoveDown={() => moveElementZ(el.id, "down")}
                      onDelete={() => deleteElement(el.id)}
                    />
                  ))
              )}
            </div>
          </div>

          <div className="flex-1 min-w-0 flex flex-col">
            <div className="flex items-center justify-between px-3 py-2 border-b border-theme-border bg-theme-bg-primary/20">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setZoom((z) => clamp(z * 0.9, 0.1, 6))}
                  className="p-2 rounded-md hover:bg-white/10 text-white/70"
                  title="Zoom out"
                >
                  <Minus size={16} />
                </button>
                <div className="text-xs text-white/60 w-[64px] text-center">
                  {Math.round(zoom * 100)}%
                </div>
                <button
                  onClick={() => setZoom((z) => clamp(z * 1.1, 0.1, 6))}
                  className="p-2 rounded-md hover:bg-white/10 text-white/70"
                  title="Zoom in"
                >
                  <Plus size={16} />
                </button>
                <button
                  onClick={fitToView}
                  className="px-3 py-2 rounded-md hover:bg-white/10 text-white/70 text-sm flex items-center gap-2"
                  title="Fit"
                >
                  <ArrowsOut size={16} />
                  Fit
                </button>
                <div className="w-px h-6 bg-white/10 mx-1" />
                <button
                  onClick={addTextElement}
                  className="px-3 py-2 rounded-md hover:bg-white/10 text-white/70 text-sm flex items-center gap-2"
                  title="Add text"
                  disabled={!sceneGraph}
                >
                  <TextT size={16} />
                  Text
                </button>
                <button
                  onClick={onPickImage}
                  className="px-3 py-2 rounded-md hover:bg-white/10 text-white/70 text-sm flex items-center gap-2"
                  title="Add image"
                  disabled={!sceneGraph || !uploadImage}
                >
                  <UploadSimple size={16} />
                  Image
                </button>
              </div>

              <div className="flex items-center gap-2">
                <div className="text-xs text-white/40">Version</div>
                <select
                  value={activeVersion?.id || ""}
                  onChange={(e) => setActiveVersionId(e.target.value)}
                  className="bg-theme-bg-secondary border border-theme-border text-theme-text-primary text-sm rounded-md px-2 py-1"
                >
                  {project?.currentVersion?.id && (
                    <option value={project.currentVersion.id}>
                      current · {project.currentVersion.versionType || "raw"}
                    </option>
                  )}
                  {nonCurrentVersions.map((v, idx) => (
                    <option key={v.id} value={v.id}>
                      v{nonCurrentVersions.length - idx} · {v.versionType}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div
              ref={viewportRef}
              className="flex-1 min-h-0 relative overflow-hidden bg-theme-bg-primary"
              onWheel={handleWheel}
              onPointerDown={startPan}
              onPointerMove={onPointerMove}
              onPointerUp={stopAllInteractions}
              onPointerLeave={stopAllInteractions}
            >
              <div
                className="absolute inset-0 opacity-[0.18]"
                style={{
                  backgroundImage:
                    "linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)",
                  backgroundSize: "32px 32px",
                }}
              />

              <div
                className="absolute top-0 left-0"
                style={{
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                  transformOrigin: "0 0",
                  width: `${sceneGraph?.width || 1}px`,
                  height: `${sceneGraph?.height || 1}px`,
                }}
              >
                <div className="absolute inset-0 border border-theme-border rounded-sm" />

                {elements
                  .filter((el) => el?.visible !== false)
                  .map((el) => (
                    <StageElement
                      key={el.id}
                      element={el}
                      assetUrl={
                        el?.assetId ? assetUrls?.[String(el.assetId)] : null
                      }
                      sceneGraph={sceneGraph}
                      isSelected={el.id === selectedElementId}
                      onPointerDown={(evt) => onElementPointerDown(evt, el)}
                      onDoubleClick={() => {
                        if (el.type === "text") setSelectedElementId(el.id);
                      }}
                    />
                  ))}

                {selectedElement &&
                  selectedElement.visible !== false &&
                  selectedBase && (
                    <div
                      className="absolute top-0 left-0 pointer-events-none"
                      style={{
                        transform: `translate(${selectedX}px, ${selectedY}px) rotate(${selectedRotate}deg)`,
                        transformOrigin: "0 0",
                        width: `${selectedBase.w * selectedScaleX}px`,
                        height: `${selectedBase.h * selectedScaleY}px`,
                        outline: "2px solid rgba(59,130,246,0.9)",
                        borderRadius: 4,
                        boxShadow: "0 0 0 1px rgba(0,0,0,0.45)",
                      }}
                    >
                      {canEditSelected && (
                        <>
                          <ResizeHandle
                            pos="nw"
                            zoom={zoom}
                            onPointerDown={(evt) =>
                              onResizeHandlePointerDown(
                                evt,
                                selectedElement,
                                "nw"
                              )
                            }
                          />
                          <ResizeHandle
                            pos="ne"
                            zoom={zoom}
                            onPointerDown={(evt) =>
                              onResizeHandlePointerDown(
                                evt,
                                selectedElement,
                                "ne"
                              )
                            }
                          />
                          <ResizeHandle
                            pos="sw"
                            zoom={zoom}
                            onPointerDown={(evt) =>
                              onResizeHandlePointerDown(
                                evt,
                                selectedElement,
                                "sw"
                              )
                            }
                          />
                          <ResizeHandle
                            pos="se"
                            zoom={zoom}
                            onPointerDown={(evt) =>
                              onResizeHandlePointerDown(
                                evt,
                                selectedElement,
                                "se"
                              )
                            }
                          />
                        </>
                      )}
                    </div>
                  )}
              </div>
            </div>
          </div>

          <div className="w-[320px] border-l border-theme-border bg-theme-bg-primary/30">
            <div className="px-3 py-2 text-xs text-white/50 border-b border-theme-border">
              Properties
            </div>
            <div className="p-3 space-y-3 overflow-y-auto h-full">
              {saveError && (
                <div className="p-2 rounded-md border border-red-500/30 bg-red-500/10 text-red-300 text-sm">
                  {saveError}
                </div>
              )}

              {!selectedElement ? (
                <div className="text-white/50 text-sm">
                  Select a layer to inspect.
                </div>
              ) : (
                <>
                  <div>
                    <div className="text-theme-text-primary font-semibold text-sm">
                      {selectedElement.name || selectedElement.type}
                    </div>
                    <div className="text-white/40 text-xs">
                      {selectedElement.type} · zIndex{" "}
                      {selectedElement.zIndex ?? 0}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="text-white/50 text-xs">Transform</div>
                    <div className="grid grid-cols-2 gap-2">
                      <NumberField
                        label="x"
                        value={toNumber(selectedElement?.transform?.x, 0)}
                        disabled={!canEditSelected}
                        onChange={(v) =>
                          setElementTransform(selectedElement.id, { x: v })
                        }
                      />
                      <NumberField
                        label="y"
                        value={toNumber(selectedElement?.transform?.y, 0)}
                        disabled={!canEditSelected}
                        onChange={(v) =>
                          setElementTransform(selectedElement.id, { y: v })
                        }
                      />
                      <NumberField
                        label="scaleX"
                        value={toNumber(selectedElement?.transform?.scaleX, 1)}
                        step={0.01}
                        disabled={!canEditSelected}
                        onChange={(v) =>
                          setElementTransform(selectedElement.id, { scaleX: v })
                        }
                      />
                      <NumberField
                        label="scaleY"
                        value={toNumber(selectedElement?.transform?.scaleY, 1)}
                        step={0.01}
                        disabled={!canEditSelected}
                        onChange={(v) =>
                          setElementTransform(selectedElement.id, { scaleY: v })
                        }
                      />
                      <NumberField
                        label="rotate"
                        value={toNumber(selectedElement?.transform?.rotate, 0)}
                        step={1}
                        disabled={!canEditSelected}
                        onChange={(v) =>
                          setElementTransform(selectedElement.id, { rotate: v })
                        }
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="text-white/50 text-xs">Flags</div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleElementLock(selectedElement.id)}
                        className="px-2 py-1 rounded-md border border-theme-border bg-white/5 hover:bg-white/10 text-white/70 text-sm flex items-center gap-2 disabled:opacity-50"
                        disabled={selectedElement.type === "background"}
                      >
                        {selectedElement.locked ? (
                          <Lock size={14} />
                        ) : (
                          <LockOpen size={14} />
                        )}
                        {selectedElement.locked ? "Locked" : "Unlocked"}
                      </button>
                      <button
                        onClick={() => toggleElementVisible(selectedElement.id)}
                        className="px-2 py-1 rounded-md border border-theme-border bg-white/5 hover:bg-white/10 text-white/70 text-sm flex items-center gap-2"
                      >
                        {selectedElement.visible === false ? (
                          <EyeSlash size={14} />
                        ) : (
                          <Eye size={14} />
                        )}
                        {selectedElement.visible === false
                          ? "Hidden"
                          : "Visible"}
                      </button>
                    </div>
                  </div>

                  {selectedElement.type === "text" && (
                    <div className="space-y-2">
                      <div className="text-white/50 text-xs">Text</div>
                      <textarea
                        value={selectedElement.text || ""}
                        disabled={!canEditSelected}
                        onChange={(e) =>
                          updateElement(selectedElement.id, (el) => ({
                            ...el,
                            text: e.target.value,
                          }))
                        }
                        className="w-full min-h-[88px] rounded-md border border-theme-border bg-white/5 text-white/80 text-sm px-2 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <NumberField
                          label="fontSize"
                          value={toNumber(selectedElement.fontSize, 56)}
                          step={1}
                          disabled={!canEditSelected}
                          onChange={(v) =>
                            updateElement(selectedElement.id, (el) => ({
                              ...el,
                              fontSize: v,
                            }))
                          }
                        />
                        <ColorField
                          label="fill"
                          value={selectedElement.fill || "#ffffff"}
                          disabled={!canEditSelected}
                          onChange={(v) =>
                            updateElement(selectedElement.id, (el) => ({
                              ...el,
                              fill: v,
                            }))
                          }
                        />
                      </div>
                    </div>
                  )}

                  {selectedElement.type === "image" && (
                    <div className="space-y-2">
                      <div className="text-white/50 text-xs">Image</div>
                      <NumberField
                        label="opacity"
                        value={toNumber(selectedElement.opacity, 1)}
                        step={0.05}
                        min={0}
                        max={1}
                        disabled={!canEditSelected}
                        onChange={(v) =>
                          updateElement(selectedElement.id, (el) => ({
                            ...el,
                            opacity: clamp(v, 0, 1),
                          }))
                        }
                      />
                    </div>
                  )}

                  {canEditSelected && (
                    <button
                      onClick={() => deleteElement(selectedElement.id)}
                      className="w-full px-3 py-2 rounded-md border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-200 text-sm flex items-center justify-center gap-2"
                    >
                      <Trash size={16} />
                      Delete Layer
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onImagePicked}
        />
      </div>
    </ModalWrapper>
  );
}

function StageElement({
  element,
  assetUrl,
  sceneGraph,
  isSelected,
  onPointerDown,
  onDoubleClick,
}) {
  const { w, h } = getElementBaseBox(sceneGraph, element);
  const t = element?.transform || {};
  const x = toNumber(t.x, 0);
  const y = toNumber(t.y, 0);
  const scaleX = toNumber(t.scaleX, 1);
  const scaleY = toNumber(t.scaleY, 1);
  const rotate = toNumber(t.rotate, 0);

  const commonStyle = {
    width: `${w}px`,
    height: `${h}px`,
    transform: `translate(${x}px, ${y}px) rotate(${rotate}deg) scale(${scaleX}, ${scaleY})`,
    transformOrigin: "0 0",
    opacity: typeof element?.opacity === "number" ? element.opacity : 1,
  };

  const border = isSelected ? "ring-1 ring-blue-400/40" : "";

  if (element?.type === "background" || element?.type === "image") {
    return (
      <div
        className={`absolute top-0 left-0 select-none ${border}`}
        style={commonStyle}
        onPointerDown={onPointerDown}
        onDoubleClick={onDoubleClick}
      >
        {assetUrl ? (
          <img
            src={assetUrl}
            alt={element?.name || element?.type || "image"}
            draggable={false}
            className="w-full h-full object-cover pointer-events-none"
          />
        ) : (
          <div className="w-full h-full bg-white/5 border border-theme-border" />
        )}
      </div>
    );
  }

  if (element?.type === "text") {
    return (
      <div
        className={`absolute top-0 left-0 select-none ${border}`}
        style={commonStyle}
        onPointerDown={onPointerDown}
        onDoubleClick={onDoubleClick}
      >
        <div
          className="w-full h-full"
          style={{
            fontFamily: element.fontFamily || "Inter",
            fontWeight: element.fontWeight || "600",
            fontSize: `${toNumber(element.fontSize, 56)}px`,
            lineHeight: element.lineHeight
              ? String(element.lineHeight)
              : "1.15",
            letterSpacing: element.letterSpacing
              ? String(element.letterSpacing)
              : undefined,
            color: element.fill || "#ffffff",
            whiteSpace: "pre-wrap",
            overflow: "hidden",
            display: "flex",
            alignItems: "flex-start",
            justifyContent:
              element?.layout?.align === "center"
                ? "center"
                : element?.layout?.align === "right"
                  ? "flex-end"
                  : "flex-start",
          }}
        >
          <div className="pointer-events-none">{element.text || ""}</div>
        </div>
      </div>
    );
  }

  return null;
}

function ResizeHandle({ pos, zoom, onPointerDown }) {
  const size = 10 / (zoom || 1);
  const half = size / 2;

  const styleByPos = {
    nw: { left: -half, top: -half, cursor: "nwse-resize" },
    ne: { right: -half, top: -half, cursor: "nesw-resize" },
    sw: { left: -half, bottom: -half, cursor: "nesw-resize" },
    se: { right: -half, bottom: -half, cursor: "nwse-resize" },
  };

  return (
    <div
      className="absolute pointer-events-auto bg-white rounded-sm border border-blue-500"
      style={{
        width: size,
        height: size,
        ...styleByPos[pos],
      }}
      onPointerDown={onPointerDown}
    />
  );
}

function LayerRow({
  element,
  isSelected,
  onSelect,
  onToggleVisible,
  onToggleLock,
  onMoveUp,
  onMoveDown,
  onDelete,
}) {
  const isBackground = element?.type === "background";
  const isHidden = element?.visible === false;
  const isLocked = !!element?.locked;

  return (
    <div
      className={`w-full rounded-md border ${
        isSelected
          ? "border-theme-accent-primary bg-white/5"
          : "border-theme-border hover:bg-white/5"
      }`}
    >
      <button
        onClick={onSelect}
        className="w-full text-left px-2 py-2 flex gap-2"
      >
        <div className="min-w-0 flex-1">
          <div className="text-sm text-theme-text-primary truncate">
            {element?.name || element?.type || "Element"}
          </div>
          <div className="text-[11px] text-white/40 truncate">
            {element?.type}
            {isLocked ? " · locked" : ""}
            {isHidden ? " · hidden" : ""}
          </div>
        </div>
      </button>

      <div className="px-2 pb-2 flex items-center gap-1">
        <button
          onClick={onToggleVisible}
          className="p-1 rounded hover:bg-white/10 text-white/60"
          title={isHidden ? "Show" : "Hide"}
        >
          {isHidden ? <EyeSlash size={14} /> : <Eye size={14} />}
        </button>
        <button
          onClick={onToggleLock}
          className={`p-1 rounded hover:bg-white/10 text-white/60 ${
            isBackground ? "opacity-40 cursor-not-allowed" : ""
          }`}
          title={isLocked ? "Unlock" : "Lock"}
          disabled={isBackground}
        >
          {isLocked ? <Lock size={14} /> : <LockOpen size={14} />}
        </button>

        <div className="flex-1" />

        <button
          onClick={onMoveDown}
          className={`p-1 rounded hover:bg-white/10 text-white/60 ${
            isBackground ? "opacity-40 cursor-not-allowed" : ""
          }`}
          title="Send backward"
          disabled={isBackground}
        >
          <ArrowDown size={14} />
        </button>
        <button
          onClick={onMoveUp}
          className={`p-1 rounded hover:bg-white/10 text-white/60 ${
            isBackground ? "opacity-40 cursor-not-allowed" : ""
          }`}
          title="Bring forward"
          disabled={isBackground}
        >
          <ArrowUp size={14} />
        </button>
        <button
          onClick={onDelete}
          className={`p-1 rounded hover:bg-white/10 ${
            isBackground
              ? "opacity-40 cursor-not-allowed text-white/60"
              : "text-red-300"
          }`}
          title="Delete layer"
          disabled={isBackground}
        >
          <Trash size={14} />
        </button>
      </div>
    </div>
  );
}

function NumberField({
  label,
  value,
  step = 1,
  min,
  max,
  disabled = false,
  onChange,
}) {
  return (
    <div className="rounded-md border border-theme-border bg-white/5 px-2 py-2">
      <div className="text-[11px] text-white/40">{label}</div>
      <input
        type="number"
        step={step}
        min={min}
        max={max}
        value={Number.isFinite(value) ? value : 0}
        disabled={disabled}
        onChange={(e) => onChange?.(toNumber(e.target.value, 0))}
        className="w-full bg-transparent text-sm text-white/80 focus:outline-none disabled:opacity-60"
      />
    </div>
  );
}

function ColorField({ label, value, disabled = false, onChange }) {
  return (
    <div className="rounded-md border border-theme-border bg-white/5 px-2 py-2">
      <div className="text-[11px] text-white/40">{label}</div>
      <input
        type="color"
        value={value || "#ffffff"}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.value)}
        className="w-full h-[32px] bg-transparent rounded"
      />
    </div>
  );
}
