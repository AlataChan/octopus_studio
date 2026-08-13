import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Sidebar from "@/components/Sidebar";
import {
  KnowledgeGraphView,
  NodeDetailPanel,
  GraphToolbar,
  transformGraphData,
} from "@/components/WorkspaceGraph";
import KnowledgeGraph from "@/models/knowledgeGraph";
import { ArrowLeft, Graph, MagnifyingGlass } from "@phosphor-icons/react";
import showToast from "@/utils/toast";
import paths from "@/utils/paths";
import { scheduleDeferredGraphTransform } from "@/components/WorkspaceGraph/deferredGraphWork";
import { useThemeContext } from "@/ThemeContext";

const DEFAULT_VISIBLE_TYPES = [
  "doc",
  "chat",
  "assistant",
  "tag",
  "concept",
  "entity",
  "comparison",
  "timeline",
];
const EMPTY_GRAPH = { nodes: [], links: [] };

export default function WorkspaceGraph() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const graphRef = useRef(null);
  const graphRequestRef = useRef(0);
  const transformCancelRef = useRef(null);
  const { theme } = useThemeContext();

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [graph, setGraph] = useState(EMPTY_GRAPH);
  const [selectedNode, setSelectedNode] = useState(null);
  const [activeTypes, setActiveTypes] = useState(DEFAULT_VISIBLE_TYPES);
  const [highlightIds, setHighlightIds] = useState([]);

  const cancelPendingGraphWork = useCallback(() => {
    transformCancelRef.current?.();
    transformCancelRef.current = null;
  }, []);

  const runGraphQuery = useCallback(
    async ({
      limit = 200,
      q,
      types,
      errorMessage,
      emptyMessage,
      clearExisting = false,
      afterApply,
    } = {}) => {
      const requestId = graphRequestRef.current + 1;
      graphRequestRef.current = requestId;
      cancelPendingGraphWork();
      if (clearExisting) {
        setGraph(EMPTY_GRAPH);
        setStats(null);
        setSelectedNode(null);
        setHighlightIds([]);
      }

      setLoading(true);
      let response;
      try {
        response = await KnowledgeGraph.getGraph(slug, {
          limit,
          q: q || undefined,
          types: types || undefined,
        });
      } catch (fetchError) {
        if (requestId !== graphRequestRef.current) return;
        console.error(
          "[KnowledgeGraph] Failed to fetch graph data",
          fetchError
        );
        showToast(errorMessage, "error");
        setLoading(false);
        return;
      }

      if (requestId !== graphRequestRef.current) return;

      const { success, data, error } = response;
      if (success && data) {
        transformCancelRef.current = scheduleDeferredGraphTransform({
          data,
          transform: transformGraphData,
          onComplete: ({ graph: nextGraph, stats: graphStats, nodeIds }) => {
            if (requestId !== graphRequestRef.current) return;
            transformCancelRef.current = null;
            setGraph(nextGraph);
            setStats(graphStats);
            setLoading(false);
            afterApply?.({ data, graph: nextGraph, nodeIds, requestId });
            if (emptyMessage && nextGraph.nodes.length === 0) {
              showToast(emptyMessage, "info");
            }
          },
          onError: (transformError) => {
            if (requestId !== graphRequestRef.current) return;
            transformCancelRef.current = null;
            console.error(
              "[KnowledgeGraph] Failed to transform graph data",
              transformError
            );
            showToast(errorMessage, "error");
            setLoading(false);
          },
        });
        return;
      }

      showToast(error || errorMessage, "error");
      setLoading(false);
    },
    [slug, cancelPendingGraphWork]
  );

  const loadGraph = useCallback(
    (options = {}) => {
      return runGraphQuery({
        limit: options.limit || 200,
        q: options.q,
        types: options.types,
        errorMessage: "加载图谱失败",
        clearExisting: options.clearExisting === true,
      });
    },
    [runGraphQuery]
  );

  // 加载图谱概览
  useEffect(() => {
    loadGraph({ clearExisting: true });

    return () => {
      graphRequestRef.current += 1;
      cancelPendingGraphWork();
    };
  }, [slug, loadGraph, cancelPendingGraphWork]);

  // 搜索处理
  const handleSearch = useCallback(
    async (keyword) => {
      if (!keyword?.trim()) {
        runGraphQuery({
          limit: 200,
          errorMessage: "加载图谱失败",
          afterApply: () => setHighlightIds([]),
        });
        return;
      }

      runGraphQuery({
        q: keyword,
        limit: 100,
        errorMessage: "搜索失败",
        emptyMessage: "未找到相关节点",
        afterApply: ({ nodeIds }) => setHighlightIds(nodeIds),
      });
    },
    [runGraphQuery]
  );

  // 类型过滤
  const handleFilterChange = useCallback((types) => {
    setActiveTypes(types);
  }, []);

  // 节点选中
  const handleNodeSelect = useCallback((nodeData) => {
    setSelectedNode(nodeData);
  }, []);

  // 节点双击 - 展开子图（使用搜索模拟）
  const handleNodeDoubleClick = useCallback(
    async (nodeData) => {
      if (!nodeData?.id) return;

      // 使用节点名称搜索来模拟展开
      runGraphQuery({
        q: nodeData.label || nodeData.id,
        limit: 50,
        errorMessage: "展开节点失败",
        afterApply: () => setHighlightIds([nodeData.id]),
      });
    },
    [runGraphQuery]
  );

  // 重置视图
  const handleResetView = useCallback(() => {
    graphRef.current?.resetView?.();
  }, []);

  // 关闭详情面板
  const closeDetails = useCallback(() => {
    setSelectedNode(null);
  }, []);

  return (
    <div className="w-screen h-screen overflow-hidden bg-page-texture flex">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden relative z-[1]">
        {/* 顶部标题栏 */}
        <div className="flex items-center justify-between px-6 py-4 bg-sidebar border-b border-theme-border">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate(paths.workspace.chat(slug))}
              className="flex items-center gap-1.5 px-3 py-2 bg-theme-bg-secondary hover:bg-theme-bg-primary text-theme-text-primary rounded-lg transition-colors border border-theme-border"
              title="返回"
            >
              <ArrowLeft size={18} />
              <span className="text-sm">返回</span>
            </button>
            <div className="h-6 w-px bg-theme-border" />
            <h1 className="text-xl font-semibold text-theme-text-primary">
              知识图谱
            </h1>
          </div>
        </div>

        {/* 工具栏 */}
        <GraphToolbar
          onSearch={handleSearch}
          onFilterChange={handleFilterChange}
          onResetView={handleResetView}
          stats={stats}
          isLoading={loading}
        />

        {/* 图谱画布 */}
        <div className="flex-1 relative bg-theme-bg-primary">
          {loading && graph.nodes.length === 0 ? (
            <GraphSkeleton />
          ) : !loading && graph.nodes.length === 0 ? (
            <GraphEmptyState />
          ) : (
            <KnowledgeGraphView
              ref={graphRef}
              nodes={graph.nodes}
              links={graph.links}
              theme={theme}
              visibleTypes={activeTypes}
              highlightIds={highlightIds}
              onNodeSelect={handleNodeSelect}
              onNodeDoubleClick={handleNodeDoubleClick}
            />
          )}

          {/* 节点详情面板 */}
          <NodeDetailPanel node={selectedNode} onClose={closeDetails} />
        </div>
      </div>
    </div>
  );
}

