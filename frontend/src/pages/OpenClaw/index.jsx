import { useCallback, useEffect, useRef, useState } from "react";
import Button from "@/components/Button";
import Sidebar from "@/components/SettingsSidebar";
import StatusBadge from "@/components/StatusBadge";
import { isMobile } from "react-device-detect";
import showToast from "@/utils/toast";
import OpenClaw from "@/models/openClaw";
import { CHANNEL_PLATFORM_LABELS } from "@/utils/channelPlatformLabels";
import {
  ArrowsClockwise,
  Play,
  Stop,
  ArrowsCounterClockwise,
  ArrowSquareOut,
  Warning,
} from "@phosphor-icons/react";

const POLL_INTERVAL_MS = 5000;
const INITIAL_CONFIG_FORM = {
  provider: "",
  model: "",
  apiKey: "",
  apiBase: "",
};

function EnvAlert({ label, downloadUrl }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 backdrop-blur-sm">
      <Warning className="h-4 w-4 text-amber-300 shrink-0" />
      <div className="flex-1 text-sm text-amber-200">
        <span>{label}</span>
        {downloadUrl && (
          <a
            href={downloadUrl}
            target="_blank"
            rel="noreferrer"
            className="ml-2 underline text-amber-300 hover:opacity-90"
          >
            下载
          </a>
        )}
      </div>
    </div>
  );
}

function SectionCard({ title, description, children }) {
  return (
    <div className="rounded-xl border border-theme-sidebar-border bg-theme-bg-primary p-5 shadow-lg shadow-black/30">
      <div className="mb-4">
        <p className="text-sm font-semibold text-theme-text-primary">{title}</p>
        {description ? (
          <p className="text-xs text-theme-text-secondary mt-1">
            {description}
          </p>
        ) : null}
      </div>
      {children}
    </div>
  );
}

