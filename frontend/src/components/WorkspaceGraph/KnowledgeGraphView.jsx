import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import GraphRenderer from "./GraphRenderer";
import { transformGraphData } from "./graphData";
import { normalizeLinkEndpoint } from "./layoutForces";
import { resolveGraphTheme } from "./graphTheme";
import useGraphSimulation from "./useGraphSimulation";

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

function useElementSize() {
  const ref = useRef(null);
  const [size, setSize] = useState({ width: 960, height: 640 });

  useEffect(() => {
    if (!ref.current) return;
    const element = ref.current;

    const updateSize = () => {
      const rect = element.getBoundingClientRect();
      setSize({
        width: Math.max(320, Math.round(rect.width || 960)),
        height: Math.max(320, Math.round(rect.height || 640)),
      });
    };

    updateSize();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateSize);
      return () => window.removeEventListener("resize", updateSize);
    }

    const observer = new ResizeObserver(updateSize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, size];
}

function normalizeLegacyElements(elements) {
  if (!Array.isArray(elements)) {
    if (elements?.nodes && elements?.links) return elements;
    return { nodes: [], links: [] };
  }

  const nodes = [];
  const links = [];
  for (const item of elements) {
    const data = item?.data;
    if (!data?.id) continue;
    if (data.source || data.target) {
      links.push({
        id: data.id,
        source: data.source,
        target: data.target,
        relation: data.relation,
        weight: data.weight,
      });
    } else {
      nodes.push({
        ...data,
        id: data.id,
        label: data.label || data.name || data.id,
        metadata: data.metadata || {},
      });
    }
  }
  return { nodes, links };
}

function normalizeGraphInput({ nodes, links, elements }) {
  if (nodes?.length || links?.length) {
    return { nodes: nodes || [], links: links || [] };
  }
  return normalizeLegacyElements(elements);
}

function filterGraph(nodes, links, visibleTypes) {
  const typeSet = new Set(visibleTypes?.length ? visibleTypes : DEFAULT_VISIBLE_TYPES);
  const visibleNodes = nodes.filter((node) => typeSet.has(node.type));
  const visibleIds = new Set(visibleNodes.map((node) => node.id));
  const visibleLinks = links
    .map((link) => ({
      ...link,
      source: normalizeLinkEndpoint(link.source),
      target: normalizeLinkEndpoint(link.target),
    }))
    .filter((link) => visibleIds.has(link.source) && visibleIds.has(link.target));

  return { nodes: visibleNodes, links: visibleLinks };
}

const KnowledgeGraphView = forwardRef(function KnowledgeGraphView(
  {
    nodes = [],
    links = [],
    elements = [],
    theme = "default",
    visibleTypes = DEFAULT_VISIBLE_TYPES,
    highlightIds = [],
    onNodeSelect,
    onNodeDoubleClick,
    className = "",
  },
  ref
) {
  const rendererRef = useRef(null);
  const [containerRef, size] = useElementSize();
  const [selectedId, setSelectedId] = useState(null);

  const graphInput = useMemo(
    () => normalizeGraphInput({ nodes, links, elements }),
    [nodes, links, elements]
  );
  const filteredGraph = useMemo(
    () => filterGraph(graphInput.nodes, graphInput.links, visibleTypes),
    [graphInput.nodes, graphInput.links, visibleTypes]
  );
  const graphTheme = useMemo(() => resolveGraphTheme(theme), [theme]);

  const simulation = useGraphSimulation({
    nodes: filteredGraph.nodes,
    links: filteredGraph.links,
    width: size.width,
    height: size.height,
  });

  const handleNodeSelect = useCallback(
    (node) => {
      setSelectedId(node?.id || null);
      onNodeSelect?.(node);
    },
    [onNodeSelect]
  );

  const resetView = useCallback(() => {
    rendererRef.current?.resetView?.();
    simulation.restart?.(0.25);
  }, [simulation]);

  useImperativeHandle(
    ref,
    () => ({
      resetView,
    }),
    [resetView]
  );

  return (
    <div
      ref={containerRef}
      className={`relative h-full w-full overflow-hidden ${className}`}
    >
      <GraphRenderer
        ref={rendererRef}
        nodes={filteredGraph.nodes}
        links={filteredGraph.links}
        graphTheme={graphTheme}
        width={size.width}
        height={size.height}
        positionsRef={simulation.positionsRef}
        selectedId={selectedId}
        highlightIds={highlightIds}
        pinNode={simulation.pinNode}
        unpinNode={simulation.unpinNode}
        onNodeSelect={handleNodeSelect}
        onNodeDoubleClick={onNodeDoubleClick}
      />

      {import.meta.env.DEV && filteredGraph.nodes.length > 0 && (
        <div className="pointer-events-none absolute bottom-2 left-2 rounded border border-theme-border bg-theme-bg-secondary/80 px-2 py-1 text-xs text-theme-text-secondary">
          节点: {filteredGraph.nodes.length} | 关系: {filteredGraph.links.length}
        </div>
      )}
    </div>
  );
});

export { transformGraphData };
export default KnowledgeGraphView;
