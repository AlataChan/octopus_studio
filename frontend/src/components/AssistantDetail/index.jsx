import { useState, useEffect } from "react";
import {
  X,
  Clock,
  CheckCircle,
  XCircle,
  ArrowRight,
  CaretDown,
  CaretUp,
} from "@phosphor-icons/react";
import AITeam from "@/models/aiTeam";

/**
 * AI 助手详情弹窗组件
 * @param {Object} props
 * @param {string} props.workspaceSlug - Workspace slug
 * @param {Object} props.assistant - 助手信息
 * @param {Function} props.onClose - 关闭回调
 */
export default function AssistantDetail({ workspaceSlug, assistant, onClose }) {
  const [loading, setLoading] = useState(true);
  const [invocations, setInvocations] = useState([]);
  const [total, setTotal] = useState(0);
  const [selectedInvocation, setSelectedInvocation] = useState(null);
  const [period, setPeriod] = useState("7d");
  const [stats, setStats] = useState(null);

  useEffect(() => {
    if (assistant?.id) {
      fetchData();
    }
  }, [assistant?.id, period]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [historyRes, perfRes] = await Promise.all([
        AITeam.getInvocationHistory(workspaceSlug, assistant.id, { limit: 20 }),
        AITeam.getAssistantPerformance(workspaceSlug, assistant.id, { period }),
      ]);

      if (historyRes.success) {
        setInvocations(historyRes.data.invocations);
        setTotal(historyRes.data.total);
      }
      if (perfRes.success) {
        setStats(perfRes.data);
      }
    } catch (error) {
      console.error("Error fetching assistant details:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/45 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-theme-bg-secondary border border-theme-sidebar-border rounded-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
        {/* 标题栏 */}
        <div className="flex items-center justify-between p-4 border-b border-theme-sidebar-border">
          <div>
            <h2 className="text-xl font-semibold text-theme-text-primary">
              {assistant?.name || "AI 助手详情"}
            </h2>
            <p className="text-sm text-theme-text-secondary">
              ID: {assistant?.id}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-[var(--theme-button-sidebar-hover-bg)] rounded-lg transition-colors"
          >
            <X size={20} className="text-theme-text-secondary" />
          </button>
        </div>

        {/* 内容区 */}
        <div className="flex-1 overflow-auto p-4 space-y-4">
          {loading ? (
            <div className="animate-pulse space-y-4">
              <div className="h-20 bg-[var(--theme-button-sidebar-bg)] rounded"></div>
              <div className="h-40 bg-[var(--theme-button-sidebar-bg)] rounded"></div>
            </div>
          ) : (
            <>
              {/* 统计摘要 */}
              {stats?.summary && (
                <div className="grid grid-cols-4 gap-4">
                  <StatCard
                    label="总调用"
                    value={stats.summary.total}
                    color="blue"
                  />
                  <StatCard
                    label="成功"
                    value={stats.summary.successful}
                    color="green"
                  />
                  <StatCard
                    label="失败"
                    value={stats.summary.failed}
                    color="red"
                  />
                  <StatCard
                    label="成功率"
                    value={`${(stats.summary.successRate * 100).toFixed(0)}%`}
                    color={stats.summary.successRate >= 0.8 ? "green" : "amber"}
                  />
                </div>
              )}

              {/* 周期选择 */}
              <div className="flex gap-2">
                {["24h", "7d", "30d"].map((p) => (
                  <button
                    key={p}
                    onClick={() => setPeriod(p)}
                    className={`px-3 py-1 rounded text-sm ${
                      period === p
                        ? "bg-primary-button text-[var(--theme-button-primary-text)]"
                        : "bg-[var(--theme-button-sidebar-bg)] text-theme-text-secondary hover:bg-[var(--theme-button-sidebar-hover-bg)] hover:text-theme-text-primary"
                    }`}
                  >
                    {p === "24h" ? "24小时" : p === "7d" ? "7天" : "30天"}
                  </button>
                ))}
              </div>

              {/* 调用历史列表 */}
              <div className="bg-theme-bg-primary border border-theme-sidebar-border rounded-lg">
                <div className="p-3 border-b border-theme-sidebar-border">
                  <h3 className="text-sm font-medium text-theme-text-primary">
                    最近调用 ({total} 条记录)
                  </h3>
                </div>
                <div className="divide-y divide-theme-sidebar-border">
                  {invocations.length === 0 ? (
                    <div className="p-4 text-center text-theme-text-secondary">
                      暂无调用记录
                    </div>
                  ) : (
                    invocations.map((inv) => (
                      <InvocationRow
                        key={inv.id}
                        invocation={inv}
                        workspaceSlug={workspaceSlug}
                        isExpanded={selectedInvocation === inv.id}
                        onToggle={() =>
                          setSelectedInvocation(
                            selectedInvocation === inv.id ? null : inv.id
                          )
                        }
                      />
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, color }) {
  const colors = {
    blue: "text-blue-400",
    green: "text-green-400",
    red: "text-red-400",
    amber: "text-amber-400",
  };
  return (
    <div className="bg-theme-bg-primary border border-theme-sidebar-border rounded-lg p-3">
      <div className="text-xs text-theme-text-secondary">{label}</div>
      <div className={`text-2xl font-bold ${colors[color]}`}>{value}</div>
    </div>
  );
}

function InvocationRow({ invocation, workspaceSlug, isExpanded, onToggle }) {
  const [steps, setSteps] = useState([]);
  const [loadingSteps, setLoadingSteps] = useState(false);

  useEffect(() => {
    if (isExpanded && steps.length === 0) {
      loadSteps();
    }
  }, [isExpanded]);

  const loadSteps = async () => {
    setLoadingSteps(true);
    const res = await AITeam.getInvocationSteps(workspaceSlug, invocation.id);
    if (res.success) {
      setSteps(res.data.steps);
    }
    setLoadingSteps(false);
  };

  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full p-3 hover:bg-[var(--theme-button-sidebar-hover-bg)] transition-colors text-left"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {invocation.success ? (
              <CheckCircle size={18} className="text-green-400" weight="fill" />
            ) : invocation.success === false ? (
              <XCircle size={18} className="text-red-400" weight="fill" />
            ) : (
              <Clock size={18} className="text-theme-text-secondary" />
            )}
            <span className="text-sm text-theme-text-primary font-mono truncate max-w-md">
              {invocation.prompt}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs text-theme-text-secondary">
              {invocation.stepCount} 步骤
            </span>
            <span className="text-xs text-theme-text-secondary">
              {new Date(invocation.createdAt).toLocaleString()}
            </span>
            {isExpanded ? (
              <CaretUp size={16} className="text-theme-text-secondary" />
            ) : (
              <CaretDown size={16} className="text-theme-text-secondary" />
            )}
          </div>
        </div>
      </button>
      {isExpanded && (
        <div className="px-3 pb-3">
          {loadingSteps ? (
            <div className="text-center text-theme-text-secondary py-2">
              加载步骤中...
            </div>
          ) : steps.length === 0 ? (
            <div className="text-center text-theme-text-secondary py-2">
              无步骤记录
            </div>
          ) : (
            <StepsTimeline steps={steps} />
          )}
        </div>
      )}
    </div>
  );
}

/**
 * 步骤时间轴组件
 */
function StepsTimeline({ steps }) {
  return (
    <div className="relative pl-6 space-y-3">
      {/* 时间轴线 */}
      <div className="absolute left-2 top-2 bottom-2 w-0.5 bg-theme-sidebar-border"></div>

      {steps.map((step, index) => (
        <div key={step.id || index} className="relative">
          {/* 节点 */}
          <div
            className={`absolute left-[-16px] top-1 w-3 h-3 rounded-full border-2 ${
              step.success
                ? "bg-green-500 border-green-500"
                : "bg-red-500 border-red-500"
            }`}
          ></div>

          {/* 内容卡片 */}
          <div
            className={`ml-4 p-3 rounded-lg ${
              step.success
                ? "bg-theme-bg-primary border border-theme-sidebar-border"
                : "bg-red-900/20 border border-red-500/30"
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-xs bg-[var(--theme-button-sidebar-bg)] px-2 py-0.5 rounded text-theme-text-secondary">
                  Step {step.stepIndex}
                </span>
                <span className="text-sm font-mono text-blue-400">
                  {step.toolName || step.stepType}
                </span>
              </div>
              <span className="text-xs text-theme-text-secondary">
                {step.durationMs}ms
              </span>
            </div>

            {/* 输入/输出摘要 */}
            {step.inputSummary && (
              <div className="mb-2">
                <div className="text-xs text-theme-text-secondary mb-1">
                  输入:
                </div>
                <pre className="text-xs text-theme-text-secondary bg-theme-bg-container p-2 rounded overflow-x-auto max-h-20">
                  {step.inputSummary}
                </pre>
              </div>
            )}

            {step.success && step.outputSummary && (
              <div>
                <div className="text-xs text-theme-text-secondary mb-1">
                  输出:
                </div>
                <pre className="text-xs text-theme-text-secondary bg-theme-bg-container p-2 rounded overflow-x-auto max-h-20">
                  {step.outputSummary}
                </pre>
              </div>
            )}

            {/* 错误信息 */}
            {!step.success && step.errorMessage && (
              <div className="mt-2 text-xs text-red-400 bg-red-900/30 p-2 rounded">
                ⚠️ {step.errorMessage}
              </div>
            )}
          </div>

          {/* 箭头连接线 */}
          {index < steps.length - 1 && (
            <div className="absolute left-[-10px] bottom-[-12px]">
              <ArrowRight
                size={12}
                className="text-theme-text-secondary rotate-90"
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
