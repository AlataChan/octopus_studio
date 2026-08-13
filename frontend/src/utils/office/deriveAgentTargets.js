export const MIN_AGENT_TARGET_SPACING = 52;

const DEFAULT_CANVAS = { width: 1200, height: 800 };
const CENTER_PULL = 0.14;
const BASE_RING_RADIUS = 52;
const RING_RADIUS_STEP = 8;
const CLUSTER_MARGIN = MIN_AGENT_TARGET_SPACING * 0.6;
const CLUSTER_EDGE_PADDING = 12;
const MAX_CLUSTER_SEPARATION_PASSES = 16;

function normalizeCanvas(canvas) {
  const width =
    Number.isFinite(canvas?.width) && canvas.width > 0
      ? canvas.width
      : DEFAULT_CANVAS.width;
  const height =
    Number.isFinite(canvas?.height) && canvas.height > 0
      ? canvas.height
      : DEFAULT_CANVAS.height;
  return { width, height };
}

function sortedUniqueIds(ids) {
  return Array.from(new Set(ids || [])).sort((left, right) =>
    String(left).localeCompare(String(right))
  );
}

function readAnchor(anchors, id) {
  if (anchors instanceof Map) return anchors.get(id);
  return anchors?.[id];
}

function hasAnchor(anchors, id) {
  const anchor = readAnchor(anchors, id);
  return Number.isFinite(anchor?.x) && Number.isFinite(anchor?.y);
}

function roundTwo(value) {
  return Number(value.toFixed(2));
}

function clamp(value, min, max) {
  if (max < min) return (min + max) / 2;
  return Math.min(Math.max(value, min), max);
}

function buildAdjacency(actorIds, links, anchors) {
  const activeIds = sortedUniqueIds(actorIds).filter((id) =>
    hasAnchor(anchors, id)
  );
  const activeSet = new Set(activeIds);
  const adjacency = new Map(activeIds.map((id) => [id, new Set()]));

  for (const link of links || []) {
    const source = link?.source;
    const target = link?.target;
    if (source === target) continue;
    if (!activeSet.has(source) || !activeSet.has(target)) continue;
    if (!hasAnchor(anchors, source) || !hasAnchor(anchors, target)) continue;

    adjacency.get(source).add(target);
    adjacency.get(target).add(source);
  }

  return { activeIds, adjacency };
}

function connectedComponents(activeIds, adjacency) {
  const visited = new Set();
  const components = [];

  for (const actorId of activeIds) {
    if (visited.has(actorId)) continue;

    const component = [];
    const stack = [actorId];
    visited.add(actorId);

    while (stack.length) {
      const current = stack.pop();
      component.push(current);
      const neighbors = Array.from(adjacency.get(current) || []).sort(
        (left, right) => String(right).localeCompare(String(left))
      );

      for (const next of neighbors) {
        if (visited.has(next)) continue;
        visited.add(next);
        stack.push(next);
      }
    }

    components.push(
      component.sort((left, right) => String(left).localeCompare(String(right)))
    );
  }

  return components;
}

function componentCenter(component, anchors, canvas) {
  const centroid = component.reduce(
    (sum, actorId) => {
      const anchor = readAnchor(anchors, actorId);
      return { x: sum.x + anchor.x, y: sum.y + anchor.y };
    },
    { x: 0, y: 0 }
  );
  centroid.x /= component.length;
  centroid.y /= component.length;

  const commons = { x: canvas.width / 2, y: canvas.height / 2 };
  return {
    x: centroid.x + (commons.x - centroid.x) * CENTER_PULL,
    y: centroid.y + (commons.y - centroid.y) * CENTER_PULL,
  };
}

function collaborationRadius(memberCount) {
  const growingRadius =
    BASE_RING_RADIUS + Math.max(0, memberCount - 2) * RING_RADIUS_STEP;
  const spacingRadius =
    (memberCount * MIN_AGENT_TARGET_SPACING) / (2 * Math.PI);
  return Math.max(growingRadius, spacingRadius);
}

function ringAngle(index, memberCount) {
  if (memberCount === 2) return index === 0 ? Math.PI : 0;
  return -Math.PI / 2 + (index * Math.PI * 2) / memberCount;
}

function clampClusterCenter(center, radius, canvas) {
  const margin = radius + CLUSTER_EDGE_PADDING;
  return {
    x: clamp(center.x, margin, canvas.width - margin),
    y: clamp(center.y, margin, canvas.height - margin),
  };
}

