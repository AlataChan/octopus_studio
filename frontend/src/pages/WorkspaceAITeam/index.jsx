import React, { useState, useEffect, useRef, useCallback } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import Sidebar from "@/components/Sidebar";
import AITeam from "@/models/aiTeam";
import Molt from "@/models/molt";
import paths from "@/utils/paths";
import {
  ArrowLeft,
  Users,
  ChatCircle,
  FileText,
  TrendUp,
  Sparkle,
  ArrowRight,
  CaretDown,
  CaretUp,
  Buildings,
  PencilSimple,
  Gear,
} from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import cytoscape from "cytoscape";
import fcose from "cytoscape-fcose";
import PerformanceStats from "@/components/PerformanceStats";
import AssistantDetail from "@/components/AssistantDetail";

// 注册 fcose 布局（防止重复注册）
if (!cytoscape.prototype.fcoseRegistered) {
  cytoscape.use(fcose);
  cytoscape.prototype.fcoseRegistered = true;
}

const AI_TEAM_ROOT_CLASS =
  "ai-team-page w-screen h-screen overflow-hidden bg-page-texture flex";
const AI_TEAM_TOPBAR_CLASS =
  "flex items-center justify-between px-6 py-4 border-b border-theme-sidebar-border bg-theme-bg-sidebar backdrop-blur-md shadow-[0_12px_32px_rgba(0,0,0,0.2)]";
const AI_TEAM_SURFACE_CLASS =
  "rounded-xl border border-theme-sidebar-border bg-theme-bg-secondary shadow-[0_22px_44px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(221,240,255,0.03)]";
const AI_TEAM_PANEL_CLASS =
  "rounded-lg border border-theme-sidebar-border bg-theme-bg-primary shadow-[0_12px_28px_rgba(0,0,0,0.2)]";
const AI_TEAM_SEGMENTED_CLASS =
  "flex items-center gap-1 rounded-lg border border-theme-sidebar-border bg-theme-bg-primary/80 p-1 backdrop-blur-md shadow-[inset_0_1px_0_rgba(221,240,255,0.03)]";
const AI_TEAM_SEGMENTED_ACTIVE_CLASS =
  "bg-primary-button text-[var(--theme-button-primary-text)] shadow-[0_10px_24px_rgba(89,168,246,0.22),0_0_0_1px_rgba(142,197,255,0.35)]";
const AI_TEAM_ACCENT_TONE_CLASS =
  "bg-[var(--theme-accent-soft)] text-[var(--theme-accent-primary)]";
const AI_TEAM_ACCENT_BORDER_CLASS = "border-[var(--theme-accent-border-soft)]";
const AI_TEAM_PERIWINKLE_TONE_CLASS =
  "bg-[var(--theme-accent-secondary-soft)] text-[var(--theme-accent-secondary)]";
const AI_TEAM_PERIWINKLE_BORDER_CLASS =
  "border-[var(--theme-accent-secondary-border)]";
const AI_TEAM_NEUTRAL_TONE_CLASS =
  "bg-[var(--theme-button-sidebar-bg)] text-theme-text-secondary";

function segmentedButtonClass(
  active,
  activeClasses = AI_TEAM_SEGMENTED_ACTIVE_CLASS
) {
  return `px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
    active
      ? activeClasses
      : "text-theme-text-secondary hover:bg-[var(--theme-button-sidebar-hover-bg)] hover:text-theme-text-primary"
  }`;
}

function readThemeColor(variableName, fallback) {
  if (typeof document === "undefined") {
    return fallback;
  }

  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(variableName)
    .trim();

  return value || fallback;
}

export function getMoltAgentId(agent) {
  return agent?.molt_agent_id || agent?.moltAgentId || agent?.id || "";
}

function getMoltAgentDisplayName(agent) {
  return (
    agent?.display_name ||
    agent?.displayName ||
    agent?.name ||
    getMoltAgentId(agent)
  );
}

function isMoltAgentEnabled(agent) {
  return agent?.enabled !== false;
}

function hasMoltOrphanState(agent) {
  return agent?.enabled === false && Boolean(agent?.lastSeenAt);
}

