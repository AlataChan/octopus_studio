import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { isMobile } from "react-device-detect";
import {
  ArrowClockwise,
  ArrowLeft,
  DownloadSimple,
  CheckCircle,
  Trash,
  X,
} from "@phosphor-icons/react";

import Sidebar from "@/components/Sidebar";
import Button from "@/components/Button";
import ModalWrapper from "@/components/ModalWrapper";
import useUser from "@/hooks/useUser";
import paths from "@/utils/paths";
import showToast from "@/utils/toast";
import Workspace from "@/models/workspace";
import SkillHub from "@/models/skillHub";
import WorkspaceAssistant from "@/models/workspaceAssistant";
import System from "@/models/system";

function row(label, value) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <span className="w-28 shrink-0 text-theme-text-secondary">{label}</span>
      <span className="text-theme-text-primary break-words">{value}</span>
    </div>
  );
}

function safeJsonParse(value, fallback) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "object") return value;
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function toStringArray(value) {
  if (Array.isArray(value)) return value.map((v) => String(v));
  const parsed = safeJsonParse(value, []);
  if (Array.isArray(parsed)) return parsed.map((v) => String(v));
  return [];
}

export default function SkillDetailPage() {
  const navigate = useNavigate();
  const params = useParams();
  const skillId = useMemo(
    () => decodeURIComponent(params.skillId || ""),
    [params.skillId]
  );
  const { user } = useUser();
  const [multiUserMode, setMultiUserMode] = useState(null);
  const role = String(user?.role || "");
  const isManager =
    multiUserMode === false || role === "admin" || role === "manager";

  const [loading, setLoading] = useState(true);
  const [skill, setSkill] = useState(null);

  const [workspaces, setWorkspaces] = useState([]);
  const [workspaceId, setWorkspaceId] = useState(null);
  const [installations, setInstallations] = useState([]);

  const currentWorkspace = useMemo(() => {
    if (!workspaceId) return null;
    return (workspaces || []).find((w) => w.id === workspaceId) || null;
  }, [workspaces, workspaceId]);

  const [assistants, setAssistants] = useState([]);
  const [assistantId, setAssistantId] = useState("");

  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [upgradeBusy, setUpgradeBusy] = useState(false);
  const [upgradePreview, setUpgradePreview] = useState(null);

  const [savingConfig, setSavingConfig] = useState(false);
  const [configDraft, setConfigDraft] = useState({});

  const loadWorkspaces = async () => {
    const ws = await Workspace.all();
    setWorkspaces(ws || []);
    if ((ws || []).length > 0) setWorkspaceId(ws[0].id);
  };

  const loadInstalled = async (targetWorkspaceId) => {
    if (!targetWorkspaceId) return;
    const res = await SkillHub.getInstalled(targetWorkspaceId);
    if (!res?.success) return;
    setInstallations(res.installations || []);
  };

  const loadAssistants = async (workspaceSlug) => {
    if (!workspaceSlug) return;
    const res = await WorkspaceAssistant.list(workspaceSlug);
    if (!res?.success) return;
    setAssistants(res?.data?.assistants || []);
  };

  const loadSkill = async () => {
    setLoading(true);
    try {
      const res = await SkillHub.getSkill(skillId);
      if (!res?.success) throw new Error(res?.error || "加载失败");
      setSkill(res.skill);
    } catch (error) {
      showToast(error.message || "加载失败", "error");
      setSkill(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    System.keys().then((settings) => {
      setMultiUserMode(settings?.MultiUserMode ?? true);
    });
    loadWorkspaces();
    loadSkill();
  }, [skillId]);

  useEffect(() => {
    if (!workspaceId) return;
    loadInstalled(workspaceId);
  }, [workspaceId]);

  useEffect(() => {
    if (!currentWorkspace?.slug) return;
    loadAssistants(currentWorkspace.slug);
  }, [currentWorkspace?.slug]);

  const workspaceBound = useMemo(() => {
    return (installations || []).some(
      (r) =>
        r?.skillId === skillId &&
        r?.scopeType === "workspace" &&
        r?.scopeId === "__workspace__"
    );
  }, [installations, skillId]);

  const assistantBound = useMemo(() => {
    if (!assistantId) return false;
    return (installations || []).some(
      (r) =>
        r?.skillId === skillId &&
        r?.scopeType === "assistant" &&
        String(r?.scopeId) === String(assistantId)
    );
  }, [installations, skillId, assistantId]);

  const selectedAssistant = useMemo(() => {
    if (!assistantId) return null;
    return (
      (assistants || []).find((a) => String(a.id) === String(assistantId)) ||
      null
    );
  }, [assistants, assistantId]);

  const effectivePermission = useMemo(() => {
    if (!selectedAssistant) {
      return {
        permissionMode: "default",
        allowedTools: [],
        autoApprovedTools: [],
      };
    }

    const custom = selectedAssistant?.customConfig || {};
    const template = selectedAssistant?.template || {};

    const permissionMode =
      String(
        custom.permissionMode || template.defaultPermissionMode || "default"
      ).trim() || "default";
    const allowedTools = Array.isArray(custom.allowedTools)
      ? custom.allowedTools
      : toStringArray(template.defaultAllowedTools);
    const autoApprovedTools = Array.isArray(custom.autoApprovedTools)
      ? custom.autoApprovedTools
      : toStringArray(template.defaultAutoApprovedTools);

    return {
      permissionMode,
      allowedTools,
      autoApprovedTools,
    };
  }, [selectedAssistant]);

  const configSchema = useMemo(() => {
    if (!skill) return null;
    if (Array.isArray(skill.configSchema)) {
      return { version: "1.0", fields: skill.configSchema };
    }
    if (!skill.configSchema || typeof skill.configSchema !== "object")
      return null;
    return skill.configSchema;
  }, [skill]);

  const configFields = useMemo(() => {
    return Array.isArray(configSchema?.fields) ? configSchema.fields : [];
  }, [configSchema]);

  useEffect(() => {
    if (!skill) return;
    const defaults = {};
    for (const f of configFields) {
      const key = String(f?.key || "").trim();
      if (!key) continue;
      if (f.defaultValue !== undefined) defaults[key] = f.defaultValue;
    }
    setConfigDraft({ ...defaults, ...(skill.config || {}) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skillId, skill?.configSchema, skill?.config]);

  const handleInstallWorkspace = async () => {
    if (!workspaceId) return showToast("请先选择 Workspace", "warning");
    const res = await SkillHub.install({ skillId, workspaceId });
    if (!res?.success) return showToast(res?.error || "安装失败", "error");
    showToast("已安装到 Workspace", "success");
    await loadInstalled(workspaceId);
    if (res?.skillId && res.skillId !== skillId) {
      navigate(paths.skillHubSkill(res.skillId));
    }
  };

  const handleUninstallWorkspace = async () => {
    if (!workspaceId) return showToast("请先选择 Workspace", "warning");
    const res = await SkillHub.uninstall({ skillId, workspaceId });
    if (!res?.success) return showToast(res?.error || "卸载失败", "error");
    showToast("已从 Workspace 解绑", "success");
    await loadInstalled(workspaceId);
  };

  const handleBindAssistant = async () => {
    if (!workspaceId) return showToast("请先选择 Workspace", "warning");
    if (!assistantId) return showToast("请先选择一个 AI 员工", "warning");
    const res = await SkillHub.install({ skillId, workspaceId, assistantId });
    if (!res?.success) return showToast(res?.error || "绑定失败", "error");
    showToast("已绑定到 AI 员工", "success");
    await loadInstalled(workspaceId);
    if (res?.skillId && res.skillId !== skillId) {
      navigate(paths.skillHubSkill(res.skillId));
    }
  };

  const handleUnbindAssistant = async () => {
    if (!workspaceId) return showToast("请先选择 Workspace", "warning");
    if (!assistantId) return showToast("请先选择一个 AI 员工", "warning");
    const res = await SkillHub.uninstall({ skillId, workspaceId, assistantId });
    if (!res?.success) return showToast(res?.error || "解绑失败", "error");
    showToast("已从 AI 员工解绑", "success");
    await loadInstalled(workspaceId);
  };

  const handleValidate = async () => {
    const res = await SkillHub.validate(skillId);
    if (!res?.success) return showToast(res?.error || "校验失败", "error");
    const valid = res?.result?.valid === true;
    showToast(valid ? "校验通过" : "校验未通过", valid ? "success" : "warning");
    await loadSkill();
    if (workspaceId) await loadInstalled(workspaceId);
  };

  const handleSaveConfig = async () => {
    if (!isManager) return;
    setSavingConfig(true);
    try {
      const nextConfig = { ...(configDraft || {}) };
      for (const f of configFields) {
        const key = String(f?.key || "").trim();
        if (!key) continue;
        const type = String(f?.type || "string").toLowerCase();
        const required = f?.required === true;

        let value = nextConfig[key];

        if (
          type === "number" &&
          value !== "" &&
          value !== null &&
          value !== undefined
        ) {
          const n = Number(value);
          if (!Number.isFinite(n)) {
            throw new Error(`字段 "${f.label || key}" 必须是数字`);
          }
          value = n;
        }

        if (type === "boolean") {
          value = value === true;
        }

        if (type === "json" && typeof value === "string") {
          const s = value.trim();
          if (s) {
            try {
              value = JSON.parse(s);
            } catch {
              throw new Error(`字段 "${f.label || key}" 不是合法 JSON`);
            }
          } else {
            value = null;
          }
        }

        if (
          required &&
          (value === undefined || value === null || value === "")
        ) {
          throw new Error(`字段 "${f.label || key}" 是必填项`);
        }

        nextConfig[key] = value;
      }

      const res = await SkillHub.updateConfig(skillId, nextConfig);
      if (!res?.success) throw new Error(res?.error || "保存失败");
      showToast("配置已保存", "success");
      await loadSkill();
    } catch (error) {
      showToast(error.message || "保存失败", "error");
    } finally {
      setSavingConfig(false);
    }
  };

  const isUpgradeable =
    isManager &&
    String(skillId || "").startsWith("custom:") &&
    ["github", "registry"].includes(
      String(skill?.sourceType || "").toLowerCase()
    );

  const openUpgradePreview = async () => {
    setUpgradeBusy(true);
    try {
      const res = await SkillHub.upgrade(skillId, { dryRun: true });
      if (!res?.success) throw new Error(res?.error || "预览失败");
      setUpgradePreview(res.result);
      setUpgradeOpen(true);
    } catch (error) {
      showToast(error.message || "预览失败", "error");
    } finally {
      setUpgradeBusy(false);
    }
  };

  const runUpgrade = async () => {
    setUpgradeBusy(true);
    try {
      const res = await SkillHub.upgrade(skillId, { dryRun: false });
      if (!res?.success) throw new Error(res?.error || "升级失败");
      showToast(
        res?.result?.upgraded ? "升级完成" : "无需升级（已是最新）",
        "success"
      );
      setUpgradeOpen(false);
      await loadSkill();
    } catch (error) {
      showToast(error.message || "升级失败", "error");
    } finally {
      setUpgradeBusy(false);
    }
  };

  return (
    <div className="w-screen h-screen overflow-hidden bg-page-texture flex">
      {!isMobile && <Sidebar />}
      <div
        style={{ height: isMobile ? "100%" : "calc(100% - 32px)" }}
        className="transition-all duration-500 relative z-[1] md:ml-[2px] md:mr-[16px] md:my-[16px] md:rounded-[16px] bg-theme-bg-secondary w-full h-full overflow-y-scroll"
      >
        <div className="sticky top-0 z-10 bg-theme-bg-secondary border-b-2 border-theme-border px-4 md:px-8 py-6 pr-16 md:pr-24">
          <div className="flex items-center gap-3 mb-4">
            <button
              onClick={() => navigate(paths.skillHub())}
              className="p-2 rounded-lg bg-theme-sidebar-item-default hover:bg-theme-sidebar-item-hover text-white/90 transition-all"
              title="返回"
            >
              <ArrowLeft size={18} />
            </button>
            <h1 className="text-2xl md:text-3xl font-bold text-theme-text-primary">
              Skill 详情
            </h1>
          </div>

          <div className="flex flex-col md:flex-row gap-3">
            <div className="flex items-center gap-2 min-w-[220px]">
              <span className="text-xs text-theme-text-secondary whitespace-nowrap">
                Workspace
              </span>
              <select
                value={workspaceId || ""}
                onChange={(e) => setWorkspaceId(Number(e.target.value))}
                className="flex-grow bg-theme-settings-input-bg text-theme-text-primary text-sm rounded-lg focus:outline-primary-button outline-none border-none p-2.5"
              >
                {(workspaces || []).map((ws) => (
                  <option key={ws.id} value={ws.id}>
                    {ws.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              {isUpgradeable && (
                <Button
                  variant="sidebar"
                  onClick={openUpgradePreview}
                  disabled={upgradeBusy}
                  title="升级预览"
                >
                  <ArrowClockwise size={18} />
                  升级
                </Button>
              )}
              {isManager && (
                <Button
                  onClick={handleValidate}
                  variant="sidebar"
                  title="校验 Skill（写入 valid/invalid 状态）"
                >
                  <CheckCircle size={18} />
                  校验
                </Button>
              )}
              {workspaceBound ? (
                <Button onClick={handleUninstallWorkspace} variant="danger">
                  <Trash size={18} />
                  解绑 Workspace
                </Button>
              ) : (
                <Button onClick={handleInstallWorkspace}>
                  <DownloadSimple size={18} weight="bold" />
                  安装到 Workspace
                </Button>
              )}
            </div>
          </div>
        </div>

        <div className="p-4 md:p-8">
          {loading && (
            <div className="h-40 bg-theme-bg-container rounded-xl animate-pulse" />
          )}

          {!loading && !skill && (
            <div className="text-theme-text-secondary">
              Skill 不存在或加载失败。
            </div>
          )}

          {!loading && skill && (
            <div className="space-y-6">
              <div className="p-5 rounded-xl bg-theme-bg-secondary border-2 border-theme-sidebar-border">
                <div className="flex items-start gap-4">
                  <div className="w-14 h-14 rounded-xl bg-theme-accent-primary/10 flex items-center justify-center text-3xl shrink-0">
                    {skill.icon || "🧩"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h2 className="text-xl font-bold text-theme-text-primary truncate">
                        {skill.name || skill.skillId}
                      </h2>
                      <span className="text-xs px-2 py-0.5 rounded-md bg-theme-accent-primary/10 text-theme-accent-primary font-medium">
                        {skill.sourceType || "local"}
                      </span>
                      {skill.verified && (
                        <span className="text-xs px-2 py-0.5 rounded-md bg-green-500/10 text-green-400 font-medium">
                          verified
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-theme-text-secondary mt-1">
                      {skill.description}
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                  {row("Skill ID", skill.skillId)}
                  {row("Category", skill.category || "general")}
                  {row("Version", skill.version || "-")}
                  {row("License", skill.license || "-")}
                  {row("Source URL", skill.sourceUrl || "-")}
                </div>
              </div>

              <div className="p-5 rounded-xl bg-theme-bg-secondary border-2 border-theme-sidebar-border">
                <h3 className="text-lg font-bold text-theme-text-primary mb-3">
                  Tools
                </h3>
                <div className="flex flex-wrap gap-2">
                  {(skill.tools || []).map((t) => (
                    <span
                      key={t}
                      className="px-2 py-1 text-xs bg-theme-accent-primary/10 text-theme-accent-primary rounded-md font-medium"
                    >
                      {t}
                    </span>
                  ))}
                  {(skill.tools || []).length === 0 && (
                    <span className="text-theme-text-secondary text-sm">
                      (无)
                    </span>
                  )}
                </div>

                {(skill.toolMappings || []).length > 0 && (
                  <div className="mt-4 space-y-2">
                    <div className="text-sm font-semibold text-theme-text-primary">
                      运行时映射（抽象名 → 实际工具名）
                    </div>
                    <div className="space-y-2">
                      {(skill.toolMappings || []).map((m) => (
                        <div
                          key={m.abstract}
                          className="flex items-start gap-2"
                        >
                          <span className="w-40 shrink-0 text-xs px-2 py-1 rounded-md bg-theme-bg-container text-theme-text-secondary break-all">
                            {m.abstract}
                          </span>
                          <div className="flex flex-wrap gap-2">
                            {(m.runtime || []).map((r) => (
                              <span
                                key={`${m.abstract}-${r}`}
                                className="px-2 py-1 text-xs bg-theme-accent-primary/10 text-theme-accent-primary rounded-md font-medium"
                              >
                                {r}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="p-5 rounded-xl bg-theme-bg-secondary border-2 border-theme-sidebar-border">
                <h3 className="text-lg font-bold text-theme-text-primary mb-3">
                  权限（建议值 vs 生效值）
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-theme-bg-container rounded-lg p-4">
                    <div className="text-sm font-semibold text-theme-text-primary mb-2">
                      Skill 建议值（来自 skill.md）
                    </div>
                    <div className="space-y-2 text-sm">
                      {row(
                        "permissionMode",
                        String(skill.permissionMode || "default")
                      )}
                      {row(
                        "allowedTools",
                        (skill.allowedTools || []).length
                          ? (skill.allowedTools || []).join(", ")
                          : "(空)"
                      )}
                      {row(
                        "autoApproved",
                        (skill.autoApprovedTools || []).length
                          ? (skill.autoApprovedTools || []).join(", ")
                          : "(空)"
                      )}
                    </div>
                    <div className="text-xs text-theme-text-secondary mt-3">
                      注：Skill 的建议值不会自动提升运行时权限；生效策略以
                      Workspace/AI 员工配置为准。
                    </div>
                  </div>

                  <div className="bg-theme-bg-container rounded-lg p-4">
                    <div className="text-sm font-semibold text-theme-text-primary mb-2">
                      生效值（当前选择的 AI 员工）
                    </div>
                    <div className="space-y-2 text-sm">
                      {row(
                        "permissionMode",
                        String(effectivePermission.permissionMode || "default")
                      )}
                      {row(
                        "allowedTools",
                        (effectivePermission.allowedTools || []).length
                          ? (effectivePermission.allowedTools || []).join(", ")
                          : "(空)"
                      )}
                      {row(
                        "autoApproved",
                        (effectivePermission.autoApprovedTools || []).length
                          ? (effectivePermission.autoApprovedTools || []).join(
                              ", "
                            )
                          : "(空)"
                      )}
                    </div>
                    <div className="text-xs text-theme-text-secondary mt-3">
                      提示：不选择 AI 员工时，默认使用 workspace
                      运行时默认权限（通常为 default）。
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-5 rounded-xl bg-theme-bg-secondary border-2 border-theme-sidebar-border">
                <h3 className="text-lg font-bold text-theme-text-primary mb-3">
                  绑定（Workspace / AI 员工）
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-theme-bg-container rounded-lg p-4">
                    <div className="text-sm font-semibold text-theme-text-primary mb-2">
                      Workspace 绑定
                    </div>
                    <div className="text-sm text-theme-text-secondary">
                      状态：{workspaceBound ? "已绑定" : "未绑定"}
                    </div>
                    <div className="mt-3">
                      {workspaceBound ? (
                        <Button
                          onClick={handleUninstallWorkspace}
                          size="sm"
                          variant="danger"
                        >
                          解绑 Workspace
                        </Button>
                      ) : (
                        <Button onClick={handleInstallWorkspace} size="sm">
                          安装到 Workspace
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="bg-theme-bg-container rounded-lg p-4">
                    <div className="text-sm font-semibold text-theme-text-primary mb-2">
                      AI 员工绑定（assistant scope）
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        value={assistantId}
                        onChange={(e) => setAssistantId(String(e.target.value))}
                        className="flex-grow bg-theme-settings-input-bg text-theme-text-primary text-sm rounded-lg focus:outline-primary-button outline-none border-none p-2.5"
                      >
                        <option value="">（不选择）</option>
                        {(assistants || []).map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.instanceName || a.template?.name || a.id}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="text-sm text-theme-text-secondary mt-2">
                      状态：
                      {assistantId
                        ? assistantBound
                          ? "已绑定"
                          : "未绑定"
                        : "未选择"}
                    </div>
                    <div className="mt-3">
                      {assistantBound ? (
                        <Button
                          onClick={handleUnbindAssistant}
                          disabled={!assistantId}
                          size="sm"
                          variant="danger"
                        >
                          解绑此 AI 员工
                        </Button>
                      ) : (
                        <Button
                          variant="sidebar"
                          onClick={handleBindAssistant}
                          disabled={!assistantId}
                          size="sm"
                        >
                          绑定到此 AI 员工
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {configFields.length > 0 && (
                <div className="p-5 rounded-xl bg-theme-bg-secondary border-2 border-theme-sidebar-border">
                  <h3 className="text-lg font-bold text-theme-text-primary mb-3">
                    配置
                  </h3>
                  <div className="space-y-4">
                    {configFields.map((f) => {
                      const key = String(f?.key || "").trim();
                      if (!key) return null;
                      const type = String(f?.type || "string").toLowerCase();
                      const label = String(f?.label || key);
                      const description = f?.description
                        ? String(f.description)
                        : "";
                      const required = f?.required === true;
                      const value = configDraft?.[key];

                      const commonLabel = (
                        <div className="flex items-center gap-2">
                          <div className="text-sm font-semibold text-theme-text-primary">
                            {label}
                          </div>
                          {required && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-red-500/10 text-red-400">
                              必填
                            </span>
                          )}
                        </div>
                      );

                      return (
                        <div
                          key={key}
                          className="bg-theme-bg-container rounded-lg p-4"
                        >
                          {commonLabel}
                          {description && (
                            <div className="text-xs text-theme-text-secondary mt-1">
                              {description}
                            </div>
                          )}

                          <div className="mt-3">
                            {type === "boolean" ? (
                              <label className="flex items-center gap-2 text-sm text-theme-text-primary">
                                <input
                                  type="checkbox"
                                  checked={value === true}
                                  onChange={(e) =>
                                    setConfigDraft((prev) => ({
                                      ...(prev || {}),
                                      [key]: e.target.checked,
                                    }))
                                  }
                                />
                                {value === true ? "启用" : "关闭"}
                              </label>
                            ) : type === "select" ? (
                              <select
                                value={value ?? ""}
                                onChange={(e) =>
                                  setConfigDraft((prev) => ({
                                    ...(prev || {}),
                                    [key]: e.target.value,
                                  }))
                                }
                                className="w-full bg-theme-settings-input-bg text-theme-text-primary text-sm rounded-lg focus:outline-primary-button outline-none border-none p-2.5"
                              >
                                <option value="">（请选择）</option>
                                {(f.options || []).map((opt) => (
                                  <option key={opt.value} value={opt.value}>
                                    {opt.label || opt.value}
                                  </option>
                                ))}
                              </select>
                            ) : type === "multiselect" ? (
                              <select
                                multiple
                                value={Array.isArray(value) ? value : []}
                                onChange={(e) => {
                                  const selected = Array.from(e.target.options)
                                    .filter((o) => o.selected)
                                    .map((o) => o.value);
                                  setConfigDraft((prev) => ({
                                    ...(prev || {}),
                                    [key]: selected,
                                  }));
                                }}
                                className="w-full bg-theme-settings-input-bg text-theme-text-primary text-sm rounded-lg focus:outline-primary-button outline-none border-none p-2.5"
                              >
                                {(f.options || []).map((opt) => (
                                  <option key={opt.value} value={opt.value}>
                                    {opt.label || opt.value}
                                  </option>
                                ))}
                              </select>
                            ) : type === "number" ? (
                              <input
                                type="number"
                                value={value ?? ""}
                                onChange={(e) =>
                                  setConfigDraft((prev) => ({
                                    ...(prev || {}),
                                    [key]: e.target.value,
                                  }))
                                }
                                className="w-full bg-theme-settings-input-bg text-theme-text-primary text-sm rounded-lg focus:outline-primary-button outline-none border-none p-2.5"
                              />
                            ) : type === "password" ? (
                              <input
                                type="password"
                                value={value ?? ""}
                                onChange={(e) =>
                                  setConfigDraft((prev) => ({
                                    ...(prev || {}),
                                    [key]: e.target.value,
                                  }))
                                }
                                className="w-full bg-theme-settings-input-bg text-theme-text-primary text-sm rounded-lg focus:outline-primary-button outline-none border-none p-2.5"
                              />
                            ) : type === "json" ? (
                              <textarea
                                rows={5}
                                value={
                                  typeof value === "string"
                                    ? value
                                    : value
                                      ? JSON.stringify(value, null, 2)
                                      : ""
                                }
                                onChange={(e) =>
                                  setConfigDraft((prev) => ({
                                    ...(prev || {}),
                                    [key]: e.target.value,
                                  }))
                                }
                                className="w-full bg-theme-settings-input-bg text-theme-text-primary text-sm rounded-lg focus:outline-primary-button outline-none border-none p-2.5 font-mono"
                                placeholder='例如：{"foo":"bar"}'
                              />
                            ) : (
                              <input
                                type={type === "url" ? "url" : "text"}
                                value={value ?? ""}
                                onChange={(e) =>
                                  setConfigDraft((prev) => ({
                                    ...(prev || {}),
                                    [key]: e.target.value,
                                  }))
                                }
                                className="w-full bg-theme-settings-input-bg text-theme-text-primary text-sm rounded-lg focus:outline-primary-button outline-none border-none p-2.5"
                              />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {isManager && (
                    <div className="mt-4 flex items-center justify-end">
                      <Button
                        onClick={handleSaveConfig}
                        disabled={savingConfig}
                        loading={savingConfig}
                        size="sm"
                      >
                        {savingConfig ? "保存中..." : "保存配置"}
                      </Button>
                    </div>
                  )}
                </div>
              )}

              <div className="p-5 rounded-xl bg-theme-bg-secondary border-2 border-theme-sidebar-border">
                <h3 className="text-lg font-bold text-theme-text-primary mb-3">
                  System Prompt / 内容
                </h3>
                <pre className="whitespace-pre-wrap text-sm text-theme-text-primary bg-theme-bg-container rounded-lg p-4 overflow-x-auto">
                  {skill.systemPrompt || ""}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>

      <ModalWrapper isOpen={upgradeOpen}>
        <div className="bg-theme-bg-secondary border-2 border-theme-sidebar-border rounded-xl w-[min(900px,92vw)] max-h-[90vh] overflow-hidden shadow-2xl">
          <div className="flex items-center justify-between px-5 py-4 border-b border-theme-border">
            <div className="min-w-0">
              <div className="text-lg font-bold text-theme-text-primary truncate">
                升级预览
              </div>
              <div className="text-xs text-theme-text-secondary mt-1 break-all">
                {skillId}
              </div>
            </div>
            <button
              onClick={() => setUpgradeOpen(false)}
              className="p-2 rounded-lg bg-theme-sidebar-item-default hover:bg-theme-sidebar-item-hover text-white/90 transition-all"
              title="关闭"
            >
              <X size={18} />
            </button>
          </div>

          <div className="p-5 overflow-y-auto max-h-[70vh] space-y-4">
            {!upgradePreview && (
              <div className="text-theme-text-secondary text-sm">加载中...</div>
            )}

            {upgradePreview && (
              <>
                <div className="text-sm space-y-2">
                  {row("Old Hash", upgradePreview.oldHash || "-")}
                  {row("New Hash", upgradePreview.newHash || "-")}
                  {row(
                    "Would Update",
                    upgradePreview?.changes?.wouldUpdate ? "Yes" : "No"
                  )}
                  {row(
                    "Risk",
                    `${upgradePreview?.changes?.risk?.level || "unknown"}${
                      (upgradePreview?.changes?.risk?.flags || []).length
                        ? ` (${upgradePreview.changes.risk.flags.join(", ")})`
                        : ""
                    }`
                  )}
                </div>

                <div className="text-sm">
                  <div className="font-semibold text-theme-text-primary mb-2">
                    Tools Diff
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(upgradePreview?.changes?.tools?.added || []).map((t) => (
                      <span
                        key={`add-${t}`}
                        className="px-2 py-1 text-xs rounded-md bg-green-500/10 text-green-400 font-medium"
                      >
                        + {t}
                      </span>
                    ))}
                    {(upgradePreview?.changes?.tools?.removed || []).map(
                      (t) => (
                        <span
                          key={`rm-${t}`}
                          className="px-2 py-1 text-xs rounded-md bg-red-500/10 text-red-400 font-medium"
                        >
                          - {t}
                        </span>
                      )
                    )}
                    {(upgradePreview?.changes?.tools?.added || []).length ===
                      0 &&
                      (upgradePreview?.changes?.tools?.removed || []).length ===
                        0 && (
                        <span className="text-theme-text-secondary text-sm">
                          (无变更)
                        </span>
                      )}
                  </div>
                </div>

                <div className="text-sm">
                  <div className="font-semibold text-theme-text-primary mb-2">
                    Frontmatter Changes
                  </div>
                  <div className="space-y-2">
                    {Object.entries(
                      upgradePreview?.changes?.frontmatter?.changed || {}
                    ).map(([k, v]) => (
                      <div key={k} className="text-theme-text-secondary">
                        <div className="text-theme-text-primary font-medium">
                          {k}
                        </div>
                        <pre className="whitespace-pre-wrap text-xs bg-theme-bg-container rounded-lg p-3 overflow-x-auto">
                          {JSON.stringify(v, null, 2)}
                        </pre>
                      </div>
                    ))}
                    {Object.keys(
                      upgradePreview?.changes?.frontmatter?.changed || {}
                    ).length === 0 && (
                      <span className="text-theme-text-secondary text-sm">
                        (无)
                      </span>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="px-5 py-4 border-t border-theme-border flex items-center justify-end gap-2">
            <Button onClick={() => setUpgradeOpen(false)} variant="sidebar">
              取消
            </Button>
            <Button
              onClick={runUpgrade}
              disabled={
                upgradeBusy || upgradePreview?.changes?.wouldUpdate !== true
              }
              loading={upgradeBusy}
            >
              {upgradeBusy ? "升级中..." : "确认升级"}
            </Button>
          </div>
        </div>
      </ModalWrapper>
    </div>
  );
}