export default function OpenClawPage() {
  const [loading, setLoading] = useState(true);
  const [installed, setInstalled] = useState(false);
  const [installMode, setInstallMode] = useState(null);
  const [installPath, setInstallPath] = useState("");
  const [gatewayStatus, setGatewayStatus] = useState("stopped");
  const [gatewayPort, setGatewayPort] = useState("18790");
  const [nodeCheck, setNodeCheck] = useState(null);
  const [gitCheck, setGitCheck] = useState(null);
  const [nodeDownloadUrl, setNodeDownloadUrl] = useState("");
  const [gitDownloadUrl, setGitDownloadUrl] = useState("");
  const [actionLoading, setActionLoading] = useState(null);
  const [dashboardUrl, setDashboardUrl] = useState(null);
  const [portOccupied, setPortOccupied] = useState(false);
  const [configSummary, setConfigSummary] = useState(null);
  const [configForm, setConfigForm] = useState(INITIAL_CONFIG_FORM);
  const [savingConfig, setSavingConfig] = useState(false);
  const pollRef = useRef(null);

  const loadConfigSummary = useCallback(async () => {
    const configRes = await OpenClaw.getConfig();
    if (configRes.success) {
      setConfigSummary(configRes.config || null);
      setConfigForm((current) => ({
        ...current,
        provider: configRes.config?.provider || "",
        model: configRes.config?.model || "",
        apiBase: configRes.config?.apiBase || "",
      }));
      if (configRes.config?.port) {
        setGatewayPort(String(configRes.config.port));
      }
    }
  }, []);

  const refreshStatus = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    const [installedRes, statusRes] = await Promise.all([
      OpenClaw.checkInstalled(),
      OpenClaw.getStatus(),
    ]);

    setInstalled(installedRes.installed ?? false);
    setInstallMode(installedRes.mode || null);
    setInstallPath(installedRes.path || "");

    if (statusRes.status) setGatewayStatus(statusRes.status);
    if (statusRes.port) setGatewayPort(String(statusRes.port));
    setPortOccupied(statusRes.portOccupied ?? false);

    if (statusRes.status === "running") {
      const urlRes = await OpenClaw.getDashboardUrl();
      if (urlRes.url) setDashboardUrl(urlRes.url);
    } else {
      setDashboardUrl(null);
    }

    if (!silent) setLoading(false);
  }, []);

  useEffect(() => {
    async function init() {
      setLoading(true);
      const [
        installedRes,
        statusRes,
        nodeRes,
        gitRes,
        nodeDlRes,
        gitDlRes,
        configRes,
      ] = await Promise.all([
        OpenClaw.checkInstalled(),
        OpenClaw.getStatus(),
        OpenClaw.checkNodeVersion(),
        OpenClaw.checkGit(),
        OpenClaw.getNodeDownloadUrl(),
        OpenClaw.getGitDownloadUrl(),
        OpenClaw.getConfig(),
      ]);

      setInstalled(installedRes.installed ?? false);
      setInstallMode(installedRes.mode || null);
      setInstallPath(installedRes.path || "");
      if (statusRes.status) setGatewayStatus(statusRes.status);
      if (statusRes.port) setGatewayPort(String(statusRes.port));
      setPortOccupied(statusRes.portOccupied ?? false);
      setNodeCheck(nodeRes);
      setGitCheck(gitRes);
      setNodeDownloadUrl(nodeDlRes.url || "");
      setGitDownloadUrl(gitDlRes.url || "");

      if (configRes.success) {
        setConfigSummary(configRes.config || null);
        setConfigForm((current) => ({
          ...current,
          provider: configRes.config?.provider || "",
          model: configRes.config?.model || "",
          apiBase: configRes.config?.apiBase || "",
        }));
        if (configRes.config?.port && !statusRes.port) {
          setGatewayPort(String(configRes.config.port));
        }
      }

      if (statusRes.status === "running") {
        const urlRes = await OpenClaw.getDashboardUrl();
        if (urlRes.url) setDashboardUrl(urlRes.url);
      }

      setLoading(false);
    }

    init();
  }, []);

  useEffect(() => {
    pollRef.current = setInterval(
      () => refreshStatus({ silent: true }),
      POLL_INTERVAL_MS
    );
    return () => clearInterval(pollRef.current);
  }, [refreshStatus]);

  async function handleStart() {
    const port = Number(gatewayPort) || 18790;
    setActionLoading("starting");
    const res = await OpenClaw.startGateway(port);
    if (res.success) {
      setGatewayStatus("running");
      showToast("Gateway 已启动", "success");
      await Promise.all([refreshStatus({ silent: true }), loadConfigSummary()]);
      const urlRes = await OpenClaw.getDashboardUrl();
      if (urlRes.url) setDashboardUrl(urlRes.url);
    } else {
      showToast(res.message || "启动失败", "error");
      setGatewayStatus("error");
    }
    setActionLoading(null);
  }

  async function handleStop() {
    setActionLoading("stopping");
    const res = await OpenClaw.stopGateway();
    if (res.success) {
      setGatewayStatus("stopped");
      setDashboardUrl(null);
      showToast("Gateway 已停止", "success");
    } else {
      showToast(res.message || "停止失败", "error");
    }
    setActionLoading(null);
  }

  async function handleRestart() {
    setActionLoading("restarting");
    const res = await OpenClaw.restartGateway();
    if (res.success) {
      setGatewayStatus("running");
      showToast("Gateway 已重启", "success");
      await Promise.all([refreshStatus({ silent: true }), loadConfigSummary()]);
      const urlRes = await OpenClaw.getDashboardUrl();
      if (urlRes.url) setDashboardUrl(urlRes.url);
    } else {
      showToast(res.message || "重启失败", "error");
      setGatewayStatus("error");
    }
    setActionLoading(null);
  }

  async function handleSaveConfig(event) {
    event.preventDefault();
    const provider = configForm.provider.trim();
    const model = configForm.model.trim();

    if (!provider || !model) {
      showToast("请至少填写 provider 和 model", "error");
      return;
    }

    setSavingConfig(true);
    const res = await OpenClaw.syncConfig(
      provider,
      model,
      configForm.apiKey.trim(),
      configForm.apiBase.trim()
    );

    if (res.success) {
      showToast("Gateway 配置已保存", "success");
      setConfigForm((current) => ({
        ...current,
        apiKey: "",
      }));
      await loadConfigSummary();
      if (gatewayStatus === "running") {
        const urlRes = await OpenClaw.getDashboardUrl();
        if (urlRes.url) setDashboardUrl(urlRes.url);
      }
    } else {
      showToast(res.error || "保存 Gateway 配置失败", "error");
    }
    setSavingConfig(false);
  }

  const envOk = nodeCheck?.status === "ok";
  const configReady = Boolean(
    (configSummary?.provider || configForm.provider.trim()) &&
    (configSummary?.model || configForm.model.trim()) &&
    (configSummary?.hasApiKey || configForm.apiKey.trim())
  );

  return (
    <div className="w-screen h-screen overflow-hidden bg-page-texture flex">
      <Sidebar />
      <div
        style={{ height: isMobile ? "100%" : "calc(100% - 32px)" }}
        className="relative z-[1] md:ml-[2px] md:mr-[16px] md:my-[16px] md:rounded-[16px] bg-theme-bg-secondary w-full h-full overflow-y-scroll p-4 md:p-0"
      >
        <div className="flex flex-col w-full px-1 md:pl-6 md:pr-[50px] md:py-6 py-16 gap-6">
          <div className="w-full flex flex-col gap-y-1 pb-6 border-theme-border border-b-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-lg leading-6 font-bold text-theme-text-primary">
                  {CHANNEL_PLATFORM_LABELS.runtimeOps}
                </p>
                <p className="text-xs text-theme-text-secondary mt-1">
                  管理渠道运行时的安装探测、进程启停和 LLM 配置。
                </p>
              </div>
              <Button
                variant="secondary"
                onClick={() =>
                  Promise.all([refreshStatus(), loadConfigSummary()]).catch(
                    () => {}
                  )
                }
                disabled={loading}
              >
                {!loading && <ArrowsClockwise className="h-4 w-4" />}
                刷新
              </Button>
            </div>
          </div>

          {loading ? (
            <div className="text-sm text-theme-text-secondary">
              正在检查 Gateway 状态…
            </div>
          ) : (
            <>
              {nodeCheck?.status !== "ok" && (
                <EnvAlert
                  label={
                    nodeCheck?.status === "not_found"
                      ? "未检测到 Node.js（需要 v22+）"
                      : `Node.js 版本过低（当前 ${nodeCheck?.version}，需要 v22+）`
                  }
                  downloadUrl={nodeDownloadUrl}
                />
              )}
              {gitCheck?.available === false && (
                <EnvAlert label="未检测到 Git" downloadUrl={gitDownloadUrl} />
              )}
              {portOccupied && (
                <EnvAlert
                  label={`端口 ${gatewayPort} 已被其他进程占用，无法启动 Gateway。请先释放该端口或更换端口。`}
                />
              )}
              {!configReady && (
                <EnvAlert label="尚未保存完整的 LLM 配置。即使 Gateway 启动，Dashboard 也无法完成实际推理调用。" />
              )}

              <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                <SectionCard
                  title="Gateway 安装状态"
                  description="自动探测本地仓库或全局安装的 alata-im-gateway。"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm text-theme-text-primary">
                        {installed
                          ? "alata-im-gateway 已就绪"
                          : "未检测到可用的 Gateway CLI"}
                      </p>
                      <p className="text-xs text-theme-text-secondary mt-1 break-all">
                        {installPath || "可执行文件未找到"}
                      </p>
                    </div>
                    <StatusBadge value={installed ? "running" : "stopped"} />
                  </div>
                  {!installed && (
                    <div className="mt-3 text-xs text-theme-text-secondary">
                      在终端运行：
                      <code className="ml-1 bg-theme-bg-secondary px-2 py-0.5 rounded">
                        npm install -g alata-im-gateway
                      </code>
                    </div>
                  )}
                  {installed && (
                    <p className="mt-3 text-xs text-theme-text-secondary">
                      来源：
                      {installMode === "local"
                        ? "当前仓库本地入口"
                        : "全局安装"}
                    </p>
                  )}
                </SectionCard>

                <SectionCard
                  title="当前配置"
                  description="保存给 Gateway 的默认推理配置。"
                >
                  <div className="space-y-2 text-sm text-theme-text-secondary">
                    <div>
                      Provider：
                      <span className="text-theme-text-primary ml-1">
                        {configSummary?.provider || "未配置"}
                      </span>
                    </div>
                    <div>
                      Model：
                      <span className="text-theme-text-primary ml-1">
                        {configSummary?.model || "未配置"}
                      </span>
                    </div>
                    <div>
                      API Key：
                      <span className="text-theme-text-primary ml-1">
                        {configSummary?.hasApiKey ? "已保存" : "未保存"}
                      </span>
                    </div>
                    <div>
                      Port：
                      <span className="text-theme-text-primary ml-1">
                        {configSummary?.port || gatewayPort}
                      </span>
                    </div>
                  </div>
                </SectionCard>

                <SectionCard
                  title="Gateway 进程"
                  description="进程状态、端口与 Dashboard 入口。"
                >
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className="text-sm text-theme-text-primary">
                        当前端口：{gatewayPort}
                      </p>
                      <p className="text-xs text-theme-text-secondary mt-1">
                        状态：{gatewayStatus}
                      </p>
                    </div>
                    <StatusBadge value={gatewayStatus} />
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {gatewayStatus !== "running" && (
                      <Button
                        variant="primary"
                        onClick={handleStart}
                        disabled={
                          !installed || !envOk || actionLoading !== null
                        }
                      >
                        {actionLoading !== "starting" && (
                          <Play className="h-4 w-4" weight="fill" />
                        )}
                        {actionLoading === "starting"
                          ? "启动中…"
                          : "启动 Gateway"}
                      </Button>
                    )}
                    {gatewayStatus === "running" && (
                      <>
                        <Button
                          variant="danger"
                          onClick={handleStop}
                          disabled={actionLoading !== null}
                        >
                          {actionLoading !== "stopping" && (
                            <Stop className="h-4 w-4" weight="fill" />
                          )}
                          {actionLoading === "stopping"
                            ? "停止中…"
                            : "停止 Gateway"}
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={handleRestart}
                          disabled={actionLoading !== null}
                        >
                          {actionLoading !== "restarting" && (
                            <ArrowsCounterClockwise className="h-4 w-4" />
                          )}
                          {actionLoading === "restarting" ? "重启中…" : "重启"}
                        </Button>
                        {dashboardUrl && (
                          <Button
                            as="a"
                            href={dashboardUrl}
                            target="_blank"
                            rel="noreferrer"
                            variant="ghost"
                          >
                            <ArrowSquareOut className="h-4 w-4" />
                            打开 Dashboard
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </SectionCard>
              </div>

              <SectionCard
                title="Gateway 配置"
                description="保存 OpenClaw / Gateway 使用的默认推理供应商与模型。API Key 不会回显；如需替换请重新输入。"
              >
                <form
                  onSubmit={handleSaveConfig}
                  className="grid grid-cols-1 md:grid-cols-2 gap-3"
                >
                  <label className="flex flex-col gap-2 text-sm text-theme-text-secondary">
                    Provider
                    <input
                      value={configForm.provider}
                      onChange={(event) =>
                        setConfigForm((current) => ({
                          ...current,
                          provider: event.target.value,
                        }))
                      }
                      placeholder="例如 openai / deepseek / azure"
                      className="rounded-lg border border-theme-sidebar-border bg-theme-settings-input-bg px-3 py-2 text-sm text-theme-text-primary"
                    />
                  </label>
                  <label className="flex flex-col gap-2 text-sm text-theme-text-secondary">
                    Model
                    <input
                      value={configForm.model}
                      onChange={(event) =>
                        setConfigForm((current) => ({
                          ...current,
                          model: event.target.value,
                        }))
                      }
                      placeholder="例如 gpt-4o-mini"
                      className="rounded-lg border border-theme-sidebar-border bg-theme-settings-input-bg px-3 py-2 text-sm text-theme-text-primary"
                    />
                  </label>
                  <label className="flex flex-col gap-2 text-sm text-theme-text-secondary">
                    API Key
                    <input
                      type="password"
                      value={configForm.apiKey}
                      onChange={(event) =>
                        setConfigForm((current) => ({
                          ...current,
                          apiKey: event.target.value,
                        }))
                      }
                      placeholder={
                        configSummary?.hasApiKey
                          ? "已保存，如需替换请重新输入"
                          : "输入新的 API Key"
                      }
                      className="rounded-lg border border-theme-sidebar-border bg-theme-settings-input-bg px-3 py-2 text-sm text-theme-text-primary"
                    />
                  </label>
                  <label className="flex flex-col gap-2 text-sm text-theme-text-secondary">
                    API Base
                    <input
                      value={configForm.apiBase}
                      onChange={(event) =>
                        setConfigForm((current) => ({
                          ...current,
                          apiBase: event.target.value,
                        }))
                      }
                      placeholder="可选，自定义兼容网关地址"
                      className="rounded-lg border border-theme-sidebar-border bg-theme-settings-input-bg px-3 py-2 text-sm text-theme-text-primary"
                    />
                  </label>
                  <label className="flex flex-col gap-2 text-sm text-theme-text-secondary md:col-span-2">
                    Gateway Port
                    <input
                      type="number"
                      min="1"
                      max="65535"
                      value={gatewayPort}
                      onChange={(event) => setGatewayPort(event.target.value)}
                      className="rounded-lg border border-theme-sidebar-border bg-theme-settings-input-bg px-3 py-2 text-sm text-theme-text-primary"
                    />
                  </label>

                  <div className="md:col-span-2 flex flex-wrap gap-2">
                    <Button
                      type="submit"
                      variant="primary"
                      disabled={savingConfig}
                      loading={savingConfig}
                    >
                      {savingConfig ? "保存中…" : "保存 Gateway 配置"}
                    </Button>
                    {dashboardUrl && (
                      <Button
                        as="a"
                        href={dashboardUrl}
                        target="_blank"
                        rel="noreferrer"
                        variant="secondary"
                      >
                        <ArrowSquareOut className="h-4 w-4" />
                        进入 Dashboard
                      </Button>
                    )}
                  </div>
                </form>
              </SectionCard>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
