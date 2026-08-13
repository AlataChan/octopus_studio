import { useEffect, useState } from "react";
import Button from "@/components/Button";
import Sidebar from "@/components/SettingsSidebar";
import StatusBadge from "@/components/StatusBadge";
import { isMobile } from "react-device-detect";
import showToast from "@/utils/toast";
import ImGateway from "@/models/imGateway";
import Workspace from "@/models/workspace";
import WorkspaceAssistant from "@/models/workspaceAssistant";
import {
  ArrowsClockwise,
  Key,
  PencilSimple,
  Plus,
} from "@phosphor-icons/react";

const INPUT_CLASSNAME =
  "rounded-lg border border-theme-sidebar-border bg-theme-settings-input-bg px-3 py-2 text-sm text-theme-text-primary";

const INITIAL_RUNTIME_FORM = {
  id: "",
  name: "",
  mode: "embedded",
};

const INITIAL_ACCOUNT_FORM = {
  provider: "feishu",
  accountId: "",
  status: "active",
  appId: "",
  appSecret: "",
  verificationToken: "",
  signingSecret: "",
  encryptKey: "",
  corpId: "",
  secret: "",
  agentId: "",
  token: "",
  encodingAESKey: "",
};

const INITIAL_BINDING_FORM = {
  id: "",
  provider: "feishu",
  triggerType: "message",
  accountId: "",
  workspaceId: "",
  assistantId: "",
  peerType: "",
  peerId: "*",
  senderAllowlist: "",
  eventKey: "",
  inputTemplate: "",
  priority: "0",
  requireMention: false,
  permissionMode: "default",
  enabled: true,
};

