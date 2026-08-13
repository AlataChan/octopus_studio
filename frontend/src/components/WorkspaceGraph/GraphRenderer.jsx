import {
  forwardRef,
  useEffect,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { drag } from "d3-drag";
import { select } from "d3-selection";
import { zoom, zoomIdentity } from "d3-zoom";
import { normalizeLinkEndpoint, nodeRadius } from "./layoutForces";

function linkKey(link, index) {
  const source = normalizeLinkEndpoint(link.source);
  const target = normalizeLinkEndpoint(link.target);
  return link.id || `${source}-${target}-${link.relation || "edge"}-${index}`;
}

function getPosition(positionsRef, nodeId, fallback) {
  return positionsRef.current?.get(nodeId) || fallback;
}

function pathForLink(link, positionsRef, nodeById, width, height) {
  const sourceId = normalizeLinkEndpoint(link.source);
  const targetId = normalizeLinkEndpoint(link.target);
  const sourceFallback = nodeById.get(sourceId) || { x: width / 2, y: height / 2 };
  const targetFallback = nodeById.get(targetId) || { x: width / 2, y: height / 2 };
  const source = getPosition(positionsRef, sourceId, sourceFallback);
  const target = getPosition(positionsRef, targetId, targetFallback);
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const distance = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
  const curve = Math.min(34, distance * 0.16);
  const midX = (source.x + target.x) / 2 - (dy / distance) * curve;
  const midY = (source.y + target.y) / 2 + (dx / distance) * curve;

  return `M${source.x},${source.y} Q${midX},${midY} ${target.x},${target.y}`;
}

function nodeColors(node, graphTheme) {
  return graphTheme.node[node.type] || graphTheme.node.chat;
}

function isNodeFocused(nodeId, focusSet, selectedId) {
  return focusSet.has(nodeId) || selectedId === nodeId;
}

function AvatarClip({ id, node, radius }) {
  if (!node.avatar) return null;
  return (
    <>
      <clipPath id={id}>
        <circle r={Math.max(radius - 4, 1)} />
      </clipPath>
      <image
        href={node.avatar}
        x={-radius + 4}
        y={-radius + 4}
        width={(radius - 4) * 2}
        height={(radius - 4) * 2}
        clipPath={`url(#${id})`}
        preserveAspectRatio="xMidYMid slice"
      />
    </>
  );
}

const GraphRenderer = forwardRef(function GraphRenderer(
  {
    nodes = [],
    links = [],
    graphTheme,
    width = 800,
    height = 600,
    positionsRef,
    selectedId,
    highlightIds = [],
    pinNode,
    unpinNode,
    onNodeSelect,
    onNodeDoubleClick,
  },
  ref
) {
  const svgRef = useRef(null);
  const stageRef = useRef(null);
  const zoomBehaviorRef = useRef(null);
  const animationRef = useRef(null);
  const [hoverId, setHoverId] = useState(null);
  const uniqueId = useId().replace(/:/g, "");
  const glowId = `graph-glow-${uniqueId}`;

  const nodeById = useMemo(
    () => new Map(nodes.map((node) => [node.id, node])),
    [nodes]
  );

  const neighborsById = useMemo(() => {
    const neighbors = new Map(nodes.map((node) => [node.id, new Set()]));
    for (const link of links) {
      const source = normalizeLinkEndpoint(link.source);
      const target = normalizeLinkEndpoint(link.target);
      neighbors.get(source)?.add(target);
      neighbors.get(target)?.add(source);
    }
    return neighbors;
  }, [links, nodes]);

  const focusSet = useMemo(() => {
    const set = new Set(highlightIds || []);
    if (hoverId) {
      set.add(hoverId);
      neighborsById.get(hoverId)?.forEach((id) => set.add(id));
    }
    if (selectedId) {
      set.add(selectedId);
      neighborsById.get(selectedId)?.forEach((id) => set.add(id));
    }
    return set;
  }, [highlightIds, hoverId, neighborsById, selectedId]);

  useEffect(() => {
    if (!svgRef.current || !stageRef.current) return;
    const svg = select(svgRef.current);
    const stage = select(stageRef.current);
    const behavior = zoom()
      .scaleExtent([0.22, 3])
      .on("zoom.graphZoom", (event) => {
        stage.attr("transform", event.transform.toString());
      });

    svg.call(behavior);
    zoomBehaviorRef.current = behavior;

    return () => {
      svg.on(".zoom", null);
      zoomBehaviorRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!stageRef.current) return;
    const selection = select(stageRef.current)
      .selectAll(".graph-node")
      .call(
        drag()
          .subject(function subject() {
            const nodeId = this.getAttribute("data-node-id");
            const fallback = nodeById.get(nodeId) || { x: width / 2, y: height / 2 };
            return getPosition(positionsRef, nodeId, fallback);
          })
          .on("start.graphDrag", function onStart(event) {
            event.sourceEvent?.stopPropagation?.();
            const nodeId = this.getAttribute("data-node-id");
            const position = getPosition(
              positionsRef,
              nodeId,
              nodeById.get(nodeId) || { x: width / 2, y: height / 2 }
            );
            pinNode?.(nodeId, position.x, position.y);
          })
          .on("drag.graphDrag", function onDrag(event) {
            const nodeId = this.getAttribute("data-node-id");
            pinNode?.(nodeId, event.x, event.y);
          })
          .on("end.graphDrag", function onEnd(event) {
            const nodeId = this.getAttribute("data-node-id");
            if (!event.sourceEvent?.shiftKey) {
              unpinNode?.(nodeId);
            }
          })
      );

    return () => {
      selection.on(".graphDrag", null);
    };
  }, [nodes, nodeById, pinNode, positionsRef, unpinNode, width, height]);

  useEffect(() => {
    let active = true;
    const draw = () => {
      if (!active || !stageRef.current) return;

      const stage = select(stageRef.current);
      stage.selectAll(".graph-edge").attr("d", function setPath(_datum, index) {
        const link = links[index];
        return link ? pathForLink(link, positionsRef, nodeById, width, height) : "";
      });
      stage
        .selectAll(".graph-node, .graph-cluster-halo")
        .attr("transform", function setTransform() {
          const nodeId = this.getAttribute("data-node-id");
          const fallback = nodeById.get(nodeId) || { x: width / 2, y: height / 2 };
          const position = getPosition(positionsRef, nodeId, fallback);
          return `translate(${position.x},${position.y})`;
        });

      animationRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      active = false;
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };
  }, [links, nodeById, positionsRef, width, height]);

  useImperativeHandle(
    ref,
    () => ({
      resetView() {
        if (!svgRef.current || !zoomBehaviorRef.current) return;
        select(svgRef.current)
          .transition()
          .duration(320)
          .call(zoomBehaviorRef.current.transform, zoomIdentity);
      },
    }),
    []
  );

  const hasFocus = focusSet.size > 0;
  const assistantNodes = nodes.filter((node) => node.type === "assistant");

  return (
    <svg
      ref={svgRef}
      className="h-full w-full touch-none"
      role="img"
      aria-label="Knowledge Graph Visualization"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      onClick={(event) => {
        if (event.target === event.currentTarget) onNodeSelect?.(null);
      }}
    >
      <defs>
        <filter id={glowId} x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="8" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <rect width={width} height={height} fill={graphTheme.bg} />

      <g ref={stageRef}>
        <g className="graph-cluster-halos" aria-hidden="true">
          {assistantNodes.map((node) => {
            const focused = isNodeFocused(node.id, focusSet, selectedId);
            if (!focused) return null;
            return (
              <circle
                key={`halo-${node.id}`}
                className="graph-cluster-halo pointer-events-none"
                data-node-id={node.id}
                r={92}
                fill={graphTheme.halo}
                opacity={0.42}
                filter={`url(#${glowId})`}
              />
            );
          })}
        </g>

        <g className="graph-edges">
          {links.map((link, index) => {
            const source = normalizeLinkEndpoint(link.source);
            const target = normalizeLinkEndpoint(link.target);
            const focused = focusSet.has(source) || focusSet.has(target);
            const dimmed = hasFocus && !focused;
            return (
              <path
                key={linkKey(link, index)}
                className="graph-edge"
                d=""
                fill="none"
                stroke={focused ? graphTheme.edge.focus : graphTheme.edge.color}
                strokeWidth={focused ? 2.3 : Math.max(1, Number(link.weight || 1))}
                strokeLinecap="round"
                opacity={dimmed ? 0.12 : focused ? 0.88 : 0.54}
              />
            );
          })}
        </g>

        <g className="graph-nodes">
          {nodes.map((node) => {
            const colors = nodeColors(node, graphTheme);
            const radius = nodeRadius(node);
            const focused = isNodeFocused(node.id, focusSet, selectedId);
            const dimmed = hasFocus && !focusSet.has(node.id);
            const clipId = `avatar-${uniqueId}-${node.id.replace(/[^a-z0-9_-]/gi, "")}`;

            return (
              <g
                key={node.id}
                className="graph-node cursor-pointer select-none"
                data-node-id={node.id}
                opacity={dimmed ? 0.25 : 1}
                onMouseEnter={() => setHoverId(node.id)}
                onMouseLeave={() => setHoverId(null)}
                onClick={(event) => {
                  event.stopPropagation();
                  onNodeSelect?.(node);
                }}
                onDoubleClick={(event) => {
                  event.stopPropagation();
                  onNodeDoubleClick?.(node);
                }}
              >
                {node.type === "tag" ? (
                  <rect
                    x={-radius}
                    y={-radius}
                    width={radius * 2}
                    height={radius * 2}
                    rx="2"
                    transform="rotate(45)"
                    fill={colors.fill}
                    stroke={focused ? graphTheme.accent : colors.stroke}
                    strokeWidth={focused ? 2 : 1.2}
                  />
                ) : (
                  <circle
                    r={radius}
                    fill={colors.fill}
                    stroke={focused ? graphTheme.accent : colors.stroke}
                    strokeWidth={focused ? 3 : node.type === "assistant" ? 2.5 : 1.4}
                    filter={focused ? `url(#${glowId})` : undefined}
                  />
                )}
                {node.type === "assistant" && (
                  <AvatarClip id={clipId} node={node} radius={radius} />
                )}
                <text
                  y={radius + 15}
                  textAnchor="middle"
                  fill={focused ? graphTheme.text.primary : colors.label}
                  fontSize={node.type === "assistant" ? 12 : 10}
                  fontWeight={node.type === "assistant" ? 700 : 500}
                  paintOrder="stroke"
                  stroke={graphTheme.bg}
                  strokeWidth="3"
                  strokeLinejoin="round"
                  style={{ pointerEvents: "none" }}
                >
                  {node.label?.length > 22
                    ? `${node.label.slice(0, 21)}...`
                    : node.label}
                </text>
              </g>
            );
          })}
        </g>
      </g>
    </svg>
  );
});

export default GraphRenderer;
