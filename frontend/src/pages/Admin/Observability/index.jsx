import { useEffect, useState } from "react";
import Sidebar from "@/components/SettingsSidebar";
import { isMobile } from "react-device-detect";
import Metrics from "@/models/metrics";
import Workspace from "@/models/workspace";
import showToast from "@/utils/toast";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { useTranslation } from "react-i18next";

const KNOWLEDGE_MODE_COLORS = {
  workspace: "#3b82f6",
  platform: "#10b981",
  none: "#6b7280",
};

export const KNOWLEDGE_MODE_VALUE_KEY = "count";

export function isMetricsDisabledResult(result) {
  return (
    result?.disabled === true || result?.code === "EXPERIMENTS_ADMIN_DISABLED"
  );
}

export default function AdminObservability() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState("7d");
  const [chatStats, setChatStats] = useState(null);
  const [knowledgeModeDistribution, setKnowledgeModeDistribution] = useState(
    []
  );
  const [workspaces, setWorkspaces] = useState([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState("");
  const [loadError, setLoadError] = useState("");
  const [metricsDisabled, setMetricsDisabled] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadWorkspaces() {
      const results = await Workspace.all();
      if (!cancelled) {
        setWorkspaces(Array.isArray(results) ? results : []);
      }
    }

    loadWorkspaces();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    fetchMetrics();
  }, [timeRange, selectedWorkspaceId]);

  async function fetchMetrics() {
    setLoading(true);
    setLoadError("");
    setMetricsDisabled(false);

    try {
      const endDate = new Date();
      const startDate = new Date();

      switch (timeRange) {
        case "7d":
          startDate.setDate(endDate.getDate() - 7);
          break;
        case "30d":
          startDate.setDate(endDate.getDate() - 30);
          break;
        case "90d":
          startDate.setDate(endDate.getDate() - 90);
          break;
      }

      const requestParams = {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        workspaceId: selectedWorkspaceId || undefined,
      };

      const [statsRes, distributionRes] = await Promise.all([
        Metrics.getChatStats(requestParams),
        Metrics.getKnowledgeModeDistribution(requestParams),
      ]);

      if (
        isMetricsDisabledResult(statsRes) ||
        isMetricsDisabledResult(distributionRes)
      ) {
        setChatStats(null);
        setKnowledgeModeDistribution([]);
        setMetricsDisabled(true);
        return;
      }

      if (statsRes.success) {
        setChatStats(statsRes.data);
      } else {
        setChatStats(null);
      }

      if (distributionRes.success) {
        setKnowledgeModeDistribution(distributionRes.data || []);
      } else {
        setKnowledgeModeDistribution([]);
      }

      if (!statsRes.success || !distributionRes.success) {
        const error =
          statsRes.error || distributionRes.error || "观测性数据加载失败";
        setLoadError(error);
        showToast(error, "error");
      }
    } catch (error) {
      const message = error?.message || "观测性数据加载失败";
      setChatStats(null);
      setKnowledgeModeDistribution([]);
      setLoadError(message);
      showToast(message, "error");
    } finally {
      setLoading(false);
    }
  }

  const hasMetrics =
    (chatStats?.totalChats || 0) > 0 || knowledgeModeDistribution.length > 0;
  const selectedWorkspace = workspaces.find(
    (workspace) => String(workspace.id) === String(selectedWorkspaceId)
  );

  return (
    <div className="w-screen h-screen overflow-hidden bg-page-texture flex">
      <Sidebar />
      <div
        style={{ height: isMobile ? "100%" : "calc(100% - 32px)" }}
        className="relative z-[1] md:ml-[2px] md:mr-[16px] md:my-[16px] md:rounded-[16px] bg-theme-bg-secondary w-full h-full overflow-y-scroll p-4 md:p-0"
      >
        <div className="flex flex-col w-full px-1 md:pl-6 md:pr-[50px] md:py-6 py-16">
          <div className="w-full flex flex-col gap-y-1 pb-6 border-theme-border border-b-2">
            <div className="items-center flex gap-x-4">
              <p className="text-lg leading-6 font-bold text-theme-text-primary">
                {t("observability.title")}
              </p>
            </div>
            <p className="text-xs leading-[18px] font-base text-theme-text-secondary">
              {t("observability.description")}
            </p>
          </div>

          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mt-6 mb-4">
            <div className="flex gap-x-2">
              {["7d", "30d", "90d"].map((range) => (
                <button
                  key={range}
                  onClick={() => setTimeRange(range)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    timeRange === range
                      ? "bg-sky-500 text-theme-text-primary"
                      : "bg-theme-bg-primary text-theme-text-secondary hover:bg-theme-bg-tertiary"
                  }`}
                >
                  {range === "7d" &&
                    t("observability.time-range-7d", "最近 7 天")}
                  {range === "30d" &&
                    t("observability.time-range-30d", "最近 30 天")}
                  {range === "90d" &&
                    t("observability.time-range-90d", "最近 90 天")}
                </button>
              ))}
            </div>

            <select
              value={selectedWorkspaceId}
              onChange={(event) => setSelectedWorkspaceId(event.target.value)}
              className="rounded-lg border border-theme-sidebar-border bg-theme-bg-primary px-3 py-2 text-sm text-theme-text-primary"
            >
              <option value="">全部工作区</option>
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name ||
                    workspace.slug ||
                    `Workspace #${workspace.id}`}
                </option>
              ))}
            </select>
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-64">
              <p className="text-theme-text-secondary">
                {t("observability.loading")}
              </p>
            </div>
          ) : metricsDisabled ? (
            <EmptyState
              title="指标 / Observability 未启用"
              description="当前实例未开启实验性观测性指标端点，因此不会加载 /api/metrics 数据。开启对应实验能力后再查看这里。"
            />
          ) : loadError ? (
            <EmptyState title="观测性数据暂时不可用" description={loadError} />
          ) : !hasMetrics ? (
            <EmptyState
              title="当前时间范围内还没有可分析的数据"
              description={
                selectedWorkspace
                  ? `工作区「${selectedWorkspace.name || selectedWorkspace.slug}」在该时间范围内还没有写入 chat_metrics 记录。先发起几轮对话，再回来查看趋势。`
                  : "当前实例在该时间范围内还没有写入 chat_metrics 记录。先发起几轮对话，再回来查看趋势。"
              }
            />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <StatsCard
                title={t("observability.metrics.total-chats")}
                value={chatStats?.totalChats || 0}
                color="blue"
              />
              <StatsCard
                title={t("observability.metrics.error-rate", "错误率")}
                value={`${((chatStats?.errorRate || 0) * 100).toFixed(2)}%`}
                color="red"
              />
              <StatsCard
                title={t("observability.metrics.avg-response-time")}
                value={`${(chatStats?.avgResponseTime || 0).toFixed(0)} ms`}
                color="green"
              />
              <StatsCard
                title={t("observability.metrics.avg-tokens", "平均 Token 消耗")}
                value={(chatStats?.avgTokensPerChat || 0).toFixed(0)}
                color="purple"
              />

              <div className="lg:col-span-2 bg-theme-bg-primary rounded-lg p-6">
                <h3 className="text-lg font-semibold text-theme-text-primary mb-4">
                  {t(
                    "observability.knowledge-mode-distribution",
                    "知识模式分布"
                  )}
                </h3>
                {knowledgeModeDistribution.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={knowledgeModeDistribution}
                        dataKey={KNOWLEDGE_MODE_VALUE_KEY}
                        nameKey="mode"
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        label
                      >
                        {knowledgeModeDistribution.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={
                              KNOWLEDGE_MODE_COLORS[entry.mode] || "#6b7280"
                            }
                          />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="rounded-lg border border-dashed border-theme-sidebar-border px-4 py-8 text-sm text-theme-text-secondary text-center">
                    当前时间范围内还没有知识模式分布数据。
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyState({ title, description }) {
  return (
    <div className="rounded-lg border border-dashed border-theme-sidebar-border px-6 py-10 text-center bg-theme-bg-primary mt-4">
      <p className="text-base font-semibold text-theme-text-primary">{title}</p>
      <p className="text-sm text-theme-text-secondary mt-2">{description}</p>
    </div>
  );
}

function StatsCard({ title, value, color }) {
  const colorClasses = {
    blue: "bg-blue-500/10 text-blue-500",
    red: "bg-red-500/10 text-red-500",
    green: "bg-green-500/10 text-green-500",
    purple: "bg-purple-500/10 text-purple-500",
  };

  return (
    <div className="bg-theme-bg-primary rounded-lg p-6">
      <p className="text-sm text-theme-text-secondary mb-2">{title}</p>
      <p className={`text-3xl font-bold ${colorClasses[color]}`}>{value}</p>
    </div>
  );
}
