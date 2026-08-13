import { useEffect, useMemo, useRef } from "react";
import {
  assignClusters,
  createForces,
  normalizeLinkEndpoint,
} from "./layoutForces";

function defaultRaf(callback) {
  if (typeof window !== "undefined" && window.requestAnimationFrame) {
    return window.requestAnimationFrame(callback);
  }
  return setTimeout(callback, 16);
}

function defaultCancelRaf(frameId) {
  if (typeof window !== "undefined" && window.cancelAnimationFrame) {
    window.cancelAnimationFrame(frameId);
    return;
  }
  clearTimeout(frameId);
}

export function createGraphSimulationController({
  nodes = [],
  links = [],
  width = 800,
  height = 600,
  positionsRef,
  createSimulation = createForces,
  requestAnimationFrameFn = defaultRaf,
  cancelAnimationFrameFn = defaultCancelRaf,
  onTick,
} = {}) {
  const clusters = assignClusters(nodes, links);
  const simulation = createSimulation({ nodes, links, width, height, clusters });
  let active = true;
  let frameId = null;

  const writePositions = () => {
    frameId = null;
    if (!active || !positionsRef) return;

    const nextPositions = new Map();
    for (const node of nodes) {
      nextPositions.set(node.id, {
        x: typeof node.x === "number" ? node.x : width / 2,
        y: typeof node.y === "number" ? node.y : height / 2,
      });
    }
    positionsRef.current = nextPositions;
    onTick?.(nextPositions);
  };

  const scheduleWrite = () => {
    if (!active || frameId !== null) return;
    frameId = requestAnimationFrameFn(writePositions);
  };

  simulation.on?.("tick", scheduleWrite);
  simulation.on?.("end", scheduleWrite);
  scheduleWrite();

  const findNode = (nodeId) => nodes.find((node) => node.id === nodeId);

  return {
    simulation,
    stop() {
      active = false;
      if (frameId !== null) {
        cancelAnimationFrameFn(frameId);
        frameId = null;
      }
      simulation.on?.("tick", null);
      simulation.on?.("end", null);
      simulation.stop?.();
    },
    restart(alpha = 0.45) {
      if (!active) return;
      simulation.alpha?.(alpha);
      simulation.restart?.();
    },
    pinNode(nodeId, x, y) {
      const node = findNode(nodeId);
      if (!node) return;
      node.fx = x;
      node.fy = y;
      node.x = x;
      node.y = y;
      writePositions();
      this.restart(0.35);
    },
    unpinNode(nodeId) {
      const node = findNode(nodeId);
      if (!node) return;
      node.fx = null;
      node.fy = null;
      this.restart(0.25);
    },
  };
}

export default function useGraphSimulation({
  nodes = [],
  links = [],
  width = 800,
  height = 600,
  onTick,
} = {}) {
  const positionsRef = useRef(new Map());
  const controllerRef = useRef(null);

  const simulationNodes = useMemo(
    () => nodes.map((node) => ({ ...node })),
    [nodes]
  );
  const simulationLinks = useMemo(
    () =>
      links.map((link) => ({
        ...link,
        source: normalizeLinkEndpoint(link.source),
        target: normalizeLinkEndpoint(link.target),
      })),
    [links]
  );

  useEffect(() => {
    positionsRef.current = new Map();
    controllerRef.current?.stop();
    controllerRef.current = createGraphSimulationController({
      nodes: simulationNodes,
      links: simulationLinks,
      width,
      height,
      positionsRef,
      onTick,
    });

    return () => {
      controllerRef.current?.stop();
      controllerRef.current = null;
    };
  }, [simulationNodes, simulationLinks, width, height, onTick]);

  return {
    positionsRef,
    pinNode: (...args) => controllerRef.current?.pinNode(...args),
    unpinNode: (...args) => controllerRef.current?.unpinNode(...args),
    restart: (...args) => controllerRef.current?.restart(...args),
    stop: () => controllerRef.current?.stop(),
  };
}