function separateClusters(clusters, canvas) {
  const separated = clusters.map((cluster) => ({
    ...cluster,
    center: clampClusterCenter(cluster.center, cluster.radius, canvas),
  }));

  for (let pass = 0; pass < MAX_CLUSTER_SEPARATION_PASSES; pass += 1) {
    let changed = false;

    for (let left = 0; left < separated.length; left += 1) {
      for (let right = left + 1; right < separated.length; right += 1) {
        const leftCluster = separated[left];
        const rightCluster = separated[right];
        const dx = rightCluster.center.x - leftCluster.center.x;
        const dy = rightCluster.center.y - leftCluster.center.y;
        const distance = Math.hypot(dx, dy);
        const minDistance = leftCluster.radius + rightCluster.radius;

        if (distance >= minDistance - 0.001) continue;

        const unitX = distance > 0 ? dx / distance : 1;
        const unitY = distance > 0 ? dy / distance : 0;
        const push = (minDistance - distance) / 2;

        leftCluster.center = clampClusterCenter(
          {
            x: leftCluster.center.x - unitX * push,
            y: leftCluster.center.y - unitY * push,
          },
          leftCluster.radius,
          canvas
        );
        rightCluster.center = clampClusterCenter(
          {
            x: rightCluster.center.x + unitX * push,
            y: rightCluster.center.y + unitY * push,
          },
          rightCluster.radius,
          canvas
        );
        changed = true;
      }
    }

    if (!changed) break;
  }

  return separated;
}

function separatedTargets(points, center) {
  const adjusted = points.map((point) => ({ ...point }));

  for (let left = 0; left < adjusted.length; left += 1) {
    for (let right = left + 1; right < adjusted.length; right += 1) {
      const leftPoint = adjusted[left];
      const rightPoint = adjusted[right];
      const dx = rightPoint.targetX - leftPoint.targetX;
      const dy = rightPoint.targetY - leftPoint.targetY;
      const distance = Math.hypot(dx, dy);
      if (distance >= MIN_AGENT_TARGET_SPACING) continue;

      const fallbackAngle = ringAngle(left, adjusted.length);
      const unitX =
        distance > 0 ? dx / distance : Math.cos(fallbackAngle) || 1;
      const unitY = distance > 0 ? dy / distance : Math.sin(fallbackAngle);
      const push = (MIN_AGENT_TARGET_SPACING - distance) / 2;

      leftPoint.targetX -= unitX * push;
      leftPoint.targetY -= unitY * push;
      rightPoint.targetX += unitX * push;
      rightPoint.targetY += unitY * push;
    }
  }

  return adjusted.map((point) => {
    const dx = point.targetX - center.x;
    const dy = point.targetY - center.y;
    return {
      ...point,
      targetX: roundTwo(center.x + dx),
      targetY: roundTwo(center.y + dy),
    };
  });
}

function collaborationTargets(component, center) {
  const radius = collaborationRadius(component.length);
  const points = component.map((actorId, index) => {
    const angle = ringAngle(index, component.length);
    return {
      actorId,
      targetX: center.x + Math.cos(angle) * radius,
      targetY: center.y + Math.sin(angle) * radius,
    };
  });

  return separatedTargets(points, center);
}

export function deriveAgentTargets(actorIds, links, anchors, canvas) {
  const normalizedCanvas = normalizeCanvas(canvas);
  const { activeIds, adjacency } = buildAdjacency(actorIds, links, anchors);
  const components = connectedComponents(activeIds, adjacency);
  const targets = new Map();
  const collaborationClusters = [];

  for (const component of components) {
    if (component.length === 1) {
      const actorId = component[0];
      const anchor = readAnchor(anchors, actorId);
      targets.set(actorId, {
        targetX: anchor.x,
        targetY: anchor.y,
        collaborating: false,
      });
      continue;
    }

    const ringRadius = collaborationRadius(component.length);
    collaborationClusters.push({
      component,
      center: componentCenter(component, anchors, normalizedCanvas),
      radius: ringRadius + CLUSTER_MARGIN,
    });
  }

  for (const cluster of separateClusters(
    collaborationClusters,
    normalizedCanvas
  )) {
    for (const point of collaborationTargets(cluster.component, cluster.center)) {
      targets.set(point.actorId, {
        targetX: point.targetX,
        targetY: point.targetY,
        collaborating: true,
      });
    }
  }

  return targets;
}