export function formatMoltLastSeen(value, now = new Date()) {
  if (!value) return "";
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "";
  const diffMs = Math.max(0, now.getTime() - timestamp);
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export async function loadWorkspaceMoltAgents({
  slug,
  molt = Molt,
  t = (key) => key,
}) {
  try {
    const response = await molt.workspaceAgents(slug);
    if (response?.success === false) {
      return {
        agents: [],
        moltAvailable:
          typeof response?.moltAvailable === "boolean"
            ? response.moltAvailable
            : true,
        error: response.error || t("molt.aiTeam.fetch_error"),
      };
    }

    return {
      agents: Array.isArray(response?.agents) ? response.agents : [],
      moltAvailable:
        typeof response?.moltAvailable === "boolean"
          ? response.moltAvailable
          : true,
      error: null,
    };
  } catch (error) {
    return {
      agents: [],
      moltAvailable: true,
      error: error?.message || t("molt.aiTeam.fetch_error"),
    };
  }
}

export async function toggleWorkspaceMoltAgent({
  slug,
  agent,
  enabled,
  molt = Molt,
}) {
  const agentId = getMoltAgentId(agent);
  if (!agentId) return { success: false, error: "Missing Molt agent id" };
  return await molt.updateWorkspaceAgent(slug, agentId, { enabled });
}

export async function restoreWorkspaceMoltAgent({ slug, agent, molt = Molt }) {
  const agentId = getMoltAgentId(agent);
  if (!agentId) return { success: false, error: "Missing Molt agent id" };
  return await molt.updateWorkspaceAgent(slug, agentId, { enabled: true });
}

export async function removeWorkspaceMoltAgent({
  slug,
  agent,
  confirm = null,
  molt = Molt,
  t = (key) => key,
}) {
  const agentId = getMoltAgentId(agent);
  if (!agentId) return { success: false, error: "Missing Molt agent id" };

  const shouldRemove =
    confirm ||
    ((message) =>
      typeof window === "undefined" ? false : window.confirm(message));
  if (!shouldRemove(t("molt.aiTeam.remove_confirm"))) {
    return { success: false, cancelled: true };
  }

  return await molt.removeWorkspaceAgent(slug, agentId);
}

export default function WorkspaceAITeam() {
  const { t } = useTranslation();
  const { slug } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState(null);
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [collaborationData, setCollaborationData] = useState(null); // 协作图谱增强数据
  const [selectedView, setSelectedView] = useState("overview"); // overview | graph
  const [graphPeriod, setGraphPeriod] = useState("7d"); // 图谱统计周期

  useEffect(() => {
    fetchData();
  }, [slug]);

  // 当切换到图谱视图或周期变化时，获取协作数据
  useEffect(() => {
    if (selectedView === "graph") {
      fetchCollaborationData();
    }
  }, [selectedView, graphPeriod, slug]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // 获取概览数据
      const overviewRes = await AITeam.getOverview(slug);
      if (overviewRes.success) {
        setOverview(overviewRes.data);
      }

      // 获取图谱数据
      const graphRes = await AITeam.getGraph(slug);
      if (graphRes.success) {
        // 转换为 react-force-graph 格式
        const nodes = graphRes.data.nodes.map((node) => ({
          id: node.nodeId,
          name: node.label,
          type: node.type,
          val: node.rank || 1,
          metadata: node.metadata || {},
        }));

        const links = graphRes.data.edges.map((edge) => ({
          source: edge.fromNodeId,
          target: edge.toNodeId,
          relation: edge.relation,
        }));

        setGraphData({ nodes, links });
      }
    } catch (error) {
      console.error("Error fetching AI team data:", error);
    } finally {
      setLoading(false);
    }
  };

  // 获取协作图谱增强数据
  const fetchCollaborationData = async () => {
    try {
      const res = await AITeam.getCollaborationGraph(slug, {
        period: graphPeriod,
      });
      if (res.success) {
        setCollaborationData(res.data);
      }
    } catch (error) {
      console.error("Error fetching collaboration graph:", error);
    }
  };

  const getNodeColor = (node) => {
    // 【增强】助手节点根据 category 分配不同颜色
    if (node.type === "assistant") {
      const category = node.metadata?.category || "";
      const categoryColors = {
        营销: readThemeColor("--theme-accent-primary", "#59A8F6"),
        研发: "#10b981", // green - 研发
        客服: "#f59e0b", // amber - 客服
        财务: readThemeColor("--theme-accent-secondary", "#B7C3FF"),
        人力资源: "#ec4899", // pink - 人力资源
        运营: "#8EC5FF", // cyan - 运营
        设计: "#f97316", // orange - 设计
      };
      return (
        categoryColors[category] ||
        readThemeColor("--theme-accent-primary", "#59A8F6")
      );
    }

    switch (node.type) {
      case "chat":
        return "#10b981"; // green
      case "doc":
        return "#f59e0b"; // amber
      case "tag":
        return readThemeColor("--theme-accent-secondary", "#B7C3FF");
      default:
        return "#6b7280"; // gray
    }
  };

  return (
    <div className={AI_TEAM_ROOT_CLASS}>
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden relative z-[1]">
        {/* 顶部工具栏 */}
        <div className={AI_TEAM_TOPBAR_CLASS}>
          <div className="flex items-center gap-3">
            {/* 返回按钮 */}
            <button
              onClick={() => navigate(paths.workspace.chat(slug))}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-theme-sidebar-border bg-theme-bg-primary text-theme-text-primary hover:bg-[var(--theme-button-sidebar-hover-bg)] transition-colors whitespace-nowrap"
              title={t("common.back") || "返回"}
            >
              <ArrowLeft size={18} />
              <span className="text-sm font-medium">
                {t("common.back") || "返回"}
              </span>
            </button>
            <div className="h-6 w-px bg-theme-sidebar-border" />
            <h1 className="text-xl font-semibold text-theme-text-primary flex items-center gap-2 whitespace-nowrap">
              <Users size={24} />
              我的团队
            </h1>
            <div className="h-6 w-px bg-theme-sidebar-border" /> {/* 分隔线 */}
            {/* 图谱类型切换 */}
            <div className={AI_TEAM_SEGMENTED_CLASS}>
              <button
                onClick={() => navigate(paths.workspace.graph(slug))}
                className={segmentedButtonClass(false)}
              >
                全局图谱
              </button>
              <button
                className={segmentedButtonClass(
                  true,
                  AI_TEAM_SEGMENTED_ACTIVE_CLASS
                )}
              >
                我的团队
              </button>
            </div>
          </div>

          {/* 视图切换 */}
          <div className={AI_TEAM_SEGMENTED_CLASS}>
            <button
              onClick={() => setSelectedView("overview")}
              className={segmentedButtonClass(
                selectedView === "overview",
                AI_TEAM_SEGMENTED_ACTIVE_CLASS
              )}
            >
              概览
            </button>
            <button
              onClick={() => setSelectedView("graph")}
              className={segmentedButtonClass(
                selectedView === "graph",
                AI_TEAM_SEGMENTED_ACTIVE_CLASS
              )}
            >
              图谱
            </button>
          </div>
        </div>

        {/* 主内容区域 */}
        <div className="flex-1 overflow-auto p-6 bg-[radial-gradient(circle_at_18%_0%,rgba(142,197,255,0.05),transparent_24%),radial-gradient(circle_at_82%_0%,rgba(183,195,255,0.04),transparent_18%)]">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-theme-text-secondary text-lg">加载中...</div>
            </div>
          ) : selectedView === "overview" ? (
            <OverviewView overview={overview} workspaceSlug={slug} />
          ) : (
            <GraphView
              graphData={graphData}
              collaborationData={collaborationData}
              getNodeColor={getNodeColor}
              period={graphPeriod}
              onPeriodChange={setGraphPeriod}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// 概览视图组件
export function OverviewView({ overview, workspaceSlug }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [selectedAssistant, setSelectedAssistant] = useState(null);
  const [showDefaultSection, setShowDefaultSection] = useState(false);
  const [moltAgents, setMoltAgents] = useState([]);
  const [moltAgentsLoading, setMoltAgentsLoading] = useState(false);
  const [moltAgentsError, setMoltAgentsError] = useState(null);
  const [moltOffline, setMoltOffline] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function fetchMoltAgents() {
      if (!workspaceSlug) return;
      setMoltAgentsLoading(true);
      const result = await loadWorkspaceMoltAgents({ slug: workspaceSlug, t });
      if (!isMounted) return;
      setMoltAgents(result.agents);
      setMoltAgentsError(result.error);
      setMoltOffline(result.moltAvailable === false);
      setMoltAgentsLoading(false);
    }

    fetchMoltAgents();
    return () => {
      isMounted = false;
    };
  }, [workspaceSlug, t]);

  if (!overview) {
    return <div className="text-theme-text-secondary">暂无数据</div>;
  }

  // 按来源分组员工
  const groupedAssistants = {
    hired: overview.assistants.filter((a) => a.source === "hired"),
    custom: overview.assistants.filter((a) => a.source === "custom"),
    default: overview.assistants.filter((a) => a.source === "default"),
  };

  const handleToggleMoltAgent = async (agent, enabled) => {
    const result = await toggleWorkspaceMoltAgent({
      slug: workspaceSlug,
      agent,
      enabled,
    });

    if (result?.success === false) {
      setMoltAgentsError(result.error || t("molt.aiTeam.fetch_error"));
      return;
    }

    setMoltAgents((current) =>
      current.map((item) =>
        getMoltAgentId(item) === getMoltAgentId(agent)
          ? { ...item, enabled }
          : item
      )
    );
    setMoltAgentsError(null);
  };

  const handleRemoveMoltAgent = async (agent) => {
    const result = await removeWorkspaceMoltAgent({
      slug: workspaceSlug,
      agent,
      confirm: (message) => window.confirm(message),
      t,
    });

    if (result?.cancelled) return;
    if (result?.success === false) {
      setMoltAgentsError(result.error || t("molt.aiTeam.fetch_error"));
      return;
    }

    setMoltAgents((current) =>
      current.filter((item) => getMoltAgentId(item) !== getMoltAgentId(agent))
    );
    setMoltAgentsError(null);
  };

  const handleRestoreMoltAgent = async (agent) => {
    const result = await restoreWorkspaceMoltAgent({
      slug: workspaceSlug,
      agent,
    });

    if (result?.success === false) {
      setMoltAgentsError(result.error || t("molt.aiTeam.restore_failed"));
      return;
    }

    setMoltAgents((current) =>
      current.map((item) =>
        getMoltAgentId(item) === getMoltAgentId(agent)
          ? { ...item, enabled: true, lastSeenAt: null }
          : item
      )
    );
    setMoltAgentsError(null);
  };

  return (
    <div className="space-y-6">
      {/* P2: 双向导航 - 跳转到人才市场 */}
      <div className={`${AI_TEAM_SURFACE_CLASS} flex items-center gap-2 p-3`}>
        <Sparkle size={20} className="text-amber-500" weight="fill" />
        <span className="text-sm text-theme-text-secondary">
          需要更多 AI 员工？
        </span>
        <button
          onClick={() => navigate(paths.assistantLibrary())}
          className="ml-auto flex items-center gap-1 text-sm text-amber-500 hover:opacity-80 font-medium transition-colors"
        >
          <span>前往人才市场招聘</span>
          <ArrowRight size={16} />
        </button>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          icon={<Users size={24} />}
          title="AI 员工总数"
          value={overview.totalAssistants}
          color="blue"
        />
        <StatCard
          icon={<ChatCircle size={24} />}
          title="总对话数"
          value={overview.totalChats}
          color="green"
        />
        <StatCard
          icon={<FileText size={24} />}
          title="关联文档数"
          value={overview.totalDocuments}
          color="amber"
        />
      </div>

      {/* 性能统计卡片 */}
      <PerformanceStats workspaceSlug={workspaceSlug} />

      <MoltAgentsSection
        agents={moltAgents}
        error={moltAgentsError}
        isLoading={moltAgentsLoading}
        moltOffline={moltOffline}
        onRemove={handleRemoveMoltAgent}
        onRestore={handleRestoreMoltAgent}
        onToggle={handleToggleMoltAgent}
        t={t}
      />

      {/* AI 员工列表 - 按来源分组 */}
      <div className="space-y-6">
        {/* 🏢 外聘员工 */}
        {groupedAssistants.hired.length > 0 && (
          <AssistantGroup
            title="外聘员工"
            subtitle="从人才市场招聘的 AI 员工"
            icon={<Buildings size={20} />}
            assistants={groupedAssistants.hired}
            onSelectAssistant={setSelectedAssistant}
            badgeColor="green"
          />
        )}

        {/* ✏️ 内培员工 */}
        {groupedAssistants.custom.length > 0 && (
          <AssistantGroup
            title="内培员工"
            subtitle="在部门内自定义创建的 AI 员工"
            icon={<PencilSimple size={20} />}
            assistants={groupedAssistants.custom}
            onSelectAssistant={setSelectedAssistant}
            badgeColor="blue"
          />
        )}

        {/* ⚙️ 系统默认 - 可折叠 */}
        {groupedAssistants.default.length > 0 && (
          <div className={`${AI_TEAM_SURFACE_CLASS} overflow-hidden`}>
            <button
              onClick={() => setShowDefaultSection(!showDefaultSection)}
              className="w-full flex items-center justify-between p-4 hover:bg-[var(--theme-button-sidebar-hover-bg)] transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${AI_TEAM_NEUTRAL_TONE_CLASS}`}>
                  <Gear size={20} />
                </div>
                <div className="text-left">
                  <h3 className="text-theme-text-primary font-semibold flex items-center gap-2">
                    系统默认
                    <span className="text-sm font-normal text-theme-text-secondary">
                      ({groupedAssistants.default.length})
                    </span>
                  </h3>
                  <p className="text-theme-text-secondary text-sm">预置员工</p>
                </div>
              </div>
              <div className="text-theme-text-secondary">
                {showDefaultSection ? (
                  <CaretUp size={20} weight="bold" />
                ) : (
                  <CaretDown size={20} weight="bold" />
                )}
              </div>
            </button>
            {showDefaultSection && (
              <div className="p-4 pt-0">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {groupedAssistants.default.map((assistant) => (
                    <AssistantCard
                      key={assistant.id}
                      assistant={assistant}
                      onClick={() => setSelectedAssistant(assistant)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 无员工提示 */}
        {overview.assistants.length === 0 && (
          <div className={`${AI_TEAM_SURFACE_CLASS} p-8 text-center`}>
            <Users
              size={48}
              className="mx-auto text-theme-text-secondary mb-4"
            />
            <h3 className="text-theme-text-primary font-semibold mb-2">
              暂无 AI 员工
            </h3>
            <p className="text-theme-text-secondary mb-4">
              前往人才市场招聘您的第一个 AI 员工
            </p>
            <button
              onClick={() => navigate(paths.assistantLibrary())}
              className="px-4 py-2 bg-primary-button text-[var(--theme-button-primary-text)] rounded-lg hover:opacity-90 transition-opacity"
            >
              前往人才市场
            </button>
          </div>
        )}
      </div>

      {/* 助手详情弹窗 */}
      {selectedAssistant && (
        <AssistantDetail
          workspaceSlug={workspaceSlug}
          assistant={selectedAssistant}
          onClose={() => setSelectedAssistant(null)}
        />
      )}
    </div>
  );
}

export function MoltAgentsSection({
  agents = [],
  error = null,
  isLoading = false,
  moltOffline = false,
  onRemove,
  onRestore,
  onToggle,
  t = (key) => key,
}) {
  return (
    <div className={`${AI_TEAM_SURFACE_CLASS} p-6`}>
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h3 className="text-theme-text-primary font-semibold flex items-center gap-2">
            {t("molt.aiTeam.section_title")}
            <span className="text-sm font-normal text-theme-text-secondary">
              ({agents.length})
            </span>
          </h3>
          <p className="text-theme-text-secondary text-sm">
            {t("molt.aiTeam.empty_hint")}
          </p>
        </div>
        <span
          className={`rounded-full border ${AI_TEAM_ACCENT_BORDER_CLASS} ${AI_TEAM_ACCENT_TONE_CLASS} px-3 py-1 text-xs font-semibold`}
        >
          {t("molt.aiTeam.badge")}
        </span>
      </div>

      {moltOffline && <MoltOfflineBanner t={t} />}

      {isLoading && (
        <div className={`${AI_TEAM_PANEL_CLASS} p-4 text-theme-text-secondary`}>
          {t("molt.aiTeam.loading")}
        </div>
      )}

      {!isLoading && error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
          <p className="font-medium">{t("molt.aiTeam.fetch_error")}</p>
          <p className="mt-1 opacity-80">{error}</p>
        </div>
      )}

      {!isLoading && !error && agents.length === 0 && (
        <div className={`${AI_TEAM_PANEL_CLASS} p-5 text-center`}>
          <p className="font-medium text-theme-text-primary">
            {t("molt.aiTeam.empty")}
          </p>
          <Link
            className="mt-2 inline-flex text-sm font-medium text-[var(--theme-accent-primary)] hover:opacity-80"
            to={paths.settings.sga()}
          >
            {t("molt.aiTeam.empty_hint")}
          </Link>
        </div>
      )}

      {!isLoading && agents.length > 0 && (
        <div className="space-y-3">
          {agents.map((agent) => {
            const agentId = getMoltAgentId(agent);
            const enabled = isMoltAgentEnabled(agent);
            const orphaned = hasMoltOrphanState(agent);
            const lastSeen = formatMoltLastSeen(agent?.lastSeenAt);

            return (
              <div
                className={`${AI_TEAM_PANEL_CLASS} flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between`}
                key={agentId}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full border ${AI_TEAM_ACCENT_BORDER_CLASS} ${AI_TEAM_ACCENT_TONE_CLASS} px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide`}
                    >
                      {t("molt.aiTeam.badge")}
                    </span>
                    <h4 className="truncate font-semibold text-theme-text-primary">
                      {getMoltAgentDisplayName(agent)}
                    </h4>
                    {orphaned && (
                      <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-300">
                        {t("molt.aiTeam.orphan_badge")}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 truncate font-mono text-xs text-theme-text-secondary">
                    {agentId}
                  </p>
                  {orphaned && lastSeen && (
                    <p className="mt-1 text-xs text-theme-text-secondary">
                      {t("molt.aiTeam.last_seen", { time: lastSeen })}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {orphaned ? (
                    <button
                      className={`rounded-lg border ${AI_TEAM_PERIWINKLE_BORDER_CLASS} ${AI_TEAM_PERIWINKLE_TONE_CLASS} px-3 py-1.5 text-xs font-medium transition-colors`}
                      onClick={() => onRestore?.(agent)}
                      type="button"
                    >
                      {t("molt.aiTeam.restore_button")}
                    </button>
                  ) : (
                    <button
                      aria-checked={enabled}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                        enabled
                          ? `${AI_TEAM_ACCENT_BORDER_CLASS} ${AI_TEAM_ACCENT_TONE_CLASS}`
                          : `${AI_TEAM_PERIWINKLE_BORDER_CLASS} ${AI_TEAM_NEUTRAL_TONE_CLASS}`
                      }`}
                      onClick={() => onToggle?.(agent, !enabled)}
                      role="switch"
                      type="button"
                    >
                      {enabled
                        ? t("molt.aiTeam.disable")
                        : t("molt.aiTeam.enable")}
                    </button>
                  )}
                  <button
                    className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-300 transition-colors hover:bg-red-500/15"
                    onClick={() => onRemove?.(agent)}
                    type="button"
                  >
                    {t("molt.aiTeam.remove")}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function MoltOfflineBanner({ t = (key) => key }) {
  return (
    <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
      {t("molt.aiTeam.molt_offline_banner")}
    </div>
  );
}

/**
 * 员工分组组件
 */
function AssistantGroup({
  title,
  subtitle,
  icon,
  assistants,
  onSelectAssistant,
  badgeColor,
}) {
  return (
    <div className={`${AI_TEAM_SURFACE_CLASS} p-6`}>
      <div className="flex items-center gap-3 mb-4">
        <div
          className={`p-2 rounded-lg ${
            badgeColor === "green"
              ? "bg-green-500/20 text-green-500 light:text-green-700"
              : AI_TEAM_ACCENT_TONE_CLASS
          }`}
        >
          {icon}
        </div>
        <div>
          <h3 className="text-theme-text-primary font-semibold flex items-center gap-2">
            {title}
            <span className="text-sm font-normal text-theme-text-secondary">
              ({assistants.length})
            </span>
          </h3>
          <p className="text-theme-text-secondary text-sm">{subtitle}</p>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {assistants.map((assistant) => (
          <AssistantCard
            key={assistant.id}
            assistant={assistant}
            onClick={() => onSelectAssistant(assistant)}
          />
        ))}
      </div>
    </div>
  );
}

// 图谱视图组件 - 使用 Cytoscape.js（增强版：支持协作边、来源/活跃度/类型可视化）
export function GraphView({
  graphData,
  collaborationData,
  getNodeColor,
  period,
  onPeriodChange,
}) {
  const containerRef = useRef(null);
  const cyRef = useRef(null);
  const [hoveredNode, setHoveredNode] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [nodeTypeFilter, setNodeTypeFilter] = useState(
    new Set(["assistant", "chat", "doc"])
  );
  const [showCollaborationEdges, setShowCollaborationEdges] = useState(true); // 是否显示协作边

  // 来源边框颜色映射
  const getSourceBorderColor = (source) => {
    const colors = {
      hired: "#22c55e", // green - 外聘
      custom: readThemeColor("--theme-accent-primary", "#59A8F6"), // mist blue - 内培
      default: "#6b7280", // gray - 预置
    };
    return colors[source] || colors.hired;
  };

  // 计算活跃度对应的节点大小（28-50px）
  const getActivitySize = (activityScore) => {
    const minSize = 28;
    const maxSize = 50;
    // activityScore 范围 0-100，映射到 minSize-maxSize
    const score = Math.min(100, Math.max(0, activityScore || 0));
    return minSize + (maxSize - minSize) * (score / 100);
  };

  // 切换节点类型筛选
  const toggleFilter = useCallback((type) => {
    setNodeTypeFilter((prev) => {
      const newFilter = new Set(prev);
      if (newFilter.has(type)) {
        newFilter.delete(type);
      } else {
        newFilter.add(type);
      }
      return newFilter;
    });
    setSelectedNode(null);
    setHoveredNode(null);
  }, []);

  // 转换数据为 Cytoscape 格式（增强版）
  const transformToCytoscapeElements = useCallback(
    (data, collabData, filter, colorFn) => {
      if (!data || !data.nodes) return [];

      const filteredNodes = data.nodes.filter((n) => filter.has(n.type));
      const nodeIds = new Set(filteredNodes.map((n) => n.id));

      // 从协作数据中获取增强信息
      const collabNodeMap = new Map();
      if (collabData?.nodes) {
        collabData.nodes.forEach((n) => {
          collabNodeMap.set(n.id, n);
        });
      }

      const nodes = filteredNodes.map((node) => {
        // 尝试从协作数据中获取增强信息
        const collabNode = collabNodeMap.get(node.id);
        const source = collabNode?.source || node.metadata?.source || "hired";
        const activityScore = collabNode?.activityScore || 0;
        const category = collabNode?.category || node.metadata?.category || "";

        return {
          data: {
            id: node.id,
            label: node.name,
            type: node.type,
            color: colorFn({
              ...node,
              metadata: { ...node.metadata, category },
            }),
            borderColor:
              node.type === "assistant"
                ? getSourceBorderColor(source)
                : "rgba(255,255,255,0.1)",
            metadata: { ...node.metadata, source, activityScore, category },
            // 助手节点根据活跃度调整大小
            size:
              node.type === "assistant"
                ? getActivitySize(activityScore)
                : node.type === "chat"
                  ? 25
                  : 30,
            source,
            activityScore,
          },
        };
      });

      // 原有边（助手-对话、助手-文档）
      const originalEdges = data.links
        .filter((link) => {
          const sourceId =
            typeof link.source === "object" ? link.source.id : link.source;
          const targetId =
            typeof link.target === "object" ? link.target.id : link.target;
          return nodeIds.has(sourceId) && nodeIds.has(targetId);
        })
        .map((link, index) => {
          const sourceId =
            typeof link.source === "object" ? link.source.id : link.source;
          const targetId =
            typeof link.target === "object" ? link.target.id : link.target;
          return {
            data: {
              id: `edge-${index}`,
              source: sourceId,
              target: targetId,
              relation: link.relation,
            },
          };
        });

      // 协作边（共用会话）
      const collaborationEdges = [];
      if (showCollaborationEdges && collabData?.edges) {
        collabData.edges.forEach((edge, index) => {
          // 后端返回 from/to，前端使用 source/target
          const sourceId = edge.from || edge.source;
          const targetId = edge.to || edge.target;

          // 检查两端节点是否都在筛选后的节点中
          if (nodeIds.has(sourceId) && nodeIds.has(targetId)) {
            collaborationEdges.push({
              data: {
                id: `collab-edge-${index}`,
                source: sourceId,
                target: targetId,
                relation: "co_session",
                sharedThreads: edge.sharedThreads || edge.weight || 1,
                coOccurrenceCount: edge.coOccurrenceCount || 1,
                lastCoOccurrence: edge.lastCoOccurrence,
              },
            });
          }
        });
      }

      return [...nodes, ...originalEdges, ...collaborationEdges];
    },
    [showCollaborationEdges]
  );

  // 初始化和更新 Cytoscape
  useEffect(() => {
    if (!containerRef.current || !graphData || graphData.nodes.length === 0)
      return;

    const elements = transformToCytoscapeElements(
      graphData,
      collaborationData,
      nodeTypeFilter,
      getNodeColor
    );
    if (elements.length === 0) return;

    // 如果已有实例，更新数据
    if (cyRef.current) {
      cyRef.current.elements().remove();
      cyRef.current.add(elements);
      cyRef.current
        .layout({
          name: "fcose",
          animate: true,
          animationDuration: 500,
          quality: "default",
          nodeDimensionsIncludeLabels: true,
          idealEdgeLength: 120,
          nodeRepulsion: 8000,
          edgeElasticity: 0.45,
        })
        .run();
      return;
    }

    // 创建新实例
    cyRef.current = cytoscape({
      container: containerRef.current,
      elements,
      style: getAITeamGraphStyles(),
      layout: {
        name: "fcose",
        animate: false,
        quality: "default",
        nodeDimensionsIncludeLabels: true,
        idealEdgeLength: 120,
        nodeRepulsion: 8000,
        edgeElasticity: 0.45,
      },
      minZoom: 0.2,
      maxZoom: 3,
      wheelSensitivity: 0.3,
    });

    const cy = cyRef.current;

    // 事件处理
    cy.on("tap", "node", (e) => {
      const node = e.target;
      const nodeData = {
        id: node.data("id"),
        name: node.data("label"),
        type: node.data("type"),
        metadata: node.data("metadata"),
        source: node.data("source"),
        activityScore: node.data("activityScore"),
      };

      // 高亮选中节点及其邻居
      cy.elements().removeClass("highlighted dimmed");
      const neighborhood = node.neighborhood().add(node);
      neighborhood.addClass("highlighted");
      cy.elements().not(neighborhood).addClass("dimmed");

      setSelectedNode(nodeData);
    });

    cy.on("tap", (e) => {
      if (e.target === cy) {
        // 点击空白区域取消选中
        cy.elements().removeClass("highlighted dimmed");
        setSelectedNode(null);
        setHoveredNode(null);
      }
    });

    cy.on("mouseover", "node", (e) => {
      const node = e.target;
      setHoveredNode({
        id: node.data("id"),
        name: node.data("label"),
        type: node.data("type"),
        metadata: node.data("metadata"),
        source: node.data("source"),
        activityScore: node.data("activityScore"),
      });
    });

    cy.on("mouseout", "node", () => {
      setHoveredNode(null);
    });

    return () => {
      if (cyRef.current) {
        cyRef.current.destroy();
        cyRef.current = null;
      }
    };
  }, [
    graphData,
    collaborationData,
    nodeTypeFilter,
    getNodeColor,
    transformToCytoscapeElements,
  ]);

  // 当选中节点变化时，同步 UI
  useEffect(() => {
    if (!cyRef.current) return;

    if (!selectedNode) {
      cyRef.current.elements().removeClass("highlighted dimmed");
    }
  }, [selectedNode]);

  if (!graphData || graphData.nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-theme-text-secondary text-lg">暂无图谱数据</div>
      </div>
    );
  }

  return (
    <div className={`${AI_TEAM_SURFACE_CLASS} p-4 h-full relative`}>
      {/* 顶部工具栏 */}
      <div className="absolute top-4 left-4 right-4 flex items-center justify-between z-10">
        {/* 左侧：节点类型筛选 */}
        <div className={AI_TEAM_SEGMENTED_CLASS}>
          <button
            onClick={() => toggleFilter("assistant")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              nodeTypeFilter.has("assistant")
                ? AI_TEAM_SEGMENTED_ACTIVE_CLASS
                : "bg-[var(--theme-button-sidebar-bg)] text-theme-text-secondary hover:bg-[var(--theme-button-sidebar-hover-bg)] hover:text-theme-text-primary"
            }`}
          >
            AI 助手
          </button>
          <button
            onClick={() => toggleFilter("chat")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              nodeTypeFilter.has("chat")
                ? "bg-green-500 text-theme-text-primary"
                : "bg-[var(--theme-button-sidebar-bg)] text-theme-text-secondary hover:bg-[var(--theme-button-sidebar-hover-bg)] hover:text-theme-text-primary"
            }`}
          >
            对话
          </button>
          <button
            onClick={() => toggleFilter("doc")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              nodeTypeFilter.has("doc")
                ? "bg-amber-500 text-theme-text-primary"
                : "bg-[var(--theme-button-sidebar-bg)] text-theme-text-secondary hover:bg-[var(--theme-button-sidebar-hover-bg)] hover:text-theme-text-primary"
            }`}
          >
            文档
          </button>

          <div className="w-px h-6 bg-theme-sidebar-border mx-1" />

          {/* 协作边开关 */}
          <button
            onClick={() => setShowCollaborationEdges(!showCollaborationEdges)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              showCollaborationEdges
                ? "bg-[var(--theme-accent-secondary-soft)] border border-[var(--theme-accent-secondary-border)] text-[var(--theme-accent-secondary)]"
                : "bg-[var(--theme-button-sidebar-bg)] text-theme-text-secondary hover:bg-[var(--theme-button-sidebar-hover-bg)] hover:text-theme-text-primary"
            }`}
          >
            🔗 协作关系
          </button>
        </div>

        {/* 右侧：周期选择 */}
        <div className={AI_TEAM_SEGMENTED_CLASS}>
          {[
            { value: "24h", label: "24小时" },
            { value: "7d", label: "7天" },
            { value: "30d", label: "30天" },
          ].map((opt) => (
            <button
              key={opt.value}
              onClick={() => onPeriodChange(opt.value)}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                period === opt.value
                  ? AI_TEAM_SEGMENTED_ACTIVE_CLASS
                  : "bg-[var(--theme-button-sidebar-bg)] text-theme-text-secondary hover:bg-[var(--theme-button-sidebar-hover-bg)] hover:text-theme-text-primary"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* 图例说明（增强版） */}
      <div className="absolute bottom-4 left-4 bg-theme-bg-primary border border-theme-sidebar-border rounded-lg p-3 shadow-xl z-10 min-w-[200px]">
        <div className="text-theme-text-primary font-semibold mb-3 text-sm">
          图例
        </div>
        <div className="space-y-3 text-xs">
          {/* 边类型 */}
          <div className="space-y-1.5">
            <div className="text-theme-text-secondary text-[10px] uppercase tracking-wider">
              关系类型
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-0.5 bg-[var(--theme-accent-secondary)] rounded"></div>
              <span className="text-theme-text-secondary">共用会话</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-0.5 bg-green-500 rounded"></div>
              <span className="text-theme-text-secondary">处理对话</span>
            </div>
          </div>

          {/* 节点来源 */}
          <div className="space-y-1.5 pt-2 border-t border-theme-sidebar-border">
            <div className="text-theme-text-secondary text-[10px] uppercase tracking-wider">
              员工来源（边框）
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full border-2 border-green-500 bg-theme-bg-secondary"></div>
              <span className="text-theme-text-secondary">外聘</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full border-2 border-[var(--theme-accent-primary)] bg-theme-bg-secondary"></div>
              <span className="text-theme-text-secondary">内培</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full border-2 border-theme-border bg-theme-bg-secondary"></div>
              <span className="text-theme-text-secondary">预置</span>
            </div>
          </div>

          {/* 节点大小 */}
          <div className="space-y-1.5 pt-2 border-t border-theme-sidebar-border">
            <div className="text-theme-text-secondary text-[10px] uppercase tracking-wider">
              节点大小
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-[var(--theme-accent-primary)]"></div>
                <span className="text-theme-text-secondary">→</span>
                <div className="w-4 h-4 rounded-full bg-[var(--theme-accent-primary)]"></div>
              </div>
              <span className="text-theme-text-secondary">活跃度</span>
            </div>
          </div>
        </div>
      </div>
      {/* 悬停信息卡片（增强版） */}
      {hoveredNode && (
        <div className="absolute top-16 right-4 bg-theme-bg-primary border border-theme-sidebar-border rounded-xl p-5 shadow-2xl z-10 min-w-[280px] max-w-[320px]">
          {/* 标题 */}
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="text-theme-text-primary font-bold text-lg mb-1">
                {hoveredNode.name}
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-theme-text-secondary">
                  {hoveredNode.type === "assistant"
                    ? "AI 助手"
                    : hoveredNode.type === "chat"
                      ? "对话"
                      : "文档"}
                </span>
                {/* 来源标签 */}
                {hoveredNode.type === "assistant" && hoveredNode.source && (
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                      hoveredNode.source === "hired"
                        ? "bg-green-500/20 text-green-400"
                        : hoveredNode.source === "custom"
                          ? AI_TEAM_ACCENT_TONE_CLASS
                          : AI_TEAM_NEUTRAL_TONE_CLASS
                    }`}
                  >
                    {hoveredNode.source === "hired"
                      ? "外聘"
                      : hoveredNode.source === "custom"
                        ? "内培"
                        : "预置"}
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={() => setHoveredNode(null)}
              className="text-theme-text-secondary hover:text-theme-text-primary transition-colors"
            >
              ✕
            </button>
          </div>

          {/* 助手节点 */}
          {hoveredNode.type === "assistant" && (
            <div className="space-y-4">
              {/* 活跃度指示器 */}
              {hoveredNode.activityScore !== undefined && (
                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-theme-text-secondary">活跃度</span>
                    <span className="text-theme-text-primary font-medium">
                      {Math.round(hoveredNode.activityScore)}%
                    </span>
                  </div>
                  <div className="h-1.5 bg-[var(--theme-button-sidebar-bg)] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-[var(--theme-accent-primary)] to-[var(--theme-accent-secondary)] rounded-full transition-all"
                      style={{
                        width: `${Math.min(100, hoveredNode.activityScore || 0)}%`,
                      }}
                    />
                  </div>
                </div>
              )}

              {/* 分类标签 */}
              {hoveredNode.metadata?.category && (
                <div>
                  <div className="text-xs text-theme-text-secondary mb-2">
                    分类
                  </div>
                  <span
                    className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${AI_TEAM_ACCENT_TONE_CLASS}`}
                  >
                    {hoveredNode.metadata.category}
                  </span>
                </div>
              )}

              {/* 统计数据 */}
              <div className="grid grid-cols-2 gap-3">
                {hoveredNode.metadata?.chatCount !== undefined && (
                  <div className="bg-[var(--theme-button-sidebar-bg)] border border-theme-sidebar-border rounded-lg p-3">
                    <div className="text-xs text-theme-text-secondary mb-1">
                      对话数
                    </div>
                    <div className="text-2xl font-bold text-green-400">
                      {hoveredNode.metadata.chatCount}
                    </div>
                  </div>
                )}
                {hoveredNode.metadata?.documentCount !== undefined && (
                  <div className="bg-[var(--theme-button-sidebar-bg)] border border-theme-sidebar-border rounded-lg p-3">
                    <div className="text-xs text-theme-text-secondary mb-1">
                      文档数
                    </div>
                    <div className="text-2xl font-bold text-amber-400">
                      {hoveredNode.metadata.documentCount}
                    </div>
                  </div>
                )}
              </div>

              {/* 标签 */}
              {hoveredNode.metadata?.tags &&
                Array.isArray(hoveredNode.metadata.tags) &&
                hoveredNode.metadata.tags.length > 0 && (
                  <div>
                    <div className="text-xs text-theme-text-secondary mb-2">
                      标签
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {hoveredNode.metadata.tags
                        .slice(0, 5)
                        .map((tag, index) => (
                          <span
                            key={index}
                            className="px-2 py-1 bg-[var(--theme-button-sidebar-bg)] text-theme-text-secondary rounded text-xs"
                          >
                            {tag}
                          </span>
                        ))}
                    </div>
                  </div>
                )}

              {/* 技能 */}
              {hoveredNode.metadata?.skills &&
                Array.isArray(hoveredNode.metadata.skills) &&
                hoveredNode.metadata.skills.length > 0 && (
                  <div>
                    <div className="text-xs text-theme-text-secondary mb-2">
                      技能
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {hoveredNode.metadata.skills
                        .slice(0, 3)
                        .map((skill, index) => (
                          <span
                            key={index}
                            className={`px-2 py-1 rounded text-xs font-medium ${AI_TEAM_PERIWINKLE_TONE_CLASS}`}
                          >
                            {skill}
                          </span>
                        ))}
                    </div>
                  </div>
                )}

              {/* 平台类型 */}
              {hoveredNode.metadata?.platformType && (
                <div className="pt-3 border-t border-theme-sidebar-border">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-theme-text-secondary">平台类型</span>
                    <span className="text-theme-text-primary font-medium">
                      {hoveredNode.metadata.platformType}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 文档节点 */}
          {hoveredNode.type === "doc" && hoveredNode.metadata && (
            <div className="space-y-3">
              {hoveredNode.metadata.title && (
                <div>
                  <div className="text-xs text-theme-text-secondary mb-1">
                    标题
                  </div>
                  <div className="text-sm text-theme-text-primary">
                    {hoveredNode.metadata.title}
                  </div>
                </div>
              )}
              {hoveredNode.metadata.description && (
                <div>
                  <div className="text-xs text-theme-text-secondary mb-1">
                    描述
                  </div>
                  <div className="text-sm text-theme-text-secondary line-clamp-3">
                    {hoveredNode.metadata.description}
                  </div>
                </div>
              )}
              {hoveredNode.metadata.tags &&
                Array.isArray(hoveredNode.metadata.tags) &&
                hoveredNode.metadata.tags.length > 0 && (
                  <div>
                    <div className="text-xs text-theme-text-secondary mb-2">
                      标签
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {hoveredNode.metadata.tags
                        .slice(0, 5)
                        .map((tag, index) => (
                          <span
                            key={index}
                            className="px-2 py-1 bg-amber-500/20 text-amber-400 rounded text-xs"
                          >
                            {tag}
                          </span>
                        ))}
                    </div>
                  </div>
                )}
              {hoveredNode.metadata.createdAt && (
                <div className="pt-2 border-t border-theme-sidebar-border">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-theme-text-secondary">创建时间</span>
                    <span className="text-theme-text-primary">
                      {new Date(
                        hoveredNode.metadata.createdAt
                      ).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 对话节点 */}
          {hoveredNode.type === "chat" && hoveredNode.metadata && (
            <div className="space-y-3">
              {hoveredNode.metadata.messageCount !== undefined && (
                <div className="bg-[var(--theme-button-sidebar-bg)] border border-theme-sidebar-border rounded-lg p-3">
                  <div className="text-xs text-theme-text-secondary mb-1">
                    消息数
                  </div>
                  <div className="text-2xl font-bold text-green-400">
                    {hoveredNode.metadata.messageCount}
                  </div>
                </div>
              )}
              {hoveredNode.metadata.createdAt && (
                <div>
                  <div className="text-xs text-theme-text-secondary mb-1">
                    创建时间
                  </div>
                  <div className="text-sm text-theme-text-primary">
                    {new Date(
                      hoveredNode.metadata.createdAt
                    ).toLocaleDateString()}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 标签节点 */}
          {hoveredNode.type === "tag" && hoveredNode.metadata && (
            <div className="space-y-3">
              {hoveredNode.metadata.tagName && (
                <div>
                  <div className="text-xs text-theme-text-secondary mb-1">
                    标签名称
                  </div>
                  <div
                    className={`px-3 py-2 rounded-lg text-sm font-semibold ${AI_TEAM_ACCENT_TONE_CLASS}`}
                  >
                    #{hoveredNode.metadata.tagName}
                  </div>
                </div>
              )}
              {hoveredNode.metadata.count !== undefined && (
                <div className="bg-[var(--theme-button-sidebar-bg)] border border-theme-sidebar-border rounded-lg p-3">
                  <div className="text-xs text-theme-text-secondary mb-1">
                    使用次数
                  </div>
                  <div className="text-2xl font-bold text-[var(--theme-accent-primary)]">
                    {hoveredNode.metadata.count}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 通用提示 */}
          {!hoveredNode.metadata &&
            hoveredNode.type !== "assistant" &&
            hoveredNode.type !== "doc" &&
            hoveredNode.type !== "chat" &&
            hoveredNode.type !== "tag" && (
              <div className="text-theme-text-secondary text-sm">
                点击查看详情
              </div>
            )}
        </div>
      )}

      {/* Cytoscape 图谱容器 */}
      <div
        ref={containerRef}
        className="w-full h-full bg-theme-bg-primary"
        style={{ backgroundColor: "var(--theme-bg-primary)" }}
        aria-label="AI Team Graph Visualization"
      />

      {/* 节点详情面板 */}
      {selectedNode && (
        <div className="absolute top-0 right-0 w-96 h-full bg-theme-bg-secondary border-l border-theme-sidebar-border shadow-2xl overflow-y-auto z-20">
          <div className="p-6">
            {/* 关闭按钮 */}
            <button
              onClick={() => setSelectedNode(null)}
              className="absolute top-4 right-4 text-theme-text-secondary hover:text-theme-text-primary transition-colors text-xl"
            >
              ✕
            </button>

            {/* 节点头部 */}
            <div className="mb-8">
              <div className="flex items-center gap-3 mb-3">
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center text-2xl"
                  style={{ backgroundColor: getNodeColor(selectedNode) }}
                >
                  {selectedNode.type === "assistant"
                    ? "🤖"
                    : selectedNode.type === "chat"
                      ? "💬"
                      : "📄"}
                </div>
                <div>
                  <h3 className="text-theme-text-primary text-2xl font-bold">
                    {selectedNode.name}
                  </h3>
                  <p className="text-theme-text-secondary text-sm">
                    {selectedNode.type === "assistant"
                      ? "AI 助手"
                      : selectedNode.type === "chat"
                        ? "对话"
                        : "文档"}
                  </p>
                </div>
              </div>
            </div>

            {/* 助手详细信息 */}
            {selectedNode.type === "assistant" && selectedNode.metadata && (
              <div className="space-y-6">
                {/* 分类 */}
                {selectedNode.metadata.category && (
                  <div>
                    <div className="text-xs text-theme-text-secondary uppercase tracking-wider mb-2">
                      分类
                    </div>
                    <span
                      className={`inline-block px-4 py-2 rounded-lg text-sm font-semibold ${AI_TEAM_ACCENT_TONE_CLASS}`}
                    >
                      {selectedNode.metadata.category}
                    </span>
                  </div>
                )}

                {/* 统计数据 */}
                <div className="grid grid-cols-2 gap-4">
                  {selectedNode.metadata.chatCount !== undefined && (
                    <div className="bg-gradient-to-br from-green-500/10 to-green-500/5 border border-green-500/20 rounded-xl p-4">
                      <div className="text-xs text-green-400 mb-1">对话数</div>
                      <div className="text-3xl font-bold text-green-400">
                        {selectedNode.metadata.chatCount}
                      </div>
                    </div>
                  )}
                  {selectedNode.metadata.documentCount !== undefined && (
                    <div className="bg-gradient-to-br from-amber-500/10 to-amber-500/5 border border-amber-500/20 rounded-xl p-4">
                      <div className="text-xs text-amber-400 mb-1">文档数</div>
                      <div className="text-3xl font-bold text-amber-400">
                        {selectedNode.metadata.documentCount}
                      </div>
                    </div>
                  )}
                </div>

                {/* 标签 */}
                {selectedNode.metadata.tags &&
                  Array.isArray(selectedNode.metadata.tags) &&
                  selectedNode.metadata.tags.length > 0 && (
                    <div>
                      <div className="text-xs text-theme-text-secondary uppercase tracking-wider mb-3">
                        标签
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {selectedNode.metadata.tags.map((tag, index) => (
                          <span
                            key={index}
                            className="px-3 py-1.5 bg-theme-bg-primary border border-theme-sidebar-border text-theme-text-secondary rounded-lg text-sm hover:bg-[var(--theme-button-sidebar-hover-bg)] transition-colors"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                {/* 技能 */}
                {selectedNode.metadata.skills &&
                  Array.isArray(selectedNode.metadata.skills) &&
                  selectedNode.metadata.skills.length > 0 && (
                    <div>
                      <div className="text-xs text-theme-text-secondary uppercase tracking-wider mb-3">
                        技能
                      </div>
                      <div className="space-y-2">
                        {selectedNode.metadata.skills.map((skill, index) => (
                          <div
                            key={index}
                            className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${AI_TEAM_PERIWINKLE_TONE_CLASS} ${AI_TEAM_PERIWINKLE_BORDER_CLASS}`}
                          >
                            <span className="text-[var(--theme-accent-secondary)]">
                              ⚡
                            </span>
                            <span className="text-[var(--theme-accent-secondary)] text-sm font-medium">
                              {skill}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                {/* 知识模式 */}
                {selectedNode.metadata.knowledgeMode && (
                  <div>
                    <div className="text-xs text-theme-text-secondary uppercase tracking-wider mb-2">
                      知识模式
                    </div>
                    <div className="px-3 py-2 bg-theme-bg-primary border border-theme-sidebar-border rounded-lg text-theme-text-secondary text-sm">
                      {selectedNode.metadata.knowledgeMode}
                    </div>
                  </div>
                )}

                {/* 平台类型 */}
                {selectedNode.metadata.platformType && (
                  <div>
                    <div className="text-xs text-theme-text-secondary uppercase tracking-wider mb-2">
                      平台类型
                    </div>
                    <div className="px-3 py-2 bg-theme-bg-primary border border-theme-sidebar-border rounded-lg text-theme-text-secondary text-sm">
                      {selectedNode.metadata.platformType}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 文档详细信息 */}
            {selectedNode.type === "doc" && selectedNode.metadata && (
              <div className="space-y-6">
                {/* 标题 */}
                {selectedNode.metadata.title && (
                  <div>
                    <div className="text-xs text-theme-text-secondary uppercase tracking-wider mb-2">
                      标题
                    </div>
                    <div className="px-4 py-3 bg-theme-bg-primary border border-theme-sidebar-border rounded-lg text-theme-text-primary text-sm">
                      {selectedNode.metadata.title}
                    </div>
                  </div>
                )}

                {/* 描述 */}
                {selectedNode.metadata.description && (
                  <div>
                    <div className="text-xs text-theme-text-secondary uppercase tracking-wider mb-2">
                      描述
                    </div>
                    <div className="px-4 py-3 bg-theme-bg-primary border border-theme-sidebar-border rounded-lg text-theme-text-secondary text-sm leading-relaxed">
                      {selectedNode.metadata.description}
                    </div>
                  </div>
                )}

                {/* 标签 */}
                {selectedNode.metadata.tags &&
                  Array.isArray(selectedNode.metadata.tags) &&
                  selectedNode.metadata.tags.length > 0 && (
                    <div>
                      <div className="text-xs text-theme-text-secondary uppercase tracking-wider mb-3">
                        标签
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {selectedNode.metadata.tags.map((tag, index) => (
                          <span
                            key={index}
                            className="px-3 py-1.5 bg-amber-500/20 text-amber-400 rounded-lg text-sm hover:bg-amber-500/30 transition-colors"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                {/* 知识图谱 */}
                {selectedNode.metadata.知识图谱 && (
                  <div>
                    <div className="text-xs text-theme-text-secondary uppercase tracking-wider mb-2">
                      知识图谱
                    </div>
                    <div className="px-4 py-3 bg-theme-bg-primary border border-theme-sidebar-border rounded-lg text-theme-text-secondary text-sm">
                      {selectedNode.metadata.知识图谱}
                    </div>
                  </div>
                )}

                {/* 创建时间 */}
                {selectedNode.metadata.createdAt && (
                  <div>
                    <div className="text-xs text-theme-text-secondary uppercase tracking-wider mb-2">
                      创建时间
                    </div>
                    <div className="px-4 py-3 bg-theme-bg-primary border border-theme-sidebar-border rounded-lg text-theme-text-secondary text-sm">
                      {new Date(
                        selectedNode.metadata.createdAt
                      ).toLocaleString()}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 对话详细信息 */}
            {selectedNode.type === "chat" && selectedNode.metadata && (
              <div className="space-y-6">
                {/* 消息数 */}
                {selectedNode.metadata.messageCount !== undefined && (
                  <div className="bg-gradient-to-br from-green-500/10 to-green-500/5 border border-green-500/20 rounded-xl p-4">
                    <div className="text-xs text-green-400 mb-1">消息数</div>
                    <div className="text-3xl font-bold text-green-400">
                      {selectedNode.metadata.messageCount}
                    </div>
                  </div>
                )}

                {/* 创建时间 */}
                {selectedNode.metadata.createdAt && (
                  <div>
                    <div className="text-xs text-theme-text-secondary uppercase tracking-wider mb-2">
                      创建时间
                    </div>
                    <div className="px-4 py-3 bg-theme-bg-primary border border-theme-sidebar-border rounded-lg text-theme-text-secondary text-sm">
                      {new Date(
                        selectedNode.metadata.createdAt
                      ).toLocaleString()}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 标签详细信息 */}
            {selectedNode.type === "tag" && selectedNode.metadata && (
              <div className="space-y-6">
                {/* 标签名称 */}
                {selectedNode.metadata.tagName && (
                  <div>
                    <div className="text-xs text-theme-text-secondary uppercase tracking-wider mb-2">
                      标签名称
                    </div>
                    <div
                      className={`px-4 py-3 rounded-lg text-lg font-semibold ${AI_TEAM_ACCENT_TONE_CLASS}`}
                    >
                      #{selectedNode.metadata.tagName}
                    </div>
                  </div>
                )}

                {/* 使用次数 */}
                {selectedNode.metadata.count !== undefined && (
                  <div
                    className={`rounded-xl p-4 border ${AI_TEAM_ACCENT_TONE_CLASS} ${AI_TEAM_ACCENT_BORDER_CLASS}`}
                  >
                    <div className="text-xs text-[var(--theme-accent-primary)] mb-1">
                      使用次数
                    </div>
                    <div className="text-3xl font-bold text-[var(--theme-accent-primary)]">
                      {selectedNode.metadata.count}
                    </div>
                  </div>
                )}

                {/* 描述 */}
                {selectedNode.metadata.description && (
                  <div>
                    <div className="text-xs text-theme-text-secondary uppercase tracking-wider mb-2">
                      描述
                    </div>
                    <div className="px-4 py-3 bg-theme-bg-primary border border-theme-sidebar-border rounded-lg text-theme-text-secondary text-sm leading-relaxed">
                      {selectedNode.metadata.description}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 无元数据提示 */}
            {!selectedNode.metadata && (
              <div className="text-center py-8">
                <div className="text-theme-text-secondary text-sm">
                  暂无详细信息
                </div>
              </div>
            )}

            {/* 连接信息 */}
            <div className="mt-8 pt-6 border-t border-theme-sidebar-border">
              <h4 className="text-theme-text-primary text-sm font-semibold mb-4 uppercase tracking-wider">
                连接关系
              </h4>
              <div className="space-y-3">
                {graphData.links
                  .filter((link) => {
                    const sourceId =
                      typeof link.source === "object"
                        ? link.source.id
                        : link.source;
                    const targetId =
                      typeof link.target === "object"
                        ? link.target.id
                        : link.target;
                    return (
                      sourceId === selectedNode.id ||
                      targetId === selectedNode.id
                    );
                  })
                  .map((link, index) => {
                    const sourceId =
                      typeof link.source === "object"
                        ? link.source.id
                        : link.source;
                    const targetId =
                      typeof link.target === "object"
                        ? link.target.id
                        : link.target;
                    const isSource = sourceId === selectedNode.id;
                    const connectedNodeId = isSource ? targetId : sourceId;
                    const connectedNode = graphData.nodes.find(
                      (n) => n.id === connectedNodeId
                    );
                    return (
                      <div
                        key={index}
                        className="bg-theme-bg-primary border border-theme-sidebar-border hover:bg-[var(--theme-button-sidebar-hover-bg)] transition-colors p-4 rounded-lg cursor-pointer"
                        onClick={() => setSelectedNode(connectedNode)}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${
                              link.relation === "collaborate"
                                ? AI_TEAM_PERIWINKLE_TONE_CLASS
                                : "bg-green-500/20 text-green-400"
                            }`}
                          >
                            {isSource ? "→" : "←"}
                          </div>
                          <div className="flex-1">
                            <div className="text-theme-text-primary font-medium text-sm">
                              {connectedNode?.name || "未知节点"}
                            </div>
                            <div className="text-theme-text-secondary text-xs">
                              {link.relation === "collaborate"
                                ? "协作关系"
                                : "处理对话"}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// 统计卡片组件
function StatCard({ icon, title, value, color }) {
  const colorClasses = {
    blue: AI_TEAM_ACCENT_TONE_CLASS,
    green: "bg-green-500/10 text-green-400",
    amber: "bg-amber-500/10 text-amber-400",
  };

  return (
    <div className={`${AI_TEAM_SURFACE_CLASS} p-6`}>
      <div className="flex items-center gap-4">
        <div className={`p-3 rounded-lg ${colorClasses[color]}`}>{icon}</div>
        <div>
          <p className="text-theme-text-secondary text-sm">{title}</p>
          <p className="text-theme-text-primary text-2xl font-bold">{value}</p>
        </div>
      </div>
    </div>
  );
}

// AI 员工卡片组件
// 统一展示：功能名（主）+ 岗位徽章 + 人格名（辅）
function AssistantCard({ assistant, onClick }) {
  // 来源标签配置
  const sourceConfig = {
    hired: {
      label: "外聘",
      color: "text-green-400",
      bgColor: "bg-green-500/10",
    },
    custom: {
      label: "内培",
      color: "text-[var(--theme-accent-primary)]",
      bgColor: "bg-[var(--theme-accent-soft)]",
    },
    default: {
      label: "预置",
      color: "text-theme-text-secondary",
      bgColor: "bg-[var(--theme-button-sidebar-bg)]",
    },
  };
  const source = sourceConfig[assistant.source] || sourceConfig.hired;

  // 统一名称显示逻辑
  // 团队页面：主=功能名，辅=人格名，岗位为徽章
  const primaryName = assistant.instanceName || assistant.name || "未命名员工";
  const secondaryName = assistant.employeeName;
  const positionTitle = assistant.employeeTitle;

  return (
    <div
      className={`${AI_TEAM_PANEL_CLASS} p-4 hover:bg-[var(--theme-button-sidebar-hover-bg)] transition-colors cursor-pointer relative`}
      onClick={onClick}
      title={`${primaryName}${secondaryName ? ` · ${secondaryName}` : ""}${positionTitle ? ` · ${positionTitle}` : ""}`}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0 pr-2">
          {/* 功能名（主显示） */}
          <h3 className="text-theme-text-primary font-medium truncate">
            {primaryName}
          </h3>

          {/* 岗位徽章 + 人格名 */}
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {positionTitle && (
              <span className="text-[10px] px-1.5 py-0.5 bg-[var(--theme-accent-soft)] text-[var(--theme-accent-primary)] rounded font-medium">
                {positionTitle}
              </span>
            )}
            {secondaryName && secondaryName !== primaryName && (
              <span className="text-xs text-theme-text-secondary truncate">
                {secondaryName}
              </span>
            )}
          </div>

          {/* 分类 */}
          <p className="text-theme-text-secondary text-sm mt-1">
            {assistant.category}
          </p>
        </div>
        <div className="flex items-center gap-1 text-amber-400 flex-shrink-0">
          <TrendUp size={16} />
          <span className="text-sm">{assistant.rank.toFixed(2)}</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        {Array.isArray(assistant.tags) &&
          assistant.tags.slice(0, 3).map((tag, index) => (
            <span
              key={index}
              className="px-2 py-1 bg-[var(--theme-button-sidebar-bg)] text-theme-text-secondary text-xs rounded"
            >
              {tag}
            </span>
          ))}
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 text-sm text-theme-text-secondary">
          <div className="flex items-center gap-1">
            <ChatCircle size={16} />
            <span>{assistant.chatCount}</span>
          </div>
          <div className="flex items-center gap-1">
            <FileText size={16} />
            <span>{assistant.documentCount}</span>
          </div>
        </div>
        {/* 来源标签 */}
        <span
          className={`text-xs px-1.5 py-0.5 rounded ${source.bgColor} ${source.color}`}
        >
          {source.label}
        </span>
      </div>
    </div>
  );
}

/**
 * AI 团队图谱的 Cytoscape 样式配置（增强版）
 * - 支持来源边框颜色（hired=绿色, custom=蓝色, default=灰色）
 * - 支持协作边（共用会话）
 * - 支持活跃度大小映射
 * @returns {Array} Cytoscape 样式数组
 */
function getAITeamGraphStyles() {
  const textPrimary = readThemeColor("--theme-text-primary", "#e5eefc");
  const bgPrimary = readThemeColor("--theme-bg-primary", "#0f172a");
  const borderColor = readThemeColor(
    "--theme-sidebar-border",
    "rgba(148, 163, 184, 0.24)"
  );

  return [
    // 基础节点样式
    {
      selector: "node",
      style: {
        "background-color": "data(color)",
        label: "data(label)",
        width: "data(size)",
        height: "data(size)",
        "font-size": "11px",
        color: textPrimary,
        "text-valign": "bottom",
        "text-halign": "center",
        "text-margin-y": 8,
        "text-outline-color": bgPrimary,
        "text-outline-width": 2,
        "border-width": 3,
        "border-color": "data(borderColor)", // 使用动态边框颜色
      },
    },
    // 助手节点 - 显示标签，根据来源设置边框
    {
      selector: "node[type='assistant']",
      style: {
        "text-opacity": 1,
        "font-weight": "bold",
      },
    },
    // 外聘员工边框 - 绿色
    {
      selector: "node[source='hired']",
      style: {
        "border-color": "#22c55e",
      },
    },
    // 内培员工边框 - 蓝色
    {
      selector: "node[source='custom']",
      style: {
        "border-color": "#59A8F6",
      },
    },
    // 预置员工边框 - 灰色
    {
      selector: "node[source='default']",
      style: {
        "border-color": "#6b7280",
      },
    },
    // 对话/文档节点 - 隐藏标签（悬停时显示）
    {
      selector: "node[type='chat'], node[type='doc']",
      style: {
        "text-opacity": 0,
        "border-width": 2,
        "border-color": borderColor,
      },
    },
    // 基础边样式
    {
      selector: "edge",
      style: {
        width: 1.5,
        "line-color": borderColor,
        "target-arrow-color": borderColor,
        "target-arrow-shape": "triangle",
        "curve-style": "bezier",
        "arrow-scale": 0.8,
      },
    },
    // 【新增】共用会话协作边 - 紫色虚线
    {
      selector: "edge[relation='co_session']",
      style: {
        width: 2.5,
        "line-color": "rgba(183, 195, 255, 0.72)", // periwinkle
        "target-arrow-color": "rgba(183, 195, 255, 0.72)",
        "target-arrow-shape": "none", // 协作边无箭头（双向）
        "line-style": "dashed",
        "line-dash-pattern": [6, 3],
      },
    },
    // 旧版协作关系边（保留兼容）
    {
      selector: "edge[relation='collaborate']",
      style: {
        width: 3,
        "line-color": "rgba(89, 168, 246, 0.6)",
        "target-arrow-color": "rgba(89, 168, 246, 0.6)",
      },
    },
    // 助手处理对话边
    {
      selector: "edge[relation='assistant']",
      style: {
        width: 2,
        "line-color": "rgba(16, 185, 129, 0.4)",
        "target-arrow-color": "rgba(16, 185, 129, 0.4)",
      },
    },
    // 高亮状态
    {
      selector: "node.highlighted",
      style: {
        "border-width": 4,
        "border-color": "#8EC5FF",
        "z-index": 999,
      },
    },
    {
      selector: "edge.highlighted",
      style: {
        width: 4,
        opacity: 1,
        "z-index": 999,
      },
    },
    // 淡出状态
    {
      selector: "node.dimmed",
      style: {
        opacity: 0.2,
      },
    },
    {
      selector: "edge.dimmed",
      style: {
        opacity: 0.1,
      },
    },
    // 选中状态
    {
      selector: "node:selected",
      style: {
        "border-width": 4,
        "border-color": "#fbbf24",
        "overlay-opacity": 0,
      },
    },
  ];
}
