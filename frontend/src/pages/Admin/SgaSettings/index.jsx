import { useCallback, useEffect, useMemo, useState } from "react";
import Sidebar from "@/components/SettingsSidebar";
import Molt from "@/models/molt";
import { isMobile } from "react-device-detect";
import { useTranslation } from "react-i18next";
import AttachToWorkspaceModal from "./AttachToWorkspaceModal";
import MoltAgentChatPanel from "./MoltAgentChatPanel";

const emptyPayload = {
  status: null,
  capability: null,
  missionStatus: null,
  archetypes: [],
  agents: [],
  kmStatus: null,
};

function formatDate(value) {
  if (!value) return "Never";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function statusTone(state) {
  if (state === "CONNECTED") return "bg-green-500/10 text-green-600";
  if (state === "DEGRADED") return "bg-yellow-500/10 text-yellow-600";
  if (state === "OFFLINE") return "bg-red-500/10 text-red-600";
  return "bg-theme-bg-primary text-theme-text-secondary";
}

function Section({ title, children }) {
  return (
    <section className="rounded-lg border border-theme-sidebar-border bg-theme-bg-primary p-5">
      <div className="text-sm font-semibold text-theme-text-primary">
        {title}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-md border border-theme-sidebar-border bg-theme-bg-secondary p-4">
      <p className="text-xs uppercase tracking-wide text-theme-text-secondary">
        {label}
      </p>
      <p className="mt-2 break-words text-lg font-semibold text-theme-text-primary">
        {value ?? "-"}
      </p>
    </div>
  );
}

function KeyValue({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-x-4 border-b border-theme-sidebar-border py-2 last:border-b-0">
      <span className="text-sm text-theme-text-secondary">{label}</span>
      <span className="max-w-[70%] break-words text-right text-sm text-theme-text-primary">
        {value ?? "-"}
      </span>
    </div>
  );
}

function agentName(agent) {
  return agent?.name || agent?.label || agent?.displayName || agent?.id || "-";
}

function agentStatus(agent) {
  return agent?.status || agent?.state || agent?.lifecycle || "unknown";
}

function agentCapabilities(agent) {
  if (Array.isArray(agent?.capabilities)) return agent.capabilities;
  if (Array.isArray(agent?.capabilities?.tools))
    return agent.capabilities.tools;
  if (Array.isArray(agent?.tools)) return agent.tools;
  if (Array.isArray(agent?.skills)) return agent.skills;
  return [];
}

function capabilityLabel(capability) {
  if (typeof capability === "string") return capability;
  return (
    capability?.toolId ||
    capability?.name ||
    capability?.id ||
    capability?.label ||
    null
  );
}

function agentId(agent) {
  return String(agent?.id || agent?.agentId || agentName(agent) || "");
}

export function normalizeKmStatus(kmStatus = {}) {
  if (!kmStatus || kmStatus.success === false) {
    return {
      state: "unknown",
      version: null,
      capabilities: [],
      error: kmStatus?.error || null,
    };
  }

  const rawState = String(
    kmStatus.state || kmStatus.status || ""
  ).toLowerCase();
  const configured =
    kmStatus.configured === true ||
    rawState === "configured" ||
    rawState === "ready";
  const disabled =
    kmStatus.disabled === true ||
    kmStatus.enabled === false ||
    rawState === "disabled";
  const capabilities = asArray(
    kmStatus.capabilities ||
      kmStatus.km?.capabilities ||
      kmStatus.data?.capabilities
  );

  return {
    state: disabled ? "disabled" : configured ? "configured" : "not_configured",
    version: kmStatus.version || kmStatus.km?.version || kmStatus.data?.version,
    capabilities,
    error: null,
  };
}

export function canSubmitTextUpload({ filename, content, agentId }) {
  return Boolean(
    String(filename || "").trim() &&
    String(content || "").trim() &&
    String(agentId || "").trim()
  );
}

export async function uploadTextToMolt({
  molt = Molt,
  filename,
  content,
  agentId,
}) {
  if (!canSubmitTextUpload({ filename, content, agentId })) {
    return { success: false, validation: true };
  }

  try {
    return await molt.uploadTextFile({
      filename: String(filename).trim(),
      content,
      agentId,
    });
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function reconnectMolt({ molt = Molt } = {}) {
  try {
    return await molt.reconnect();
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export function openMoltDashboard({
  dashboardUrl,
  opener = typeof window !== "undefined" ? window.open.bind(window) : () => {},
} = {}) {
  const base = String(dashboardUrl || "http://127.0.0.1:18889").replace(
    /\/+$/,
    ""
  );
  opener(`${base}/setup`, "_blank", "noopener,noreferrer");
}

export async function initMoltMatrix({
  molt = Molt,
  reconnectAfterInit = false,
} = {}) {
  try {
    const result = await molt.matrixInit();
    if (!result?.success || !reconnectAfterInit) return result;
    const reconnect = await molt.reconnect();
    return { ...result, reconnect };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export function ReconnectControl({
  isLoading = false,
  result = null,
  onReconnect = () => {},
  t,
}) {
  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        disabled={isLoading}
        onClick={onReconnect}
        className="rounded-md border border-theme-sidebar-border px-3 py-2 text-xs font-medium text-theme-text-primary hover:bg-theme-action-menu-item-hover disabled:opacity-60"
      >
        {isLoading
          ? t("molt.console.reconnect.loading")
          : t("molt.console.reconnect.button")}
      </button>
      {result?.success === true && (
        <p className="text-xs text-green-600">
          {t("molt.console.reconnect.success")}
        </p>
      )}
      {result?.success === false && (
        <div className="max-w-[220px] text-right text-xs text-red-600">
          <p>{t("molt.console.reconnect.failed")}</p>
          {result.error && <p className="break-words">{result.error}</p>}
        </div>
      )}
    </div>
  );
}

export function MatrixInitCard({
  status = {},
  initResult = null,
  isInitializing = false,
  onDashboardOpen = () => {},
  onMatrixInit = () => {},
  t,
}) {
  if (
    status?.matrixState !== "uninitialized" ||
    Number(status?.agentCount || 0) !== 0
  ) {
    return null;
  }

  const hasAdminToken = status?.hasAdminToken === true;
  const unauthorized =
    initResult?.status === 401 ||
    initResult?.code === "MOLT_MATRIX_INIT_UNAUTHORIZED";

  return (
    <Section title={t("molt.console.matrix_init.title")}>
      <div className="rounded-md border border-yellow-500/30 bg-yellow-500/10 p-4">
        <p className="text-sm text-theme-text-primary">
          {t("molt.console.matrix_init.subtitle")}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onDashboardOpen}
            className="rounded-md border border-theme-sidebar-border px-3 py-2 text-sm font-medium text-theme-text-primary hover:bg-theme-action-menu-item-hover"
          >
            {t("molt.console.matrix_init.dashboard_button")}
          </button>
          <button
            type="button"
            disabled={!hasAdminToken || isInitializing}
            onClick={onMatrixInit}
            className="rounded-md border border-theme-sidebar-border px-3 py-2 text-sm font-medium text-theme-text-primary hover:bg-theme-action-menu-item-hover disabled:opacity-60"
          >
            {isInitializing
              ? t("molt.console.matrix_init.loading")
              : t("molt.console.matrix_init.one_click_button")}
          </button>
        </div>
        {!hasAdminToken && (
          <p className="mt-3 text-xs text-theme-text-secondary">
            {t("molt.console.matrix_init.no_admin_token_hint")}
          </p>
        )}
        {initResult?.success === true && (
          <p className="mt-3 text-sm text-green-600">
            {t("molt.console.matrix_init.success")}
          </p>
        )}
        {initResult?.success === false && (
          <div className="mt-3 text-sm text-red-600">
            <p>
              {unauthorized
                ? t("molt.console.matrix_init.error_401")
                : t("molt.console.matrix_init.error_generic")}
            </p>
            {initResult.error && (
              <p className="mt-1 break-words">{initResult.error}</p>
            )}
            {initResult.hint && (
              <p className="mt-1 break-words">{initResult.hint}</p>
            )}
          </div>
        )}
      </div>
    </Section>
  );
}

export function KMFilesSection({
  agents = [],
  kmStatus = null,
  kmError = null,
  isLoading = false,
  filename = "",
  content = "",
  selectedAgentId = "",
  uploadResult = null,
  t,
}) {
  const [filenameValue, setFilenameValue] = useState(filename);
  const [contentValue, setContentValue] = useState(content);
  const [agentValue, setAgentValue] = useState(selectedAgentId);
  const [result, setResult] = useState(uploadResult);
  const [isUploading, setIsUploading] = useState(false);
  const normalized = normalizeKmStatus(kmStatus);
  const submitEnabled = canSubmitTextUpload({
    filename: filenameValue,
    content: contentValue,
    agentId: agentValue,
  });
  const capabilities = normalized.capabilities
    .map(capabilityLabel)
    .filter(Boolean);

  async function handleUpload(event) {
    event.preventDefault();
    if (!submitEnabled || isUploading) return;

    setIsUploading(true);
    const upload = await uploadTextToMolt({
      filename: filenameValue,
      content: contentValue,
      agentId: agentValue,
    });
    setResult(upload);
    setIsUploading(false);
  }

  return (
    <Section title={t("molt.console.km.section_title")}>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="rounded-md border border-theme-sidebar-border bg-theme-bg-secondary p-4">
          <p className="text-sm font-semibold text-theme-text-primary">
            KM Status
          </p>
          {isLoading && (
            <p className="mt-3 text-sm text-theme-text-secondary">
              {t("molt.console.km.status.loading")}
            </p>
          )}
          {!isLoading && (kmError || normalized.error) && (
            <div className="mt-3 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600">
              <p className="font-medium">{t("molt.console.km.status.error")}</p>
              <p className="mt-1 break-words">{kmError || normalized.error}</p>
            </div>
          )}
          {!isLoading && !kmError && !normalized.error && (
            <div className="mt-3 space-y-3">
              <span
                className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${
                  normalized.state === "configured"
                    ? "bg-green-500/10 text-green-600"
                    : normalized.state === "disabled"
                      ? "bg-red-500/10 text-red-600"
                      : "bg-yellow-500/10 text-yellow-600"
                }`}
              >
                {t(`molt.console.km.status.${normalized.state}`)}
              </span>
              {normalized.version && (
                <KeyValue label="Version" value={normalized.version} />
              )}
              {capabilities.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {capabilities.map((capability) => (
                    <span
                      key={capability}
                      className="rounded-full bg-theme-bg-primary px-3 py-1 text-xs text-theme-text-secondary"
                    >
                      {capability}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-theme-text-secondary">
                  {t("molt.console.km.status.no_data")}
                </p>
              )}
            </div>
          )}
        </div>

        <form
          onSubmit={handleUpload}
          className="rounded-md border border-theme-sidebar-border bg-theme-bg-secondary p-4"
        >
          <p className="text-sm font-semibold text-theme-text-primary">
            {t("molt.console.files.section_title")}
          </p>
          <label className="mt-4 block text-xs font-medium text-theme-text-secondary">
            {t("molt.console.files.filename_label")}
          </label>
          <input
            type="text"
            value={filenameValue}
            onChange={(event) => setFilenameValue(event.target.value)}
            className="mt-1 w-full rounded-md border border-theme-sidebar-border bg-theme-bg-primary px-3 py-2 text-sm text-theme-text-primary"
          />

          <label className="mt-4 block text-xs font-medium text-theme-text-secondary">
            {t("molt.console.files.agent_label")}
          </label>
          <select
            value={agentValue}
            onChange={(event) => setAgentValue(event.target.value)}
            className="mt-1 w-full rounded-md border border-theme-sidebar-border bg-theme-bg-primary px-3 py-2 text-sm text-theme-text-primary"
          >
            <option value="">
              {t("molt.console.files.agent_placeholder")}
            </option>
            {agents.map((agent) => {
              const id = agentId(agent);
              return (
                <option key={id} value={id}>
                  {agentName(agent)}
                </option>
              );
            })}
          </select>

          <label className="mt-4 block text-xs font-medium text-theme-text-secondary">
            {t("molt.console.files.content_label")}
          </label>
          <textarea
            value={contentValue}
            onChange={(event) => setContentValue(event.target.value)}
            className="mt-1 min-h-[200px] w-full resize-y rounded-md border border-theme-sidebar-border bg-theme-bg-primary px-3 py-2 text-sm text-theme-text-primary"
          />

          {!submitEnabled && (
            <p className="mt-2 text-xs text-theme-text-secondary">
              {t("molt.console.files.validation_required")}
            </p>
          )}

          {result?.success === true && (
            <p className="mt-3 rounded-md border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-600">
              {t("molt.console.files.success")}
            </p>
          )}
          {result?.success === false && !result.validation && (
            <div className="mt-3 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600">
              <p>{t("molt.console.files.error_generic")}</p>
              {result.error && (
                <p className="mt-1 break-words">{result.error}</p>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={!submitEnabled || isUploading}
            className="mt-4 rounded-md border border-theme-sidebar-border px-3 py-2 text-sm font-medium text-theme-text-primary hover:bg-theme-action-menu-item-hover disabled:opacity-60"
          >
            {isUploading
              ? t("molt.console.files.loading")
              : t("molt.console.files.upload")}
          </button>
        </form>
      </div>
    </Section>
  );
}

export function AgentsSection({
  agents = [],
  connectionState = "UNKNOWN",
  error = null,
  isLoading = false,
  onAttachAgent = null,
  onSelectAgent = null,
  selectedAgentId = null,
  t,
}) {
  return (
    <Section
      title={
        <span className="flex flex-wrap items-center gap-2">
          <span>{t("molt.console.agents.title")}</span>
          <span
            className={`rounded-full px-2 py-1 text-xs font-medium ${statusTone(
              connectionState
            )}`}
          >
            {connectionState || "UNKNOWN"}
          </span>
        </span>
      }
    >
      {isLoading && (
        <p className="text-sm text-theme-text-secondary">
          {t("molt.console.agents.loading")}
        </p>
      )}

      {!isLoading && error && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600">
          <p className="font-medium">{t("molt.console.agents.fetch_error")}</p>
          <p className="mt-1 break-words">{error}</p>
        </div>
      )}

      {!isLoading && !error && agents.length === 0 && (
        <div className="rounded-md border border-theme-sidebar-border bg-theme-bg-secondary p-4">
          <p className="text-sm font-medium text-theme-text-primary">
            {t("molt.console.agents.empty")}
          </p>
          <p className="mt-1 text-sm text-theme-text-secondary">
            {t("molt.console.agents.empty_hint")}
          </p>
        </div>
      )}

      {!isLoading && !error && agents.length > 0 && (
        <div className="grid grid-cols-1 gap-3">
          {agents.map((agent) => {
            const capabilities = agentCapabilities(agent)
              .map(capabilityLabel)
              .filter(Boolean);
            const id = agent?.id || agent?.agentId || agentName(agent);
            const status = String(agentStatus(agent) || "unknown");

            return (
              <div
                key={id}
                className="rounded-md border border-theme-sidebar-border bg-theme-bg-secondary p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-theme-text-primary">
                      {agentName(agent)}
                    </p>
                    <p className="mt-1 font-mono text-xs text-theme-text-secondary">
                      {id}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-medium ${statusTone(
                      status.toUpperCase()
                    )}`}
                  >
                    {status}
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {capabilities.map((capability) => (
                    <span
                      key={capability}
                      className="rounded-full bg-theme-bg-primary px-3 py-1 text-xs text-theme-text-secondary"
                    >
                      {capability}
                    </span>
                  ))}
                </div>

                <div className="mt-4 flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      onAttachAgent?.({
                        id,
                        name: agentName(agent),
                      })
                    }
                    className="rounded-md border border-theme-sidebar-border px-3 py-1.5 text-xs font-medium text-theme-text-primary hover:bg-theme-action-menu-item-hover"
                  >
                    {t("molt.console.agents.attach_action")}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onSelectAgent?.({
                        id,
                        name: agentName(agent),
                      })
                    }
                    className="rounded-md border border-theme-sidebar-border px-3 py-1.5 text-xs font-medium text-theme-text-primary hover:bg-theme-action-menu-item-hover"
                  >
                    {t("molt.console.agents.chat_action")}
                  </button>
                </div>

                {selectedAgentId === id && (
                  <MoltAgentChatPanel
                    agentId={id}
                    agentName={agentName(agent)}
                    onClose={() => onSelectAgent?.(null)}
                    t={t}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
}

export default function SgaSettings() {
  const { t } = useTranslation();
  const [payload, setPayload] = useState(emptyPayload);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [agentsError, setAgentsError] = useState(null);
  const [kmError, setKmError] = useState(null);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [reconnectResult, setReconnectResult] = useState(null);
  const [isInitializingMatrix, setIsInitializingMatrix] = useState(false);
  const [matrixInitResult, setMatrixInitResult] = useState(null);
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [attachAgent, setAttachAgent] = useState(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setAgentsError(null);
    setKmError(null);
    const [status, capability, missionStatus, archetypes, agents, kmStatus] =
      await Promise.all([
        Molt.status(),
        Molt.capability(),
        Molt.missionStatus(),
        Molt.archetypes(),
        Molt.agents(),
        Molt.kmStatus(),
      ]);

    setPayload({
      status,
      capability: capability?.capability || null,
      missionStatus: missionStatus?.status || null,
      archetypes: asArray(archetypes?.archetypes),
      agents: asArray(agents?.agents),
      kmStatus,
    });
    if (status?.success === false) setError(status.error || "Molt unavailable");
    if (agents?.success === false)
      setAgentsError(agents.error || "Molt agents unavailable");
    if (kmStatus?.success === false)
      setKmError(kmStatus.error || "Molt KM unavailable");
    setIsLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleReconnect = useCallback(async () => {
    if (isReconnecting) return;
    setIsReconnecting(true);
    const result = await reconnectMolt();
    setReconnectResult(result);
    if (result?.success) {
      setPayload((prev) => ({
        ...prev,
        status: {
          ...prev.status,
          state: result.state,
          lastCheckedAt: result.lastCheckedAt,
          version: result.version,
          capabilities: result.capabilities,
          error: result.error,
        },
      }));
    }
    setIsReconnecting(false);
  }, [isReconnecting]);

  const handleMatrixInit = useCallback(async () => {
    if (isInitializingMatrix) return;
    setIsInitializingMatrix(true);
    const result = await initMoltMatrix({ reconnectAfterInit: true });
    setMatrixInitResult(result);
    if (result?.success) {
      if (result.reconnect?.success) {
        setPayload((prev) => ({
          ...prev,
          status: {
            ...prev.status,
            state: result.reconnect.state,
            lastCheckedAt: result.reconnect.lastCheckedAt,
            version: result.reconnect.version,
            capabilities: result.reconnect.capabilities,
            matrixState: result.reconnect.matrixState,
            agentCount: result.reconnect.agentCount,
            error: result.reconnect.error,
          },
        }));
      }
      await load();
    }
    setIsInitializingMatrix(false);
  }, [isInitializingMatrix, load]);

  const summary = useMemo(() => {
    const capability = payload.capability || {};
    const catalog = capability.catalog || {};
    const state = capability.state || {};
    const km = state.km || {};
    const plugins = state.plugins || {};
    const matrix = payload.missionStatus || {};

    return {
      tools: asArray(catalog.tools),
      pluginsLoaded: asArray(plugins.loaded).length,
      pluginsDisabled: asArray(plugins.disabled).length,
      kmConfigured: km.configured === true ? "Configured" : "Not configured",
      matrixState: payload.status?.matrixState || matrix.state || "Unknown",
      matrixAgentId: matrix.matrixAgent?.id || matrix.agentId || "-",
      lifecycle: matrix.lifecycle || matrix.counts || {},
    };
  }, [payload]);

  return (
    <div className="w-screen h-screen overflow-hidden bg-page-texture flex">
      <Sidebar />
      <div
        style={{ height: isMobile ? "100%" : "calc(100% - 32px)" }}
        className="relative z-[1] md:ml-[2px] md:mr-[16px] md:my-[16px] md:rounded-[16px] bg-theme-bg-secondary w-full h-full overflow-y-scroll p-4 md:p-0"
      >
        <div className="flex flex-col w-full px-1 md:pl-6 md:pr-[50px] md:py-6 py-16">
          <div className="w-full flex flex-col gap-y-1 pb-6 border-theme-border border-b-2">
            <div className="items-center justify-between flex gap-x-4">
              <div>
                <p className="text-lg leading-6 font-bold text-theme-text-primary">
                  SGA-Molt 控制台
                </p>
                <p className="text-xs leading-[18px] font-base text-theme-text-secondary">
                  Native Molt connection status, capability snapshot, and
                  Mission Control visibility.
                </p>
              </div>
              <button
                type="button"
                onClick={load}
                disabled={isLoading}
                className="rounded-md border border-theme-sidebar-border px-3 py-2 text-sm font-medium text-theme-text-primary hover:bg-theme-action-menu-item-hover disabled:opacity-60"
              >
                {isLoading ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </div>

          {error && (
            <div className="mt-6 rounded-md border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-600">
              {error}
            </div>
          )}

          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Stat
              label="Connection"
              value={
                <span
                  className={`rounded-full px-2 py-1 text-sm ${statusTone(
                    payload.status?.state
                  )}`}
                >
                  {payload.status?.state || "UNKNOWN"}
                </span>
              }
            />
            <Stat label="Matrix" value={summary.matrixState} />
            <Stat label="Molt tools" value={summary.tools.length} />
            <Stat label="Archetypes" value={payload.archetypes.length} />
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Section
              title={
                <span className="flex flex-wrap items-center justify-between gap-3">
                  <span>Connection</span>
                  <ReconnectControl
                    isLoading={isReconnecting}
                    result={reconnectResult}
                    onReconnect={handleReconnect}
                    t={t}
                  />
                </span>
              }
            >
              <KeyValue label="Version" value={payload.status?.version} />
              <KeyValue
                label="Last checked"
                value={formatDate(payload.status?.lastCheckedAt)}
              />
              <KeyValue label="Error" value={payload.status?.error || "None"} />
            </Section>

            <Section title="Mission Control">
              <KeyValue label="Matrix agent" value={summary.matrixAgentId} />
              <KeyValue
                label="Lifecycle totals"
                value={Object.entries(summary.lifecycle)
                  .map(([key, value]) => `${key}: ${value}`)
                  .join(", ")}
              />
              <KeyValue
                label="Raw state"
                value={payload.missionStatus?.state || "Unknown"}
              />
            </Section>

            <Section title="Capability Snapshot">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <Stat label="KM" value={summary.kmConfigured} />
                <Stat label="Plugins loaded" value={summary.pluginsLoaded} />
                <Stat
                  label="Plugins disabled"
                  value={summary.pluginsDisabled}
                />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {summary.tools.slice(0, 12).map((tool) => (
                  <span
                    key={tool.toolId || tool.name}
                    className="rounded-full bg-theme-bg-secondary px-3 py-1 text-xs text-theme-text-secondary"
                  >
                    {tool.toolId || tool.name}
                  </span>
                ))}
                {summary.tools.length === 0 && (
                  <p className="text-sm text-theme-text-secondary">
                    No tools reported yet.
                  </p>
                )}
              </div>
            </Section>

            <Section title="Archetypes">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {payload.archetypes.map((archetype) => (
                  <div
                    key={archetype.id || archetype.name}
                    className="rounded-md border border-theme-sidebar-border p-3"
                  >
                    <p className="text-sm font-medium text-theme-text-primary">
                      {archetype.label || archetype.name || archetype.id}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-theme-text-secondary">
                      {archetype.summary ||
                        archetype.description ||
                        archetype.id ||
                        "No description"}
                    </p>
                  </div>
                ))}
                {payload.archetypes.length === 0 && (
                  <p className="text-sm text-theme-text-secondary">
                    No archetypes reported yet.
                  </p>
                )}
              </div>
            </Section>

            <MatrixInitCard
              status={payload.status}
              initResult={matrixInitResult}
              isInitializing={isInitializingMatrix}
              onDashboardOpen={() =>
                openMoltDashboard({
                  dashboardUrl: payload.status?.dashboardUrl,
                })
              }
              onMatrixInit={handleMatrixInit}
              t={t}
            />

            <AgentsSection
              agents={payload.agents}
              connectionState={payload.status?.state || "UNKNOWN"}
              error={agentsError}
              isLoading={isLoading}
              onAttachAgent={setAttachAgent}
              onSelectAgent={setSelectedAgent}
              selectedAgentId={selectedAgent?.id}
              t={t}
            />

            <KMFilesSection
              agents={payload.agents}
              kmStatus={payload.kmStatus}
              kmError={kmError}
              isLoading={isLoading}
              t={t}
            />
          </div>
        </div>
      </div>
      <AttachToWorkspaceModal
        agent={attachAgent}
        isOpen={!!attachAgent}
        onClose={() => setAttachAgent(null)}
        onSuccess={() => {}}
        t={t}
      />
    </div>
  );
}
