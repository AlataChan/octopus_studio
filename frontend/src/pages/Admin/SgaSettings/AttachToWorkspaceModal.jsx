import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { X } from "@phosphor-icons/react";
import Molt from "@/models/molt";
import Workspace from "@/models/workspace";
import paths from "@/utils/paths";

function agentId(agent) {
  return agent?.id || agent?.agentId || agent?.moltAgentId || "";
}

function agentName(agent) {
  return agent?.name || agent?.label || agent?.displayName || agentId(agent);
}

function workspaceSlug(workspace) {
  return workspace?.slug || workspace?.name || "";
}

function workspaceName(workspace) {
  return workspace?.name || workspace?.slug || "-";
}

export async function loadAttachWorkspaces({
  workspaceModel = Workspace,
} = {}) {
  try {
    const workspaces = await workspaceModel.all();
    return Array.isArray(workspaces) ? workspaces : [];
  } catch {
    return [];
  }
}

export function attachErrorMessage(result, t = (key) => key) {
  if (result?.status === 403 || result?.code === "FORBIDDEN") {
    return t("molt.console.attach.error_403");
  }
  return t("molt.console.attach.error_generic");
}

export async function attachMoltAgentToWorkspace({
  agent,
  displayName = "",
  molt = Molt,
  slug,
}) {
  if (!slug) return { success: false, error: "Missing workspace" };
  const moltAgentId = agentId(agent);
  if (!moltAgentId) return { success: false, error: "Missing Molt agent" };

  try {
    const result = await molt.attachWorkspaceAgent(slug, {
      moltAgentId,
      displayName: displayName?.trim() || undefined,
    });
    return result?.success === false ? result : { ...result, success: true };
  } catch (error) {
    return { success: false, error: error?.message || "Network error" };
  }
}

