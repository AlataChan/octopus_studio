import React, { useEffect, useMemo, useState } from "react";
import { isMobile } from "react-device-detect";
import {
  ArrowClockwise,
  DownloadSimple,
  FileText,
  X,
} from "@phosphor-icons/react";
import DOMPurify from "@/utils/chat/purify";
import renderMarkdown from "@/utils/chat/markdown";
import { ARTIFACT_SIDEBAR_OPEN_EVENT, useArtifacts } from "../ArtifactsContext";
import { WORKSPACE_CHAT_SUBMIT_EVENT } from "@/components/WorkspaceChat/ChatContainer";
import showToast from "@/utils/toast";

function typeLabel(type) {
  switch (type) {
    case "spec":
      return "Spec";
    case "sop":
      return "SOP";
    case "code":
      return "Code";
    case "summary":
      return "Summary";
    default:
      return "Note";
  }
}

function safeMarkdownForPreview({ type, content, language }) {
  if (type !== "code") return content || "";
  const raw = String(content || "");
  const hasFence = raw.includes("```");
  if (hasFence) return raw;
  const lang = language ? String(language) : "";
  return `\`\`\`${lang}\n${raw}\n\`\`\``;
}

function sanitizeFilenameBase(input) {
  const raw = String(input || "").trim();
  const cleaned = raw
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  return (cleaned || "artifact").slice(0, 80);
}

