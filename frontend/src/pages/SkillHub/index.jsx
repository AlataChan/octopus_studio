import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { isMobile } from "react-device-detect";
import {
  ArrowClockwise,
  Plus,
  PuzzlePiece,
  Robot,
} from "@phosphor-icons/react";

import Sidebar from "@/components/Sidebar";
import Button from "@/components/Button";
import useUser from "@/hooks/useUser";
import paths from "@/utils/paths";
import showToast from "@/utils/toast";
import Workspace from "@/models/workspace";
import SkillHub from "@/models/skillHub";
import WorkspaceAssistant from "@/models/workspaceAssistant";
import System from "@/models/system";

import SearchBar from "./components/SearchBar";
import CategoryFilter from "./components/CategoryFilter";
import SkillGrid from "./components/SkillGrid";
import SkillCard from "./components/SkillCard";
import MissionControl from "./MissionControl";
import ModalWrapper from "@/components/ModalWrapper";
import { X } from "@phosphor-icons/react";

export default function SkillHubPage() {
  const navigate = useNavigate();
  const { user } = useUser();
  const [multiUserMode, setMultiUserMode] = useState(null);
  const role = String(user?.role || "");
  const isManager =
    multiUserMode === false || role === "admin" || role === "manager";

  const [activeTab, setActiveTab] = useState("discover"); // discover | my | mission
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [source, setSource] = useState("all"); // all | local | external | community
  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);

  const [workspaces, setWorkspaces] = useState([]);
  const [workspaceId, setWorkspaceId] = useState(null);
  const [installedIds, setInstalledIds] = useState(new Set());
  const [installations, setInstallations] = useState([]);
  const [skillById, setSkillById] = useState({});
  const [assistants, setAssistants] = useState([]);

  const [busy, setBusy] = useState(new Set());

  const currentWorkspace = useMemo(() => {
    if (!workspaceId) return null;
    return (workspaces || []).find((w) => w.id === workspaceId) || null;
  }, [workspaces, workspaceId]);

  const normalizedItems = useMemo(() => {
    if (!Array.isArray(items)) return [];
    return items;
  }, [items]);

  const loadWorkspaces = async () => {
    const ws = await Workspace.all();
    setWorkspaces(ws || []);
    if ((ws || []).length > 0) setWorkspaceId(ws[0].id);
  };

  const loadInstalled = async (targetWorkspaceId) => {
    if (!targetWorkspaceId) return;
    const res = await SkillHub.getInstalled(targetWorkspaceId);
    if (!res?.success) return;
    const ids = new Set((res.installations || []).map((r) => r.skillId));
    setInstalledIds(ids);
    setInstallations(res.installations || []);
    setSkillById(res.skillById || {});
  };

  const loadAssistants = async (workspaceSlug) => {
    if (!workspaceSlug) return;
    const res = await WorkspaceAssistant.list(workspaceSlug);
    if (!res?.success) return;
    setAssistants(res?.data?.assistants || []);
  };

  const loadCategories = async () => {
    const res = await SkillHub.getCategories();
    if (res?.success) setCategories(res.categories || []);
  };

  const loadDiscover = async () => {
    setLoading(true);
    try {
      if (query.trim()) {
        const res = await SkillHub.search(query.trim(), { topN: 50, source });
        if (!res?.success) throw new Error(res?.error || "搜索失败");
        const merged = [
          ...(res.local || []).map((s) => ({ ...s, _source: "local" })),
          ...(res.external || []).map((s) => ({ ...s, _source: "external" })),
          ...(res.community || []).map((s) => ({ ...s, _source: "community" })),
        ];
        setItems(merged);
      } else {
        const res = await SkillHub.discover({
          category: category || undefined,
          source: source === "all" ? undefined : source,
          page: 1,
          limit: 60,
        });
        if (!res?.success) throw new Error(res?.error || "加载失败");
        setItems(res.items || []);
      }
    } catch (error) {
      showToast(error.message || "加载失败", "error");
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    System.keys().then((settings) => {
      setMultiUserMode(settings?.MultiUserMode ?? true);
    });
    loadWorkspaces();
    loadCategories();
  }, []);

  useEffect(() => {
    if (!workspaceId) return;
    loadInstalled(workspaceId);
  }, [workspaceId]);

  useEffect(() => {
    if (!currentWorkspace?.slug) return;
    loadAssistants(currentWorkspace.slug);
  }, [currentWorkspace?.slug]);

  useEffect(() => {
    if (activeTab !== "discover") return;
    loadDiscover();
  }, [query, category, source, activeTab]);

  const withBusy = async (skillId, fn) => {
    setBusy((prev) => new Set(prev).add(skillId));
    try {
      await fn();
    } finally {
      setBusy((prev) => {
        const next = new Set(prev);
        next.delete(skillId);
        return next;
      });
    }
  };

  const handleInstall = async (skill) => {
    if (!workspaceId) {
      showToast("请先选择 Workspace", "warning");
      return;
    }

    await withBusy(skill.skillId, async () => {
      const res = await SkillHub.install({
        skillId: skill.skillId,
        workspaceId,
      });
      if (!res?.success) throw new Error(res?.error || "安装失败");
      showToast(`已安装: ${res.skillId}`, "success");
      await loadInstalled(workspaceId);
    }).catch((e) => showToast(e.message || "安装失败", "error"));
  };

  const handleUninstall = async (skill) => {
    if (!workspaceId) {
      showToast("请先选择 Workspace", "warning");
      return;
    }

    await withBusy(skill.skillId, async () => {
      const res = await SkillHub.uninstall({
        skillId: skill.skillId,
        workspaceId,
      });
      if (!res?.success) throw new Error(res?.error || "卸载失败");
      showToast("已卸载/解绑", "success");
      await loadInstalled(workspaceId);
    }).catch((e) => showToast(e.message || "卸载失败", "error"));
  };

  const handleRefreshRegistry = async () => {
    const res = await SkillHub.refreshRegistry();
    if (!res?.success) {
      showToast(res?.error || "刷新失败", "error");
      return;
    }
    const communityCount =
      res?.communityCount !== undefined
        ? `, community: ${res.communityCount}`
        : "";
    showToast(`外部索引已刷新: ${res.count}${communityCount}`, "success");
    await loadDiscover();
  };

  const installationCount = (installations || []).length;
  const currentList = activeTab === "my" ? installations : normalizedItems;

  const assistantsById = useMemo(() => {
    const map = new Map();
    for (const a of assistants || []) {
      map.set(String(a.id), a);
    }
    return map;
  }, [assistants]);

  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [upgradeBusy, setUpgradeBusy] = useState(false);
  const [upgradePreview, setUpgradePreview] = useState(null);
  const [upgradeSkillId, setUpgradeSkillId] = useState(null);

  const openUpgradePreview = async (skillId) => {
    setUpgradeBusy(true);
    try {
      const res = await SkillHub.upgrade(skillId, { dryRun: true });
      if (!res?.success) throw new Error(res?.error || "预览失败");
      setUpgradeSkillId(skillId);
      setUpgradePreview(res.result);
      setUpgradeOpen(true);
    } catch (error) {
      showToast(error.message || "预览失败", "error");
    } finally {
      setUpgradeBusy(false);
    }
  };

  const runUpgrade = async () => {
    if (!upgradeSkillId) return;
    setUpgradeBusy(true);
    try {
      const res = await SkillHub.upgrade(upgradeSkillId, { dryRun: false });
      if (!res?.success) throw new Error(res?.error || "升级失败");
      showToast(
        res?.result?.upgraded ? "升级完成" : "无需升级（已是最新）",
        "success"
      );
      setUpgradeOpen(false);
      await loadInstalled(workspaceId);
      await loadDiscover();
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
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
            <div className="flex items-center gap-3">
              <PuzzlePiece
                size={32}
                weight="fill"
                className="text-theme-accent-primary"
              />
              <h1 className="text-2xl md:text-3xl font-bold text-theme-text-primary">
                技能中心
              </h1>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {isManager && (
                <>
                  <Button
                    onClick={() => navigate(paths.skillHubCreate())}
                    className="whitespace-nowrap"
                  >
                    <Plus size={18} weight="bold" />
                    <span className="text-sm md:text-base">创建</span>
                  </Button>
                  <Button
                    className="whitespace-nowrap"
                    onClick={() => navigate(paths.skillHubAutobot())}
                    variant="sidebar"
                  >
                    <Robot size={18} weight="fill" />
                    <span className="text-sm md:text-base">Autobot</span>
                  </Button>
                  <Button
                    variant="sidebar"
                    iconOnly
                    onClick={handleRefreshRegistry}
                    title="刷新外部索引"
                  >
                    <ArrowClockwise size={18} />
                  </Button>
                </>
              )}
            </div>
          </div>

          <p className="text-theme-text-secondary text-sm md:text-base mb-4">
            发现、安装并管理 Skills（本地 + 外部索引）
          </p>

          <div className="flex flex-col md:flex-row gap-4">
            <SearchBar
              value={query}
              onChange={setQuery}
              placeholder="搜索 Skill 名称/描述/标签..."
            />
            <CategoryFilter
              value={category}
              onChange={setCategory}
              categories={categories}
            />
            <div className="flex items-center gap-2 min-w-[180px]">
              <span className="text-xs text-theme-text-secondary whitespace-nowrap">
                Source
              </span>
              <select
                value={source}
                onChange={(e) => setSource(String(e.target.value))}
                className="flex-grow bg-theme-settings-input-bg text-theme-text-primary text-sm rounded-lg focus:outline-primary-button outline-none border-none p-2.5"
              >
                <option value="all">all</option>
                <option value="local">local</option>
                <option value="external">external</option>
                <option value="community">community</option>
              </select>
            </div>
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
          </div>

          <div className="mt-4 flex items-center gap-2">
            <button
              onClick={() => setActiveTab("discover")}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === "discover"
                  ? "bg-theme-accent-primary/10 text-theme-accent-primary"
                  : "bg-theme-sidebar-item-default text-white/80 hover:text-theme-text-primary hover:bg-theme-sidebar-item-hover"
              }`}
            >
              Discover
            </button>
            <button
              onClick={() => setActiveTab("my")}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === "my"
                  ? "bg-theme-accent-primary/10 text-theme-accent-primary"
                  : "bg-theme-sidebar-item-default text-white/80 hover:text-theme-text-primary hover:bg-theme-sidebar-item-hover"
              }`}
            >
              My Skills
            </button>
            {isManager && (
              <button
                onClick={() => setActiveTab("mission")}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  activeTab === "mission"
                    ? "bg-theme-accent-primary/10 text-theme-accent-primary"
                    : "bg-theme-sidebar-item-default text-white/80 hover:text-theme-text-primary hover:bg-theme-sidebar-item-hover"
                }`}
              >
                Mission
              </button>
            )}
            <span className="ml-auto text-sm text-theme-text-secondary">
              {loading
                ? "加载中..."
                : activeTab === "my"
                  ? `共 ${installationCount} 个绑定`
                  : activeTab === "mission"
                    ? "Ops"
                    : `共 ${currentList.length} 项`}
            </span>
          </div>
        </div>

        {activeTab === "discover" && (
          <SkillGrid>
            {loading &&
              Array.from({ length: 6 }).map((_, idx) => (
                <div
                  key={idx}
                  className="bg-theme-bg-secondary border-2 border-theme-sidebar-border rounded-xl p-5 h-[220px] animate-pulse"
                />
              ))}

            {!loading &&
              currentList.map((skill) => {
                const isInstalled = installedIds.has(skill.skillId);
                return (
                  <SkillCard
                    key={skill.skillId}
                    skill={skill}
                    installed={isInstalled}
                    installing={busy.has(skill.skillId)}
                    uninstalling={busy.has(skill.skillId)}
                    onView={() => navigate(paths.skillHubSkill(skill.skillId))}
                    onInstall={() => handleInstall(skill)}
                    onUninstall={() => handleUninstall(skill)}
                  />
                );
              })}
          </SkillGrid>
        )}

        {activeTab === "my" && (
          <div className="p-4 md:p-8 space-y-6">
            {installations.length === 0 && (
              <div className="text-theme-text-secondary text-sm">
                当前 Workspace 暂无任何 Skill 绑定。
              </div>
            )}

            {(() => {
              const workspaceRows = (installations || []).filter(
                (r) => r?.scopeType === "workspace"
              );
              const assistantRows = (installations || []).filter(
                (r) => r?.scopeType === "assistant"
              );

              const assistantGroups = assistantRows.reduce((acc, r) => {
                const key = String(r?.scopeId || "");
                if (!key) return acc;
                acc[key] = acc[key] || [];
                acc[key].push(r);
                return acc;
              }, {});

              const renderStatusBadges = (skill) => {
                const badges = [];
                if (skill?.enabled === false) {
                  badges.push(
                    <span
                      key="disabled"
                      className="text-xs px-2 py-0.5 rounded-md bg-white/5 text-theme-text-secondary"
                    >
                      disabled
                    </span>
                  );
                }
                if (String(skill?.status || "") === "outdated") {
                  badges.push(
                    <span
                      key="outdated"
                      className="text-xs px-2 py-0.5 rounded-md bg-orange-500/10 text-orange-400"
                    >
                      outdated
                    </span>
                  );
                }
                if (String(skill?.validationStatus || "") === "invalid") {
                  badges.push(
                    <span
                      key="invalid"
                      className="text-xs px-2 py-0.5 rounded-md bg-red-500/10 text-red-400"
                    >
                      invalid
                    </span>
                  );
                }
                if (String(skill?.validationStatus || "") === "valid") {
                  badges.push(
                    <span
                      key="valid"
                      className="text-xs px-2 py-0.5 rounded-md bg-green-500/10 text-green-400"
                    >
                      valid
                    </span>
                  );
                }
                return badges;
              };

              const renderRow = (installation) => {
                const skill = skillById?.[installation.skillId] || {};
                const displayName = skill?.name || installation.skillId;
                const icon = skill?.icon || "🧩";
                const sourceType = String(skill?.sourceType || "local");

                const isUpgradeable =
                  isManager &&
                  String(installation.skillId || "").startsWith("custom:") &&
                  ["github", "registry"].includes(
                    String(skill?.sourceType || "").toLowerCase()
                  );

                const actionKey = `${installation.skillId}:${installation.scopeType}:${installation.scopeId}`;

                const scopeLabel =
                  installation.scopeType === "assistant"
                    ? `assistant:${installation.scopeId}`
                    : "workspace";

                return (
                  <div
                    key={`${installation.skillId}-${installation.scopeType}-${installation.scopeId}`}
                    className="bg-theme-bg-secondary border-2 border-theme-sidebar-border rounded-xl p-5 flex flex-col md:flex-row md:items-center gap-4"
                  >
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className="w-12 h-12 rounded-xl bg-theme-accent-primary/10 flex items-center justify-center text-2xl shrink-0">
                        {icon}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="text-base font-bold text-theme-text-primary truncate">
                            {displayName}
                          </div>
                          <span className="text-xs px-2 py-0.5 rounded-md bg-theme-accent-primary/10 text-theme-accent-primary font-medium">
                            {sourceType}
                          </span>
                          <span className="text-xs px-2 py-0.5 rounded-md bg-theme-bg-container text-theme-text-secondary">
                            {scopeLabel}
                          </span>
                          {renderStatusBadges(skill)}
                        </div>
                        <div className="text-xs text-theme-text-secondary mt-1 break-all">
                          {installation.skillId}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap justify-end">
                      <Button
                        variant="sidebar"
                        onClick={() =>
                          navigate(paths.skillHubSkill(installation.skillId))
                        }
                        size="sm"
                      >
                        详情
                      </Button>

                      {isManager && (
                        <Button
                          variant="sidebar"
                          onClick={async () => {
                            await withBusy(
                              `validate:${installation.skillId}`,
                              async () => {
                                const res = await SkillHub.validate(
                                  installation.skillId
                                );
                                if (!res?.success)
                                  throw new Error(res?.error || "校验失败");
                                showToast(
                                  res?.result?.valid
                                    ? "校验通过"
                                    : "校验未通过",
                                  res?.result?.valid ? "success" : "warning"
                                );
                                await loadInstalled(workspaceId);
                              }
                            ).catch((e) =>
                              showToast(e.message || "校验失败", "error")
                            );
                          }}
                          disabled={busy.has(
                            `validate:${installation.skillId}`
                          )}
                          size="sm"
                          title="校验"
                        >
                          校验
                        </Button>
                      )}

                      {isUpgradeable && (
                        <Button
                          variant="sidebar"
                          onClick={() =>
                            openUpgradePreview(installation.skillId)
                          }
                          disabled={upgradeBusy}
                          size="sm"
                        >
                          升级
                        </Button>
                      )}

                      <Button
                        onClick={async () => {
                          await withBusy(actionKey, async () => {
                            const res = await SkillHub.uninstall({
                              skillId: installation.skillId,
                              workspaceId,
                              assistantId:
                                installation.scopeType === "assistant"
                                  ? installation.scopeId
                                  : undefined,
                            });
                            if (!res?.success)
                              throw new Error(res?.error || "解绑失败");
                            showToast("已解绑", "success");
                            await loadInstalled(workspaceId);
                          }).catch((e) =>
                            showToast(e.message || "解绑失败", "error")
                          );
                        }}
                        disabled={busy.has(actionKey)}
                        size="sm"
                        title="解绑"
                        variant="danger"
                      >
                        解绑
                      </Button>
                    </div>
                  </div>
                );
              };

              return (
                <>
                  {workspaceRows.length > 0 && (
                    <div className="space-y-3">
                      <div className="text-lg font-bold text-theme-text-primary">
                        Workspace 绑定
                      </div>
                      {workspaceRows.map(renderRow)}
                    </div>
                  )}

                  {Object.keys(assistantGroups).length > 0 && (
                    <div className="space-y-4">
                      <div className="text-lg font-bold text-theme-text-primary">
                        AI 员工绑定
                      </div>
                      {Object.entries(assistantGroups).map(([aid, rows]) => {
                        const assistant = assistantsById.get(String(aid));
                        const assistantName =
                          assistant?.instanceName ||
                          assistant?.template?.name ||
                          aid;
                        return (
                          <div key={aid} className="space-y-3">
                            <div className="text-sm text-theme-text-secondary">
                              {assistantName}
                            </div>
                            {(rows || []).map(renderRow)}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        )}

        {activeTab === "mission" && isManager && (
          <MissionControl
            workspaceId={workspaceId}
            skillById={skillById}
            assistants={assistants}
            installations={installations}
          />
        )}
      </div>

      <ModalWrapper isOpen={upgradeOpen}>
        <div className="bg-theme-bg-secondary border-2 border-theme-sidebar-border rounded-xl w-[min(900px,92vw)] max-h-[90vh] overflow-hidden shadow-2xl">
          <div className="flex items-center justify-between px-5 py-4 border-b border-theme-border">
            <div className="min-w-0">
              <div className="text-lg font-bold text-theme-text-primary truncate">
                升级预览
              </div>
              <div className="text-xs text-theme-text-secondary mt-1 break-all">
                {upgradeSkillId || ""}
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
                  <div className="flex items-start gap-2 text-sm">
                    <span className="w-28 shrink-0 text-theme-text-secondary">
                      Old Hash
                    </span>
                    <span className="text-theme-text-primary break-words">
                      {upgradePreview.oldHash || "-"}
                    </span>
                  </div>
                  <div className="flex items-start gap-2 text-sm">
                    <span className="w-28 shrink-0 text-theme-text-secondary">
                      New Hash
                    </span>
                    <span className="text-theme-text-primary break-words">
                      {upgradePreview.newHash || "-"}
                    </span>
                  </div>
                  <div className="flex items-start gap-2 text-sm">
                    <span className="w-28 shrink-0 text-theme-text-secondary">
                      Would Update
                    </span>
                    <span className="text-theme-text-primary break-words">
                      {upgradePreview?.changes?.wouldUpdate ? "Yes" : "No"}
                    </span>
                  </div>
                  <div className="flex items-start gap-2 text-sm">
                    <span className="w-28 shrink-0 text-theme-text-secondary">
                      Risk
                    </span>
                    <span className="text-theme-text-primary break-words">
                      {`${upgradePreview?.changes?.risk?.level || "unknown"}${
                        (upgradePreview?.changes?.risk?.flags || []).length
                          ? ` (${upgradePreview.changes.risk.flags.join(", ")})`
                          : ""
                      }`}
                    </span>
                  </div>
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