export default function AttachToWorkspaceModal({
  agent,
  attachResult = null,
  displayName: initialDisplayName = "",
  isOpen,
  onClose,
  onSuccess,
  selectedSlug: initialSelectedSlug = "",
  t,
  workspaces: providedWorkspaces = null,
}) {
  const [workspaces, setWorkspaces] = useState(providedWorkspaces || []);
  const [selectedSlug, setSelectedSlug] = useState(initialSelectedSlug);
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [isLoadingWorkspaces, setIsLoadingWorkspaces] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState(attachResult);

  useEffect(() => {
    if (!isOpen || providedWorkspaces) return;
    let mounted = true;

    async function load() {
      setIsLoadingWorkspaces(true);
      const items = await loadAttachWorkspaces();
      if (!mounted) return;
      setWorkspaces(items);
      setSelectedSlug((current) => current || workspaceSlug(items[0]) || "");
      setIsLoadingWorkspaces(false);
    }

    load();
    return () => {
      mounted = false;
    };
  }, [isOpen, providedWorkspaces]);

  useEffect(() => {
    if (!selectedSlug && workspaces.length > 0) {
      setSelectedSlug(workspaceSlug(workspaces[0]));
    }
  }, [selectedSlug, workspaces]);

  const selectedWorkspace = useMemo(
    () =>
      workspaces.find((workspace) => workspaceSlug(workspace) === selectedSlug),
    [selectedSlug, workspaces]
  );

  if (!isOpen || !agent) return null;

  async function handleSubmit(event) {
    event.preventDefault();
    if (!selectedSlug || isSubmitting) return;

    setIsSubmitting(true);
    setResult(null);
    const nextResult = await attachMoltAgentToWorkspace({
      agent,
      displayName,
      slug: selectedSlug,
    });
    setResult({ ...nextResult, workspaceSlug: selectedSlug });
    setIsSubmitting(false);

    if (nextResult?.success !== false) {
      onSuccess?.({
        agent,
        workspace: selectedWorkspace,
        workspaceSlug: selectedSlug,
      });
    }
  }

  const title = t("molt.console.attach.title", { agent: agentName(agent) });
  const success = result?.success === true;
  const error =
    result?.success === false ? attachErrorMessage(result, t) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl overflow-hidden rounded-lg border-2 border-theme-modal-border bg-theme-bg-secondary shadow-xl">
        <div className="relative border-b border-theme-modal-border p-6">
          <div className="pr-10">
            <h3 className="text-xl font-semibold text-theme-text-primary">
              {title}
            </h3>
            <p className="mt-1 font-mono text-xs text-theme-text-secondary">
              {agentId(agent)}
            </p>
          </div>
          <button
            aria-label={t("molt.console.attach.cancel")}
            className="absolute right-4 top-4 inline-flex rounded-lg border border-transparent p-1 text-theme-text-primary transition-colors hover:border-theme-modal-border hover:bg-theme-modal-border"
            onClick={onClose}
            type="button"
          >
            <X size={24} weight="bold" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="space-y-5 p-6">
            {success ? (
              <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-4">
                <p className="font-semibold text-green-600">
                  {t("molt.console.attach.success_title")}
                </p>
                <Link
                  className="mt-2 inline-flex text-sm font-medium text-[var(--theme-accent-primary)] hover:opacity-80"
                  to={paths.workspace.aiTeam(
                    result.workspaceSlug || selectedSlug
                  )}
                >
                  {t("molt.console.attach.success_link")}
                </Link>
              </div>
            ) : (
              <>
                {error && (
                  <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600">
                    {error}
                  </div>
                )}

                <div>
                  <label className="mb-2 block text-sm font-medium text-theme-text-primary">
                    {t("molt.console.attach.workspace_label")}
                  </label>
                  <select
                    className="block w-full rounded-lg border-none bg-theme-settings-input-bg p-2.5 text-sm text-theme-text-primary outline-none focus:outline-primary-button"
                    disabled={isLoadingWorkspaces || workspaces.length === 0}
                    onChange={(event) => setSelectedSlug(event.target.value)}
                    value={selectedSlug}
                  >
                    {workspaces.map((workspace) => (
                      <option
                        key={workspaceSlug(workspace)}
                        value={workspaceSlug(workspace)}
                      >
                        {workspaceName(workspace)}
                      </option>
                    ))}
                  </select>
                  {!isLoadingWorkspaces && workspaces.length === 0 && (
                    <p className="mt-2 text-sm text-theme-text-secondary">
                      {t("molt.console.attach.no_workspaces")}
                    </p>
                  )}
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-theme-text-primary">
                    {t("molt.console.attach.display_name_label")}
                  </label>
                  <input
                    className="block w-full rounded-lg border-none bg-theme-settings-input-bg p-2.5 text-sm text-theme-text-primary placeholder:text-theme-settings-input-placeholder outline-none focus:outline-primary-button"
                    onChange={(event) => setDisplayName(event.target.value)}
                    placeholder={agentName(agent)}
                    type="text"
                    value={displayName}
                  />
                </div>
              </>
            )}
          </div>

          <div className="flex justify-end gap-2 border-t border-theme-modal-border p-6">
            <button
              aria-label={t("molt.console.attach.cancel")}
              className="rounded-lg border border-theme-sidebar-border px-4 py-2 text-sm font-medium text-theme-text-primary hover:bg-theme-action-menu-item-hover"
              onClick={onClose}
              type="button"
            >
              {t("molt.console.attach.cancel")}
            </button>
            {!success && (
              <button
                className="rounded-lg bg-primary-button px-4 py-2 text-sm font-medium text-[var(--theme-button-primary-text)] hover:opacity-90 disabled:opacity-60"
                disabled={
                  isSubmitting ||
                  isLoadingWorkspaces ||
                  workspaces.length === 0 ||
                  !selectedSlug
                }
                type="submit"
              >
                {isSubmitting
                  ? t("molt.console.attach.loading")
                  : t("molt.console.attach.submit")}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