function SectionCard({ title, description, children, action = null }) {
  return (
    <div className="rounded-xl border border-theme-sidebar-border bg-theme-bg-primary p-5 shadow-lg shadow-black/30">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h3 className="text-sm font-semibold text-theme-text-primary">
            {title}
          </h3>
          {description ? (
            <p className="text-xs text-theme-text-secondary mt-1">
              {description}
            </p>
          ) : null}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function EmptyState({ text }) {
  return (
    <div className="rounded-lg border border-dashed border-theme-sidebar-border px-4 py-6 text-sm text-theme-text-secondary text-center">
      {text}
    </div>
  );
}

function Table({ columns = [], rows = [], emptyText = "暂无数据" }) {
  if (!rows.length) return <EmptyState text={emptyText} />;

  return (
    <div className="overflow-x-auto rounded-lg border border-theme-sidebar-border">
      <table className="min-w-full text-sm">
        <thead className="bg-theme-bg-secondary">
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                className="px-4 py-3 text-left font-medium text-theme-text-secondary whitespace-nowrap"
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={row.id || row.key || index}
              className="border-t border-theme-sidebar-border"
            >
              {columns.map((column) => (
                <td
                  key={column.key}
                  className="px-4 py-3 text-theme-text-primary align-top"
                >
                  {column.render
                    ? column.render(row)
                    : (row[column.key] ?? "-")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function parseSenderAllowlist(value = "") {
  return String(value)
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function buildAccountPayload(form) {
  const provider = String(form.provider || "feishu").toLowerCase();
  const accountId =
    form.accountId.trim() ||
    (provider === "feishu" ? form.appId.trim() : form.corpId.trim());

  const secrets =
    provider === "feishu"
      ? (() => {
          const nextSecrets = {
            appId: form.appId.trim(),
            appSecret: form.appSecret.trim(),
            verificationToken: form.verificationToken.trim(),
            encryptKey: form.encryptKey.trim(),
          };

          if (!nextSecrets.verificationToken && form.signingSecret?.trim()) {
            nextSecrets.signingSecret = form.signingSecret.trim();
          }

          return nextSecrets;
        })()
      : {
          corpId: form.corpId.trim(),
          secret: form.secret.trim(),
          agentId: form.agentId.trim(),
          token: form.token.trim(),
          encodingAESKey: form.encodingAESKey.trim(),
        };

  return {
    provider,
    accountId,
    status: form.status,
    tokenExpiresAt: null,
    secrets: Object.fromEntries(
      Object.entries(secrets).filter(([, value]) => Boolean(value))
    ),
  };
}

function hydrateAccountForm(account, secrets = {}) {
  const provider = String(account?.provider || "feishu").toLowerCase();
  return {
    ...INITIAL_ACCOUNT_FORM,
    provider,
    accountId: account?.accountId || "",
    status: account?.status || "active",
    appId: secrets.appId || "",
    appSecret: secrets.appSecret || "",
    verificationToken: secrets.verificationToken || "",
    signingSecret: secrets.signingSecret || "",
    encryptKey: secrets.encryptKey || "",
    corpId: secrets.corpId || "",
    secret: secrets.secret || secrets.corpSecret || "",
    agentId: secrets.agentId || "",
    token: secrets.token || "",
    encodingAESKey: secrets.encodingAESKey || secrets.encodingAesKey || "",
  };
}

export function buildBindingPayload({ mode = "message", form }) {
  const normalizedMode = String(mode || "message");
  const basePayload = {
    id: form.id || null,
    provider: form.provider,
    accountId: form.accountId,
    workspaceId: Number(form.workspaceId),
    priority: Number(form.priority || 0),
    enabled: form.enabled,
  };

  if (normalizedMode === "menu_action") {
    return {
      ...basePayload,
      match: {
        triggerType: "menu_action",
        eventType: "application.bot.menu_v6",
        eventKey: form.eventKey.trim(),
      },
      route: {
        assistantId: form.assistantId.trim(),
        sessionScope: "per-channel-peer",
        inputTemplate: form.inputTemplate.trim(),
      },
      security: {
        permissionMode: form.permissionMode || "default",
      },
    };
  }

  return {
    ...basePayload,
    match: {
      triggerType: "message",
      peerType: form.peerType || null,
      peerId: form.peerId.trim() || "*",
      senderAllowlist: parseSenderAllowlist(form.senderAllowlist),
    },
    route: {
      assistantId: form.assistantId.trim(),
      sessionScope: "per-channel-peer",
    },
    security: {
      requireMention: form.requireMention,
      permissionMode: form.permissionMode || "default",
    },
  };
}

function hydrateBindingForm(binding) {
  const triggerType =
    binding?.match?.triggerType ||
    (binding?.match?.eventKey ? "menu_action" : "message");

  return {
    ...INITIAL_BINDING_FORM,
    id: binding?.id || "",
    provider: binding?.provider || "feishu",
    triggerType,
    accountId: binding?.accountId || "",
    workspaceId: binding?.workspaceId ? String(binding.workspaceId) : "",
    assistantId: binding?.route?.assistantId || binding?.route?.agentId || "",
    peerType: binding?.match?.peerType || "",
    peerId: binding?.match?.peerId || "*",
    senderAllowlist: Array.isArray(binding?.match?.senderAllowlist)
      ? binding.match.senderAllowlist.join("\n")
      : "",
    eventKey: binding?.match?.eventKey || "",
    inputTemplate: binding?.route?.inputTemplate || "",
    priority: String(binding?.priority ?? 0),
    requireMention: binding?.security?.requireMention === true,
    permissionMode: binding?.security?.permissionMode || "default",
    enabled: binding?.enabled !== false,
  };
}

function FindingBadge({ severity = "low" }) {
  const normalized = String(severity || "low").toLowerCase();
  const styles = {
    high: "bg-red-500/15 text-red-300 border-red-500/30",
    medium: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    low: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  };

  return (
    <span
      className={`inline-flex rounded-full border px-2 py-0.5 text-xs ${styles[normalized] || styles.low}`}
    >
      {normalized}
    </span>
  );
}

export default function ImGatewaySettings() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [creatingRuntime, setCreatingRuntime] = useState(false);
  const [savingAccount, setSavingAccount] = useState(false);
  const [savingBinding, setSavingBinding] = useState(false);
  const [rotatingRuntimeId, setRotatingRuntimeId] = useState(null);
  const [runtimeForm, setRuntimeForm] = useState(INITIAL_RUNTIME_FORM);
  const [accountForm, setAccountForm] = useState(INITIAL_ACCOUNT_FORM);
  const [bindingForm, setBindingForm] = useState(INITIAL_BINDING_FORM);
  const [editingAccountKey, setEditingAccountKey] = useState("");
  const [editingBindingId, setEditingBindingId] = useState("");

  const [accounts, setAccounts] = useState([]);
  const [bindings, setBindings] = useState([]);
  const [runtimes, setRuntimes] = useState([]);
  const [health, setHealth] = useState(null);
  const [securityAudit, setSecurityAudit] = useState(null);
  const [oneTimeToken, setOneTimeToken] = useState(null);
  const [configSnapshot, setConfigSnapshot] = useState(null);
  const [loadingSnapshot, setLoadingSnapshot] = useState(false);
  const [snapshotRuntimeId, setSnapshotRuntimeId] = useState(null);
  const [workspaces, setWorkspaces] = useState([]);
  const [workspaceAssistants, setWorkspaceAssistants] = useState([]);

  useEffect(() => {
    loadConsole();
    loadWorkspaces();
  }, []);

  useEffect(() => {
    async function loadAssistantsForWorkspace() {
      if (!bindingForm.workspaceId) {
        setWorkspaceAssistants([]);
        return;
      }

      const selectedWorkspace = workspaces.find(
        (workspace) => String(workspace.id) === String(bindingForm.workspaceId)
      );
      if (!selectedWorkspace?.slug) {
        setWorkspaceAssistants([]);
        return;
      }

      const result = await WorkspaceAssistant.list(selectedWorkspace.slug, {
        bypassCache: true,
      });
      if (result.success) {
        setWorkspaceAssistants(result.data?.assistants || []);
      } else {
        setWorkspaceAssistants([]);
      }
    }

    loadAssistantsForWorkspace();
  }, [bindingForm.workspaceId, workspaces]);

  async function loadWorkspaces() {
    const results = await Workspace.all();
    setWorkspaces(Array.isArray(results) ? results : []);
  }

  async function loadConsole({ silent = false } = {}) {
    if (!silent) setLoading(true);
    else setRefreshing(true);

    const [accountsRes, bindingsRes, runtimesRes, healthRes, auditRes] =
      await Promise.all([
        ImGateway.accounts(),
        ImGateway.bindings(),
        ImGateway.runtimes(),
        ImGateway.health(),
        ImGateway.securityAudit(),
      ]);

    if (accountsRes.success) setAccounts(accountsRes.accounts || []);
    if (bindingsRes.success) setBindings(bindingsRes.bindings || []);
    if (runtimesRes.success) setRuntimes(runtimesRes.runtimes || []);
    if (healthRes.success) setHealth(healthRes.health || null);
    if (auditRes.success) setSecurityAudit(auditRes || null);

    if (
      !accountsRes.success ||
      !bindingsRes.success ||
      !runtimesRes.success ||
      !healthRes.success ||
      !auditRes.success
    ) {
      showToast("加载 IM 网关控制台数据失败", "error");
    }

    setLoading(false);
    setRefreshing(false);
  }

  async function handleCreateRuntime(event) {
    event.preventDefault();
    setCreatingRuntime(true);
    const result = await ImGateway.createRuntime(runtimeForm);

    if (result.success) {
      setOneTimeToken({
        runtimeId: result.runtime?.id,
        bootstrapToken: result.bootstrapToken,
      });
      setRuntimeForm(INITIAL_RUNTIME_FORM);
      showToast("运行时已创建，请立即保存引导令牌。", "success");
      await loadConsole({ silent: true });
    } else {
      showToast(result.error || "创建运行时失败", "error");
    }

    setCreatingRuntime(false);
  }

  async function handleSaveAccount(event) {
    event.preventDefault();
    const payload = buildAccountPayload(accountForm);

    if (!payload.accountId) {
      showToast("请填写账号 ID（或对应平台的主账号标识）", "error");
      return;
    }

    if (payload.provider === "feishu") {
      if (!payload.secrets.appId || !payload.secrets.appSecret) {
        showToast("飞书账号至少需要 appId 和 appSecret", "error");
        return;
      }
    } else if (
      !payload.secrets.corpId ||
      !payload.secrets.secret ||
      !payload.secrets.agentId ||
      !payload.secrets.token ||
      !payload.secrets.encodingAESKey
    ) {
      showToast(
        "企业微信账号需要完整的 corpId/secret/agentId/token/AESKey",
        "error"
      );
      return;
    }

    setSavingAccount(true);
    const result = await ImGateway.upsertAccount(payload);
    if (result.success) {
      showToast(editingAccountKey ? "账号已更新" : "账号已创建", "success");
      setAccountForm(INITIAL_ACCOUNT_FORM);
      setEditingAccountKey("");
      await loadConsole({ silent: true });
    } else {
      showToast(result.error || "保存账号失败", "error");
    }
    setSavingAccount(false);
  }

  async function handleEditAccount(provider, accountId) {
    const result = await ImGateway.account(provider, accountId);
    if (!result.success) {
      showToast(result.error || "加载账号详情失败", "error");
      return;
    }

    setAccountForm(hydrateAccountForm(result.account, result.secrets || {}));
    setEditingAccountKey(`${provider}:${accountId}`);
  }

  async function handleSaveBinding(event) {
    event.preventDefault();
    if (
      !bindingForm.accountId ||
      !bindingForm.workspaceId ||
      !bindingForm.assistantId.trim()
    ) {
      showToast("绑定规则至少需要账号、工作区和 assistantId", "error");
      return;
    }
    if (
      bindingForm.triggerType === "menu_action" &&
      (!bindingForm.eventKey.trim() || !bindingForm.inputTemplate.trim())
    ) {
      showToast("菜单事件至少需要 eventKey 和 inputTemplate", "error");
      return;
    }

    setSavingBinding(true);
    const result = await ImGateway.upsertBinding(
      buildBindingPayload({
        mode: bindingForm.triggerType,
        form: bindingForm,
      })
    );

    if (result.success) {
      showToast(
        editingBindingId ? "绑定规则已更新" : "绑定规则已创建",
        "success"
      );
      setBindingForm(INITIAL_BINDING_FORM);
      setEditingBindingId("");
      await loadConsole({ silent: true });
    } else {
      showToast(result.error || "保存绑定规则失败", "error");
    }
    setSavingBinding(false);
  }

  function handleEditBinding(binding) {
    setBindingForm(hydrateBindingForm(binding));
    setEditingBindingId(binding.id);
  }

  async function handleRotateRuntimeToken(runtimeId) {
    setRotatingRuntimeId(runtimeId);
    const result = await ImGateway.rotateRuntimeToken(runtimeId);

    if (result.success) {
      setOneTimeToken({
        runtimeId,
        bootstrapToken: result.bootstrapToken,
      });
      showToast("运行时令牌已轮换，请立即保存新的引导令牌。", "success");
      await loadConsole({ silent: true });
    } else {
      showToast(result.error || "轮换运行时令牌失败", "error");
    }

    setRotatingRuntimeId(null);
  }

  async function handleLoadConfigSnapshot(runtimeId) {
    setLoadingSnapshot(true);
    setSnapshotRuntimeId(runtimeId);
    const result = await ImGateway.runtimeConfig(runtimeId);
    if (result.success) {
      setConfigSnapshot(result.snapshot);
    } else {
      showToast(result.error || "加载配置快照失败", "error");
      setConfigSnapshot(null);
    }
    setLoadingSnapshot(false);
  }

  const findingCount = Array.isArray(securityAudit?.findings)
    ? securityAudit.findings.length
    : 0;
  const availableAccounts = accounts.filter(
    (account) => account.provider === bindingForm.provider
  );
  const callbackAccountId =
    accountForm.accountId.trim() ||
    accountForm.appId.trim() ||
    accountForm.corpId.trim() ||
    ":accountId";

  return (
    <div className="w-screen h-screen overflow-hidden bg-page-texture flex">
      <Sidebar />
      <div
        style={{ height: isMobile ? "100%" : "calc(100% - 32px)" }}
        className="relative z-[1] md:ml-[2px] md:mr-[16px] md:my-[16px] md:rounded-[16px] bg-theme-bg-secondary w-full h-full overflow-y-scroll p-4 md:p-0"
      >
        <div className="flex flex-col w-full px-1 md:pl-6 md:pr-[50px] md:py-6 py-16 gap-6">
          <div className="w-full flex flex-col gap-y-1 pb-6 border-theme-border border-b-2">
            <div className="items-center flex justify-between gap-x-4">
              <div>
                <p className="text-lg leading-6 font-bold text-theme-text-primary">
                  渠道接入控制台
                </p>
                <p className="text-xs leading-[18px] font-base text-theme-text-secondary mt-1">
                  Octopus Studio
                  作为第一方渠道平台维护飞书/企业微信接入、消息路由、菜单事件动作与运行时诊断。
                </p>
              </div>
              <Button
                variant="secondary"
                onClick={() => loadConsole({ silent: true })}
                disabled={refreshing}
              >
                {!refreshing && <ArrowsClockwise className="h-4 w-4" />}
                刷新
              </Button>
            </div>
          </div>

          {oneTimeToken ? (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-4">
              <div className="flex items-center gap-2 text-amber-200 text-sm font-medium">
                <Key className="h-4 w-4" />
                一次性引导令牌
              </div>
              <p className="text-xs text-amber-100/80 mt-1">
                运行时：{oneTimeToken.runtimeId}
                。此令牌仅显示一次，请在离开页面前妥善保存。
              </p>
              <pre className="mt-3 whitespace-pre-wrap break-all rounded-lg bg-black/20 px-3 py-3 text-xs text-amber-50">
                {oneTimeToken.bootstrapToken}
              </pre>
            </div>
          ) : null}

          {loading ? (
            <EmptyState text="正在加载 IM 网关控制台…" />
          ) : (
            <>
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                <SectionCard
                  title="健康状态"
                  description="控制面聚合健康快照。"
                >
                  <div className="flex items-center gap-3">
                    <StatusBadge
                      value={health?.queue?.healthy ? "healthy" : "degraded"}
                    />
                    <span className="text-sm text-theme-text-secondary">
                      队列深度：{health?.queue?.size ?? 0}
                    </span>
                  </div>
                </SectionCard>
                <SectionCard
                  title="安全审计"
                  description="来自服务端 IM 网关安全检查的最新审计结果。"
                >
                  <div className="flex items-center gap-3">
                    <StatusBadge
                      value={findingCount === 0 ? "healthy" : "review"}
                    />
                    <span className="text-sm text-theme-text-secondary">
                      发现问题：{findingCount}
                    </span>
                  </div>
                </SectionCard>
                <SectionCard
                  title="运行时清单"
                  description="控制面可见的已注册运行时节点。"
                >
                  <div className="flex items-center gap-3">
                    <StatusBadge
                      value={runtimes.length ? "active" : "offline"}
                    />
                    <span className="text-sm text-theme-text-secondary">
                      已注册运行时：{runtimes.length}
                    </span>
                  </div>
                </SectionCard>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <SectionCard
                  title={editingAccountKey ? "编辑渠道应用" : "配置渠道应用"}
                  description="先完成提供方应用接入，再配置消息路由或飞书菜单事件动作。"
                  action={
                    editingAccountKey ? (
                      <Button
                        size="sm"
                        type="button"
                        variant="muted"
                        onClick={() => {
                          setAccountForm(INITIAL_ACCOUNT_FORM);
                          setEditingAccountKey("");
                        }}
                      >
                        取消编辑
                      </Button>
                    ) : null
                  }
                >
                  <form
                    onSubmit={handleSaveAccount}
                    className="grid grid-cols-1 md:grid-cols-2 gap-3"
                  >
                    {accountForm.provider === "feishu" ? (
                      <div className="md:col-span-2 rounded-lg border border-sky-500/20 bg-sky-500/10 px-3 py-3 text-xs text-sky-100/90">
                        <p className="font-medium text-sky-200">
                          菜单结构在飞书开发者后台配置，Octopus Studio
                          只负责处理推送事件的 event_key 路由。
                        </p>
                        <p className="mt-2 break-all">
                          Webhook 回调路径：/api/im-gateway/webhook/feishu/
                          {callbackAccountId}
                        </p>
                      </div>
                    ) : null}
                    <label className="flex flex-col gap-2 text-xs text-theme-text-secondary">
                      平台
                      <select
                        value={accountForm.provider}
                        onChange={(event) =>
                          setAccountForm((current) => ({
                            ...INITIAL_ACCOUNT_FORM,
                            provider: event.target.value,
                            status: current.status,
                          }))
                        }
                        className={INPUT_CLASSNAME}
                      >
                        <option value="feishu">飞书</option>
                        <option value="wecom">企业微信</option>
                      </select>
                    </label>
                    <label className="flex flex-col gap-2 text-xs text-theme-text-secondary">
                      账号 ID
                      <input
                        value={accountForm.accountId}
                        onChange={(event) =>
                          setAccountForm((current) => ({
                            ...current,
                            accountId: event.target.value,
                          }))
                        }
                        placeholder="唯一账号标识；为空时默认取 appId / corpId"
                        className={INPUT_CLASSNAME}
                      />
                    </label>
                    <label className="flex flex-col gap-2 text-xs text-theme-text-secondary">
                      状态
                      <select
                        value={accountForm.status}
                        onChange={(event) =>
                          setAccountForm((current) => ({
                            ...current,
                            status: event.target.value,
                          }))
                        }
                        className={INPUT_CLASSNAME}
                      >
                        <option value="active">active</option>
                        <option value="inactive">inactive</option>
                      </select>
                    </label>
                    {accountForm.provider === "feishu" ? (
                      <>
                        <label className="flex flex-col gap-2 text-xs text-theme-text-secondary">
                          App ID
                          <input
                            value={accountForm.appId}
                            onChange={(event) =>
                              setAccountForm((current) => ({
                                ...current,
                                appId: event.target.value,
                              }))
                            }
                            className={INPUT_CLASSNAME}
                          />
                        </label>
                        <label className="flex flex-col gap-2 text-xs text-theme-text-secondary">
                          App Secret
                          <input
                            type="password"
                            value={accountForm.appSecret}
                            onChange={(event) =>
                              setAccountForm((current) => ({
                                ...current,
                                appSecret: event.target.value,
                              }))
                            }
                            className={INPUT_CLASSNAME}
                          />
                        </label>
                        <label className="flex flex-col gap-2 text-xs text-theme-text-secondary">
                          Verification Token
                          <input
                            value={accountForm.verificationToken}
                            onChange={(event) =>
                              setAccountForm((current) => ({
                                ...current,
                                verificationToken: event.target.value,
                              }))
                            }
                            className={INPUT_CLASSNAME}
                          />
                        </label>
                        <label className="md:col-span-2 flex flex-col gap-2 text-xs text-theme-text-secondary">
                          Encrypt Key
                          <input
                            value={accountForm.encryptKey}
                            onChange={(event) =>
                              setAccountForm((current) => ({
                                ...current,
                                encryptKey: event.target.value,
                              }))
                            }
                            className={INPUT_CLASSNAME}
                          />
                        </label>
                      </>
                    ) : (
                      <>
                        <label className="flex flex-col gap-2 text-xs text-theme-text-secondary">
                          Corp ID
                          <input
                            value={accountForm.corpId}
                            onChange={(event) =>
                              setAccountForm((current) => ({
                                ...current,
                                corpId: event.target.value,
                              }))
                            }
                            className={INPUT_CLASSNAME}
                          />
                        </label>
                        <label className="flex flex-col gap-2 text-xs text-theme-text-secondary">
                          Secret
                          <input
                            type="password"
                            value={accountForm.secret}
                            onChange={(event) =>
                              setAccountForm((current) => ({
                                ...current,
                                secret: event.target.value,
                              }))
                            }
                            className={INPUT_CLASSNAME}
                          />
                        </label>
                        <label className="flex flex-col gap-2 text-xs text-theme-text-secondary">
                          Agent ID
                          <input
                            value={accountForm.agentId}
                            onChange={(event) =>
                              setAccountForm((current) => ({
                                ...current,
                                agentId: event.target.value,
                              }))
                            }
                            className={INPUT_CLASSNAME}
                          />
                        </label>
                        <label className="flex flex-col gap-2 text-xs text-theme-text-secondary">
                          Token
                          <input
                            value={accountForm.token}
                            onChange={(event) =>
                              setAccountForm((current) => ({
                                ...current,
                                token: event.target.value,
                              }))
                            }
                            className={INPUT_CLASSNAME}
                          />
                        </label>
                        <label className="md:col-span-2 flex flex-col gap-2 text-xs text-theme-text-secondary">
                          Encoding AES Key
                          <input
                            value={accountForm.encodingAESKey}
                            onChange={(event) =>
                              setAccountForm((current) => ({
                                ...current,
                                encodingAESKey: event.target.value,
                              }))
                            }
                            className={INPUT_CLASSNAME}
                          />
                        </label>
                      </>
                    )}

                    <div className="md:col-span-2 flex gap-2">
                      <Button
                        type="submit"
                        variant="primary"
                        disabled={savingAccount}
                        loading={savingAccount}
                      >
                        {!savingAccount && <Plus className="h-4 w-4" />}
                        {editingAccountKey ? "保存账号" : "创建账号"}
                      </Button>
                    </div>
                  </form>
                </SectionCard>

                <SectionCard
                  title={editingBindingId ? "编辑路由动作" : "配置路由动作"}
                  description="同一个渠道账号可配置消息触发和飞书菜单事件触发两类路由。"
                  action={
                    editingBindingId ? (
                      <Button
                        size="sm"
                        type="button"
                        variant="muted"
                        onClick={() => {
                          setBindingForm(INITIAL_BINDING_FORM);
                          setEditingBindingId("");
                        }}
                      >
                        取消编辑
                      </Button>
                    ) : null
                  }
                >
                  <form
                    onSubmit={handleSaveBinding}
                    className="grid grid-cols-1 md:grid-cols-2 gap-3"
                  >
                    <label className="flex flex-col gap-2 text-xs text-theme-text-secondary">
                      平台
                      <select
                        value={bindingForm.provider}
                        onChange={(event) =>
                          setBindingForm((current) => ({
                            ...current,
                            provider: event.target.value,
                            triggerType:
                              event.target.value === "feishu"
                                ? current.triggerType
                                : "message",
                            accountId: "",
                          }))
                        }
                        className={INPUT_CLASSNAME}
                      >
                        <option value="feishu">飞书</option>
                        <option value="wecom">企业微信</option>
                      </select>
                    </label>
                    <label className="flex flex-col gap-2 text-xs text-theme-text-secondary">
                      触发类型
                      <select
                        value={bindingForm.triggerType}
                        onChange={(event) =>
                          setBindingForm((current) => ({
                            ...current,
                            triggerType: event.target.value,
                          }))
                        }
                        className={INPUT_CLASSNAME}
                      >
                        <option value="message">消息</option>
                        {bindingForm.provider === "feishu" ? (
                          <option value="menu_action">飞书菜单事件</option>
                        ) : null}
                      </select>
                    </label>
                    <label className="flex flex-col gap-2 text-xs text-theme-text-secondary">
                      渠道账号
                      <select
                        value={bindingForm.accountId}
                        onChange={(event) =>
                          setBindingForm((current) => ({
                            ...current,
                            accountId: event.target.value,
                          }))
                        }
                        className={INPUT_CLASSNAME}
                      >
                        <option value="">请选择账号</option>
                        {availableAccounts.map((account) => (
                          <option key={account.id} value={account.accountId}>
                            {account.accountId}
                          </option>
                        ))}
                      </select>
                    </label>
                    {availableAccounts.length === 0 ? (
                      <p className="md:col-span-2 text-xs text-amber-300">
                        当前平台还没有可用的渠道账号。请先在左侧表单创建账号，再配置绑定规则。
                      </p>
                    ) : null}
                    <label className="flex flex-col gap-2 text-xs text-theme-text-secondary">
                      工作区
                      <select
                        value={bindingForm.workspaceId}
                        onChange={(event) =>
                          setBindingForm((current) => ({
                            ...current,
                            workspaceId: event.target.value,
                          }))
                        }
                        className={INPUT_CLASSNAME}
                      >
                        <option value="">请选择工作区</option>
                        {workspaces.map((workspace) => (
                          <option key={workspace.id} value={workspace.id}>
                            {workspace.name || workspace.slug || workspace.id}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex flex-col gap-2 text-xs text-theme-text-secondary">
                      Assistant ID
                      <input
                        list="workspace-assistant-options"
                        value={bindingForm.assistantId}
                        onChange={(event) =>
                          setBindingForm((current) => ({
                            ...current,
                            assistantId: event.target.value,
                          }))
                        }
                        placeholder="从当前工作区已安装助手中选择或手填"
                        className={INPUT_CLASSNAME}
                      />
                      <datalist id="workspace-assistant-options">
                        {workspaceAssistants.map((assistant) => (
                          <option key={assistant.id} value={assistant.id}>
                            {assistant.instanceName ||
                              assistant.template?.name ||
                              assistant.id}
                          </option>
                        ))}
                      </datalist>
                    </label>
                    {bindingForm.workspaceId &&
                    workspaceAssistants.length === 0 ? (
                      <p className="md:col-span-2 text-xs text-amber-300">
                        当前工作区暂无已安装助手。请先去 Assistant Library
                        雇佣助手；如果你已经知道实例 ID，也可以直接手填。
                      </p>
                    ) : null}
                    {bindingForm.triggerType === "menu_action" ? (
                      <>
                        <label className="flex flex-col gap-2 text-xs text-theme-text-secondary">
                          Event Key
                          <input
                            value={bindingForm.eventKey}
                            onChange={(event) =>
                              setBindingForm((current) => ({
                                ...current,
                                eventKey: event.target.value,
                              }))
                            }
                            placeholder="例如 help_center"
                            className={INPUT_CLASSNAME}
                          />
                        </label>
                        <label className="md:col-span-2 flex flex-col gap-2 text-xs text-theme-text-secondary">
                          Input Template
                          <textarea
                            rows={4}
                            value={bindingForm.inputTemplate}
                            onChange={(event) =>
                              setBindingForm((current) => ({
                                ...current,
                                inputTemplate: event.target.value,
                              }))
                            }
                            placeholder="用户点击了飞书菜单“帮助中心”，请回复简洁的帮助说明。"
                            className={`${INPUT_CLASSNAME} resize-y`}
                          />
                        </label>
                        <p className="md:col-span-2 text-xs text-sky-200">
                          菜单项和 event_key
                          仍在飞书开发者后台配置；这里负责把回调事件映射到具体助手与提示模板。
                        </p>
                      </>
                    ) : (
                      <>
                        <label className="flex flex-col gap-2 text-xs text-theme-text-secondary">
                          Peer Type
                          <select
                            value={bindingForm.peerType}
                            onChange={(event) =>
                              setBindingForm((current) => ({
                                ...current,
                                peerType: event.target.value,
                              }))
                            }
                            className={INPUT_CLASSNAME}
                          >
                            <option value="">全部</option>
                            <option value="user">user</option>
                            <option value="group">group</option>
                          </select>
                        </label>
                        <label className="flex flex-col gap-2 text-xs text-theme-text-secondary">
                          Peer ID
                          <input
                            value={bindingForm.peerId}
                            onChange={(event) =>
                              setBindingForm((current) => ({
                                ...current,
                                peerId: event.target.value,
                              }))
                            }
                            placeholder="默认 *"
                            className={INPUT_CLASSNAME}
                          />
                        </label>
                      </>
                    )}
                    <label className="flex flex-col gap-2 text-xs text-theme-text-secondary">
                      Priority
                      <input
                        type="number"
                        value={bindingForm.priority}
                        onChange={(event) =>
                          setBindingForm((current) => ({
                            ...current,
                            priority: event.target.value,
                          }))
                        }
                        className={INPUT_CLASSNAME}
                      />
                    </label>
                    <label className="flex flex-col gap-2 text-xs text-theme-text-secondary">
                      Permission Mode
                      <select
                        value={bindingForm.permissionMode}
                        onChange={(event) =>
                          setBindingForm((current) => ({
                            ...current,
                            permissionMode: event.target.value,
                          }))
                        }
                        className={INPUT_CLASSNAME}
                      >
                        <option value="default">default</option>
                        <option value="acceptEdits">acceptEdits</option>
                        <option value="bypass">bypass</option>
                      </select>
                    </label>
                    {bindingForm.triggerType === "message" ? (
                      <>
                        <label className="md:col-span-2 flex flex-col gap-2 text-xs text-theme-text-secondary">
                          Sender Allowlist
                          <textarea
                            rows={3}
                            value={bindingForm.senderAllowlist}
                            onChange={(event) =>
                              setBindingForm((current) => ({
                                ...current,
                                senderAllowlist: event.target.value,
                              }))
                            }
                            placeholder="每行一个 senderId；留空表示不限制"
                            className={`${INPUT_CLASSNAME} resize-y`}
                          />
                        </label>
                        <label className="flex items-center gap-2 text-xs text-theme-text-secondary">
                          <input
                            type="checkbox"
                            checked={bindingForm.requireMention}
                            onChange={(event) =>
                              setBindingForm((current) => ({
                                ...current,
                                requireMention: event.target.checked,
                              }))
                            }
                          />
                          群聊中要求 @ 才触发
                        </label>
                      </>
                    ) : null}
                    <label className="flex items-center gap-2 text-xs text-theme-text-secondary">
                      <input
                        type="checkbox"
                        checked={bindingForm.enabled}
                        onChange={(event) =>
                          setBindingForm((current) => ({
                            ...current,
                            enabled: event.target.checked,
                          }))
                        }
                      />
                      启用该绑定
                    </label>
                    <div className="md:col-span-2 flex gap-2">
                      <Button
                        type="submit"
                        variant="primary"
                        disabled={savingBinding}
                        loading={savingBinding}
                      >
                        {!savingBinding && <Plus className="h-4 w-4" />}
                        {editingBindingId ? "保存绑定" : "创建绑定"}
                      </Button>
                    </div>
                  </form>
                </SectionCard>
              </div>

              <SectionCard
                title="创建运行时"
                description="配置新的嵌入式、Sidecar 或远程运行时，并获取一次性引导令牌。"
                action={
                  <span className="inline-flex items-center gap-2 text-xs text-theme-text-secondary">
                    <Plus className="h-4 w-4" />
                    一次性引导
                  </span>
                }
              >
                <form
                  onSubmit={handleCreateRuntime}
                  className="grid grid-cols-1 md:grid-cols-4 gap-3"
                >
                  <input
                    value={runtimeForm.id}
                    onChange={(event) =>
                      setRuntimeForm((current) => ({
                        ...current,
                        id: event.target.value,
                      }))
                    }
                    placeholder="运行时 ID"
                    className={INPUT_CLASSNAME}
                  />
                  <input
                    value={runtimeForm.name}
                    onChange={(event) =>
                      setRuntimeForm((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                    placeholder="显示名称"
                    className={INPUT_CLASSNAME}
                  />
                  <select
                    value={runtimeForm.mode}
                    onChange={(event) =>
                      setRuntimeForm((current) => ({
                        ...current,
                        mode: event.target.value,
                      }))
                    }
                    className={INPUT_CLASSNAME}
                  >
                    <option value="embedded">嵌入式</option>
                    <option value="sidecar">Sidecar</option>
                    <option value="remote">远程</option>
                  </select>
                  <Button
                    className="w-full"
                    disabled={creatingRuntime}
                    loading={creatingRuntime}
                    type="submit"
                    variant="primary"
                  >
                    {!creatingRuntime && <Plus className="h-4 w-4" />}
                    {creatingRuntime ? "创建中…" : "创建运行时"}
                  </Button>
                </form>
              </SectionCard>

              <SectionCard
                title="运行时列表"
                description="已注册到控制面的运行时节点。"
              >
                <Table
                  emptyText="暂无已注册的运行时。"
                  columns={[
                    { key: "id", label: "运行时" },
                    { key: "mode", label: "模式" },
                    {
                      key: "status",
                      label: "状态",
                      render: (row) => <StatusBadge value={row.status} />,
                    },
                    {
                      key: "lastHeartbeatAt",
                      label: "最近心跳",
                      render: (row) =>
                        row.lastHeartbeatAt
                          ? new Date(row.lastHeartbeatAt).toLocaleString()
                          : "-",
                    },
                    {
                      key: "actions",
                      label: "操作",
                      render: (row) => (
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleRotateRuntimeToken(row.id)}
                            disabled={rotatingRuntimeId === row.id}
                            loading={rotatingRuntimeId === row.id}
                          >
                            {rotatingRuntimeId === row.id
                              ? "轮换中…"
                              : "轮换令牌"}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleLoadConfigSnapshot(row.id)}
                            disabled={
                              loadingSnapshot && snapshotRuntimeId === row.id
                            }
                            loading={
                              loadingSnapshot && snapshotRuntimeId === row.id
                            }
                          >
                            {loadingSnapshot && snapshotRuntimeId === row.id
                              ? "加载中…"
                              : "配置快照"}
                          </Button>
                        </div>
                      ),
                    },
                  ]}
                  rows={runtimes}
                />
              </SectionCard>

              <SectionCard
                title="渠道账号"
                description="控制面已知的渠道账号。现在支持回填并编辑现有账号凭据。"
              >
                <Table
                  emptyText="暂无已配置的渠道账号。"
                  columns={[
                    { key: "provider", label: "平台" },
                    { key: "accountId", label: "账号 ID" },
                    {
                      key: "status",
                      label: "状态",
                      render: (row) => <StatusBadge value={row.status} />,
                    },
                    {
                      key: "tokenExpiresAt",
                      label: "令牌过期时间",
                      render: (row) =>
                        row.tokenExpiresAt
                          ? new Date(row.tokenExpiresAt).toLocaleString()
                          : "-",
                    },
                    {
                      key: "actions",
                      label: "操作",
                      render: (row) => (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            handleEditAccount(row.provider, row.accountId)
                          }
                        >
                          <PencilSimple className="h-4 w-4" />
                          编辑
                        </Button>
                      ),
                    },
                  ]}
                  rows={accounts}
                />
              </SectionCard>

              <SectionCard
                title="路由动作列表"
                description="统一查看消息触发和飞书菜单事件触发两类路由。"
              >
                <Table
                  emptyText="暂无已配置的路由动作。"
                  columns={[
                    { key: "provider", label: "平台" },
                    { key: "accountId", label: "账号 ID" },
                    {
                      key: "triggerType",
                      label: "触发类型",
                      render: (row) =>
                        row.match?.triggerType === "menu_action"
                          ? "菜单事件"
                          : "消息",
                    },
                    {
                      key: "target",
                      label: "命中目标",
                      render: (row) =>
                        row.match?.triggerType === "menu_action"
                          ? row.match?.eventKey || "-"
                          : `${row.match?.peerType || "all"} / ${row.match?.peerId || "*"}`,
                    },
                    { key: "workspaceId", label: "工作区" },
                    {
                      key: "assistantId",
                      label: "Assistant",
                      render: (row) =>
                        row.route?.assistantId || row.route?.agentId || "-",
                    },
                    { key: "priority", label: "优先级" },
                    {
                      key: "enabled",
                      label: "启用",
                      render: (row) => (
                        <StatusBadge
                          value={row.enabled ? "active" : "offline"}
                        />
                      ),
                    },
                    {
                      key: "actions",
                      label: "操作",
                      render: (row) => (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleEditBinding(row)}
                        >
                          <PencilSimple className="h-4 w-4" />
                          编辑
                        </Button>
                      ),
                    },
                  ]}
                  rows={bindings}
                />
              </SectionCard>

              <SectionCard
                title="安全审计发现"
                description="把审计结果展开为可执行问题单，而不是只显示一个计数。"
              >
                <Table
                  emptyText="当前没有安全审计发现。"
                  columns={[
                    {
                      key: "severity",
                      label: "严重级别",
                      render: (row) => <FindingBadge severity={row.severity} />,
                    },
                    { key: "title", label: "问题" },
                    {
                      key: "target",
                      label: "目标",
                      render: (row) =>
                        [row.provider, row.accountId, row.bindingId]
                          .filter(Boolean)
                          .join(" / ") || "-",
                    },
                    {
                      key: "remediation",
                      label: "修复建议",
                    },
                  ]}
                  rows={(securityAudit?.findings || []).map((finding) => ({
                    ...finding,
                    key: finding.id,
                  }))}
                />
              </SectionCard>

              {configSnapshot && (
                <SectionCard
                  title={`配置快照 — ${configSnapshot.runtimeId}`}
                  description={`版本 ${configSnapshot.revision}，生成于 ${new Date(configSnapshot.generatedAt).toLocaleString()}`}
                  action={
                    <Button
                      size="sm"
                      type="button"
                      onClick={() => setConfigSnapshot(null)}
                      variant="muted"
                    >
                      关闭
                    </Button>
                  }
                >
                  <div className="space-y-4">
                    <div>
                      <p className="text-xs font-medium text-theme-text-secondary mb-2">
                        账号（{(configSnapshot.accounts || []).length}）
                      </p>
                      <Table
                        emptyText="快照中无账号"
                        columns={[
                          { key: "provider", label: "平台" },
                          { key: "accountId", label: "账号 ID" },
                        ]}
                        rows={(configSnapshot.accounts || []).map(
                          (account, index) => ({
                            ...account,
                            id: index,
                          })
                        )}
                      />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-theme-text-secondary mb-2">
                        绑定规则（{(configSnapshot.bindings || []).length}）
                      </p>
                      <Table
                        emptyText="快照中无绑定规则"
                        columns={[
                          { key: "provider", label: "平台" },
                          { key: "accountId", label: "账号 ID" },
                          { key: "workspaceId", label: "工作区" },
                          {
                            key: "enabled",
                            label: "启用",
                            render: (row) => (
                              <StatusBadge
                                value={row.enabled ? "active" : "offline"}
                              />
                            ),
                          },
                        ]}
                        rows={configSnapshot.bindings || []}
                      />
                    </div>
                  </div>
                </SectionCard>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