export default function ArtifactsSidebar() {
  const artifactsState = useArtifacts();
  const [open, setOpen] = useState(!isMobile);
  const [instruction, setInstruction] = useState("");
  const [useFullContent, setUseFullContent] = useState(false);

  if (!artifactsState) return null;

  const {
    enabled,
    loading,
    error,
    artifacts,
    refresh,
    selectedArtifactId,
    selectedVersionId,
    selectedContent,
    selectedContentLoading,
    selectArtifact,
    promote,
  } = artifactsState;

  const selectedArtifact = useMemo(
    () => artifacts.find((a) => a.id === selectedArtifactId) || null,
    [artifacts, selectedArtifactId]
  );

  useEffect(() => {
    if (selectedArtifactId) setOpen(true);
  }, [selectedArtifactId]);

  useEffect(() => {
    function onOpenSidebar() {
      setOpen(true);
    }
    window.addEventListener(ARTIFACT_SIDEBAR_OPEN_EVENT, onOpenSidebar);
    return () =>
      window.removeEventListener(ARTIFACT_SIDEBAR_OPEN_EVENT, onOpenSidebar);
  }, []);

  const previewHtml = useMemo(() => {
    if (!selectedArtifact) return "";
    const version =
      (selectedVersionId &&
        Array.isArray(selectedArtifact.versions) &&
        selectedArtifact.versions.find(
          (v) => v.versionId === selectedVersionId
        )) ||
      null;
    const language = version?.language || null;
    const md = safeMarkdownForPreview({
      type: selectedArtifact.type,
      content: selectedContent,
      language,
    });
    return DOMPurify.sanitize(renderMarkdown(md || ""));
  }, [selectedArtifact, selectedContent, selectedVersionId]);

  function handleDownloadMarkdown() {
    if (!selectedArtifact) return;

    const versions = Array.isArray(selectedArtifact.versions)
      ? selectedArtifact.versions
      : [];
    const version =
      (selectedVersionId &&
        versions.find((v) => v.versionId === selectedVersionId)) ||
      null;
    const language = version?.language || null;
    const md = safeMarkdownForPreview({
      type: selectedArtifact.type,
      content: selectedContent,
      language,
    });

    const titleBase = sanitizeFilenameBase(
      selectedArtifact.title || selectedArtifact.name || selectedArtifact.id
    );
    const versionSuffix = selectedVersionId ? `-${selectedVersionId}` : "";
    const filename = `${titleBase}${versionSuffix}.md`;

    const blob = new Blob([md || ""], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleRegenerate() {
    if (!selectedArtifact) return;
    const text = String(instruction || "").trim();
    if (!text) {
      showToast("请输入修改指令", "warning");
      return;
    }

    const versions = Array.isArray(selectedArtifact.versions)
      ? selectedArtifact.versions
      : [];
    const baseVersionId =
      selectedVersionId || selectedArtifact.currentVersionId || null;
    const baseVersion = baseVersionId
      ? versions.find((v) => v.versionId === baseVersionId)
      : null;
    const language = baseVersion?.language || null;

    const parts = [
      `你正在修改一个 Artifact（交付物）。`,
      ``,
      `[Artifact]`,
      `- 标题: ${selectedArtifact.title || selectedArtifact.name || "Untitled"}`,
      `- 类型: ${typeLabel(selectedArtifact.type)}`,
      baseVersionId ? `- 基于版本: ${baseVersionId}` : null,
      selectedArtifact.summary ? `- 摘要: ${selectedArtifact.summary}` : null,
      ``,
    ].filter(Boolean);

    if (useFullContent) {
      parts.push(`[全文]`);
      parts.push(String(selectedContent || ""));
      parts.push(``);
    }

    parts.push(`[修改指令]`);
    parts.push(text);
    parts.push(``);
    parts.push(`请输出“更新后的完整交付物正文”，不要解释过程。`);

    const message = parts.join("\n");
    window.dispatchEvent(
      new CustomEvent(WORKSPACE_CHAT_SUBMIT_EVENT, {
        detail: {
          message,
          attachments: [],
          artifact: {
            action: "regenerate",
            artifactId: selectedArtifact.id,
            baseVersionId,
            language,
          },
        },
      })
    );
    setInstruction("");
  }

  // Mobile: render as overlay drawer when open.
  if (isMobile) {
    return (
      <>
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 bg-theme-accent-primary text-theme-text-primary px-4 py-2 rounded-full shadow-lg"
        >
          Artifacts
        </button>
        {open && (
          <div className="fixed inset-0 z-50 bg-black/40">
            <div className="absolute inset-y-0 right-0 w-[90vw] max-w-[420px] bg-theme-bg-secondary border-l border-theme-border flex flex-col">
              <Header onClose={() => setOpen(false)} onRefresh={refresh} />
              <Body
                enabled={enabled}
                loading={loading}
                error={error}
                artifacts={artifacts}
                selectedArtifact={selectedArtifact}
                selectedArtifactId={selectedArtifactId}
                selectedVersionId={selectedVersionId}
                selectedContentLoading={selectedContentLoading}
                previewHtml={previewHtml}
                onSelect={selectArtifact}
                onPromote={promote}
                onDownloadMarkdown={handleDownloadMarkdown}
                instruction={instruction}
                setInstruction={setInstruction}
                useFullContent={useFullContent}
                setUseFullContent={setUseFullContent}
                onRegenerate={handleRegenerate}
              />
            </div>
          </div>
        )}
      </>
    );
  }

  // Desktop: always mounted, can be collapsed.
  return (
    <div
      className={`h-full ${open ? "w-[420px]" : "w-[52px]"} transition-all duration-300`}
    >
      <div className="h-full bg-theme-bg-secondary border-l border-theme-border flex flex-col">
        <div className="flex items-center justify-between px-3 py-3 border-b border-theme-border">
          {open ? (
            <div className="flex items-center gap-2">
              <FileText className="text-white/80" size={18} weight="fill" />
              <div className="text-theme-text-primary font-semibold">
                Artifacts
              </div>
            </div>
          ) : (
            <FileText
              className="text-white/80 mx-auto"
              size={18}
              weight="fill"
            />
          )}
          {open && (
            <div className="flex items-center gap-2">
              <button
                onClick={refresh}
                className="p-2 rounded-md hover:bg-white/5 text-white/80"
                title="Refresh"
              >
                <ArrowClockwise size={16} />
              </button>
              <button
                onClick={() => setOpen(false)}
                className="p-2 rounded-md hover:bg-white/5 text-white/80"
                title="Collapse"
              >
                <X size={16} />
              </button>
            </div>
          )}
          {!open && (
            <button
              onClick={() => setOpen(true)}
              className="absolute top-3 right-3 p-2 rounded-md hover:bg-white/5 text-white/80"
              title="Expand"
            >
              <X size={16} className="rotate-45" />
            </button>
          )}
        </div>

        {open ? (
          <Body
            enabled={enabled}
            loading={loading}
            error={error}
            artifacts={artifacts}
            selectedArtifact={selectedArtifact}
            selectedArtifactId={selectedArtifactId}
            selectedVersionId={selectedVersionId}
            selectedContentLoading={selectedContentLoading}
            previewHtml={previewHtml}
            onSelect={selectArtifact}
            onPromote={promote}
            onDownloadMarkdown={handleDownloadMarkdown}
            instruction={instruction}
            setInstruction={setInstruction}
            useFullContent={useFullContent}
            setUseFullContent={setUseFullContent}
            onRegenerate={handleRegenerate}
          />
        ) : (
          <div className="flex-1" />
        )}
      </div>
    </div>
  );
}

function Header({ onClose, onRefresh }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-theme-border">
      <div className="text-theme-text-primary font-semibold">Artifacts</div>
      <div className="flex items-center gap-2">
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
  artifacts,
  selectedArtifact,
  selectedArtifactId,
  selectedVersionId,
  selectedContentLoading,
  previewHtml,
  onSelect,
  onPromote,
  onDownloadMarkdown,
  instruction,
  setInstruction,
  useFullContent,
  setUseFullContent,
  onRegenerate,
}) {
  if (!enabled) {
    return (
      <div className="p-4 text-white/60 text-sm">
        Artifacts are available in threaded chats. Create or open a thread to
        use this feature.
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="flex-1 min-h-0 overflow-y-auto border-b border-theme-border">
        {loading ? (
          <div className="p-4 text-white/60 text-sm">Loading...</div>
        ) : error ? (
          <div className="p-4 text-red-400 text-sm">{error}</div>
        ) : artifacts.length === 0 ? (
          <div className="p-4 text-white/60 text-sm">
            暂无文档。点击 AI 回复下方的“显示文档”即可生成/打开。
          </div>
        ) : (
          <div className="p-2">
            {artifacts
              .slice()
              .sort((a, b) =>
                String(b.updatedAt || "").localeCompare(
                  String(a.updatedAt || "")
                )
              )
              .map((a) => (
                <button
                  key={a.id}
                  onClick={() => onSelect({ artifactId: a.id })}
                  className={`w-full text-left p-3 rounded-lg mb-2 border ${
                    a.id === selectedArtifactId
                      ? "border-theme-accent-primary bg-white/5"
                      : "border-theme-border hover:bg-white/5"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-theme-text-primary text-sm font-semibold truncate">
                      {a.title || a.name || "Untitled"}
                    </div>
                    <div className="text-xs px-2 py-0.5 rounded bg-white/10 text-white/70 flex-shrink-0">
                      {typeLabel(a.type)}
                    </div>
                  </div>
                  {a.draftVersionId && (
                    <div className="text-xs text-amber-300 mt-1">
                      Draft: {a.draftVersionId}
                    </div>
                  )}
                  {!!a.summary && (
                    <div className="text-xs text-white/60 mt-1 line-clamp-2">
                      {a.summary}
                    </div>
                  )}
                </button>
              ))}
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {!selectedArtifact ? (
          <div className="p-4 text-white/60 text-sm">
            Select an artifact to preview.
          </div>
        ) : (
          <div className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-theme-text-primary font-semibold truncate">
                  {selectedArtifact.title ||
                    selectedArtifact.name ||
                    "Untitled"}
                </div>
                <div className="text-white/60 text-xs mt-1">
                  Current: {selectedArtifact.currentVersionId || "—"}
                  {selectedArtifact.draftVersionId
                    ? ` · Draft: ${selectedArtifact.draftVersionId}`
                    : ""}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={onDownloadMarkdown}
                  className="px-3 py-2 rounded-lg bg-white/5 border border-theme-border text-white/80 text-xs font-semibold hover:bg-white/10 flex items-center gap-2"
                  title="下载为 .md"
                  disabled={selectedContentLoading}
                >
                  <DownloadSimple size={14} />
                  下载为 .md
                </button>
                {selectedArtifact.draftVersionId && (
                  <button
                    onClick={() =>
                      onPromote({
                        artifactId: selectedArtifact.id,
                        versionId: selectedArtifact.draftVersionId,
                      })
                    }
                    className="px-3 py-2 rounded-lg bg-theme-accent-primary text-theme-text-primary text-xs font-semibold hover:bg-theme-accent-primary/80"
                  >
                    采纳
                  </button>
                )}
              </div>
            </div>

            <div className="mt-4">
              <div className="flex gap-2 mb-3">
                {(selectedArtifact.versions || [])
                  .slice()
                  .reverse()
                  .map((v) => (
                    <button
                      key={v.versionId}
                      onClick={() =>
                        onSelect({
                          artifactId: selectedArtifact.id,
                          versionId: v.versionId,
                        })
                      }
                      className={`px-2 py-1 rounded text-xs border ${
                        v.versionId === selectedVersionId
                          ? "border-theme-accent-primary bg-white/5 text-theme-text-primary"
                          : "border-theme-border text-white/70 hover:bg-white/5"
                      }`}
                    >
                      {v.versionId}
                    </button>
                  ))}
              </div>

              {selectedContentLoading ? (
                <div className="text-white/60 text-sm">Loading content...</div>
              ) : (
                <div
                  className="markdown text-white/90 text-sm"
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
                />
              )}
            </div>

            <div className="mt-6 pt-4 border-t border-theme-border">
              <div className="text-theme-text-primary font-semibold text-sm mb-2">
                Regenerate (Draft)
              </div>
              <label className="flex items-center gap-2 text-white/70 text-xs mb-2">
                <input
                  type="checkbox"
                  checked={useFullContent}
                  onChange={(e) => setUseFullContent(e.target.checked)}
                />
                基于全文（更耗 Token）
              </label>
              <textarea
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                placeholder="例如：把方案改成更正式的语气，并补充边界条件与验收标准。"
                className="w-full h-24 rounded-lg bg-theme-bg-primary border border-theme-border text-theme-text-primary text-sm p-3 outline-none focus:border-theme-accent-primary"
              />
              <div className="mt-3 flex justify-end">
                <button
                  onClick={onRegenerate}
                  className="px-4 py-2 rounded-lg bg-theme-accent-primary text-theme-text-primary text-sm font-semibold hover:bg-theme-accent-primary/80"
                >
                  Generate Draft
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