function GraphEmptyState() {
  return (
    <div className="flex h-full w-full items-center justify-center px-6">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-theme-border bg-theme-bg-secondary text-theme-accent-primary">
          <Graph size={28} weight="duotone" />
        </div>
        <h2 className="text-lg font-semibold text-theme-text-primary">
          暂无可视化关系
        </h2>
        <p className="mt-2 text-sm leading-6 text-theme-text-secondary">
          当前工作区还没有足够的对话、文档或 AI 员工关联。添加内容后，关系网络会在这里自动呈现。
        </p>
      </div>
    </div>
  );
}

function GraphSkeleton() {
  return (
    <div
      className="relative h-full w-full overflow-hidden p-8"
      data-testid="workspace-graph-skeleton"
    >
      <div className="absolute inset-0 bg-theme-bg-primary" />
      <div className="relative h-full w-full">
        <div className="absolute left-[12%] top-[16%] h-16 w-16 rounded-full bg-theme-accent-primary/15 animate-pulse" />
        <div className="absolute left-[42%] top-[22%] h-24 w-24 rounded-full bg-theme-accent-primary/20 animate-pulse" />
        <div className="absolute right-[18%] top-[34%] h-14 w-14 rounded-full bg-theme-bg-secondary animate-pulse" />
        <div className="absolute bottom-[22%] left-[28%] h-20 w-20 rounded-full bg-theme-accent-primary/10 animate-pulse" />
        <div className="absolute bottom-[18%] right-[26%] h-16 w-16 rounded-full bg-theme-bg-secondary animate-pulse" />
        <div className="absolute left-[18%] top-[32%] h-px w-[26%] rotate-12 bg-theme-border" />
        <div className="absolute right-[26%] top-[44%] h-px w-[24%] -rotate-12 bg-theme-border" />
        <div className="absolute bottom-[36%] left-[34%] h-px w-[34%] rotate-6 bg-theme-border" />
        <div className="absolute bottom-6 left-6 space-y-3">
          <div className="flex items-center gap-2 text-theme-text-secondary">
            <MagnifyingGlass size={14} />
            <div className="h-4 w-40 rounded bg-theme-bg-secondary animate-pulse" />
          </div>
          <div className="h-3 w-64 rounded bg-theme-bg-secondary/70 animate-pulse" />
        </div>
      </div>
    </div>
  );
}
