export const MIN_OPEN_FLOOR_SLOT_SPACING = 76;
export const OPEN_FLOOR_AVATAR_DIAMETER = 56;

const DEFAULT_CANVAS = { width: 1200, height: 800 };
const MIN_MARGIN = 48;
const MAX_MARGIN = 104;
const COMMONS_RADIUS_RATIO = 0.18;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

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

function toMap(value) {
  if (value instanceof Map) return value;
  if (!value || typeof value !== "object") return new Map();
  return new Map(Object.entries(value));
}

function sortedIds(activeIds) {
  return Array.from(new Set(activeIds || [])).sort((a, b) =>
    String(a).localeCompare(String(b))
  );
}

// Deterministic farthest-point ordering: reorders points so that taking the
// first N yields an even spread across the whole floor, instead of the raw
// row-major order (which would clump a few agents into the top-left rows).
// Seeded from the most-central point, then greedily picks the point farthest
// from everything chosen so far. Tie-breaks by (x, y) for determinism.
function spreadOrder(points) {
  const total = points.length;
  if (total <= 2) return points.slice();

  const centroid = points.reduce(
    (sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }),
    { x: 0, y: 0 }
  );
  centroid.x /= total;
  centroid.y /= total;

  const lessThan = (a, b) => a.x < b.x || (a.x === b.x && a.y < b.y);

  let seedIndex = 0;
  let seedDistance = Infinity;
  points.forEach((point, index) => {
    const distance = Math.hypot(point.x - centroid.x, point.y - centroid.y);
    if (
      distance < seedDistance - 1e-9 ||
      (Math.abs(distance - seedDistance) <= 1e-9 &&
        lessThan(point, points[seedIndex]))
    ) {
      seedDistance = distance;
      seedIndex = index;
    }
  });

  const chosen = [points[seedIndex]];
  const remaining = points.filter((_, index) => index !== seedIndex);

  while (remaining.length) {
    let bestIndex = 0;
    let bestMinDistance = -1;
    for (let i = 0; i < remaining.length; i += 1) {
      let minDistance = Infinity;
      for (const picked of chosen) {
        const distance = Math.hypot(
          remaining[i].x - picked.x,
          remaining[i].y - picked.y
        );
        if (distance < minDistance) minDistance = distance;
      }
      if (
        minDistance > bestMinDistance + 1e-9 ||
        (Math.abs(minDistance - bestMinDistance) <= 1e-9 &&
          lessThan(remaining[i], remaining[bestIndex]))
      ) {
        bestMinDistance = minDistance;
        bestIndex = i;
      }
    }
    chosen.push(remaining[bestIndex]);
    remaining.splice(bestIndex, 1);
  }

  return chosen;
}

const slotPointsCache = new Map();

function buildSlotPoints(canvas) {
  const { width, height } = normalizeCanvas(canvas);
  const cacheKey = `${width}x${height}`;
  const cached = slotPointsCache.get(cacheKey);
  if (cached) return cached;

  const minSide = Math.min(width, height);
  const margin = clamp(minSide * 0.14, MIN_MARGIN, MAX_MARGIN);
  const center = { x: width / 2, y: height / 2 };
  const commonsRadius = minSide * COMMONS_RADIUS_RATIO;
  const points = [];

  for (
    let y = margin;
    y <= height - margin + 0.001;
    y += MIN_OPEN_FLOOR_SLOT_SPACING
  ) {
    for (
      let x = margin;
      x <= width - margin + 0.001;
      x += MIN_OPEN_FLOOR_SLOT_SPACING
    ) {
      if (Math.hypot(x - center.x, y - center.y) < commonsRadius) continue;
      points.push({
        x: Number(x.toFixed(2)),
        y: Number(y.toFixed(2)),
      });
    }
  }

  const ordered = points.length
    ? spreadOrder(points)
    : [{ x: Number(margin.toFixed(2)), y: Number(margin.toFixed(2)) }];

  slotPointsCache.set(cacheKey, ordered);
  return ordered;
}

export function getOpenFloorSlotCount(canvas) {
  return buildSlotPoints(canvas).length;
}

export function assignSlots(activeIds, prevAssignment, slotCount) {
  const ids = sortedIds(activeIds);
  const activeSet = new Set(ids);
  const previous = toMap(prevAssignment);
  const safeSlotCount = Math.max(0, Math.floor(Number(slotCount) || 0));
  const assignment = new Map();
  const usedSlots = new Set();

  for (const [id, slotIndex] of previous.entries()) {
    if (!activeSet.has(id)) continue;
    if (!Number.isInteger(slotIndex)) continue;
    if (slotIndex < 0 || slotIndex >= safeSlotCount) continue;
    if (usedSlots.has(slotIndex)) continue;

    assignment.set(id, slotIndex);
    usedSlots.add(slotIndex);
  }

  let nextSlot = 0;
  for (const id of ids) {
    if (assignment.has(id)) continue;

    while (usedSlots.has(nextSlot) && nextSlot < safeSlotCount) {
      nextSlot += 1;
    }

    if (nextSlot >= safeSlotCount) break;

    assignment.set(id, nextSlot);
    usedSlots.add(nextSlot);
  }

  return assignment;
}

export function slotPoint(slotIndex, canvas) {
  const points = buildSlotPoints(canvas);
  const index = Math.floor(Number(slotIndex) || 0);
  if (index < 0) return points[0];
  return points[index] || points[points.length - 1];
}

export function openFloorLayout(activeIds, prevAssignment, canvas) {
  const slotCount = getOpenFloorSlotCount(canvas);
  const prunedPrevious = new Map(
    Array.from(toMap(prevAssignment).entries()).filter(
      ([, slotIndex]) =>
        Number.isInteger(slotIndex) && slotIndex >= 0 && slotIndex < slotCount
    )
  );
  const assignment = assignSlots(activeIds, prunedPrevious, slotCount);
  const anchors = new Map();

  for (const [id, slotIndex] of assignment.entries()) {
    anchors.set(id, slotPoint(slotIndex, canvas));
  }

  return { anchors, assignment };
}
