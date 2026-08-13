import { describe, expect, it } from "vitest";
import {
  assignSlots,
  MIN_OPEN_FLOOR_SLOT_SPACING,
  openFloorLayout,
  slotPoint,
} from "@/utils/office/openFloorLayout";

const canvas = { width: 900, height: 620 };

function roundAnchorMap(anchors) {
  return Object.fromEntries(
    Array.from(anchors.entries()).map(([id, point]) => [
      id,
      { x: Math.round(point.x), y: Math.round(point.y) },
    ])
  );
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

describe("openFloorLayout", () => {
  it("assigns deterministic anchors for the same id set regardless of order", () => {
    const first = openFloorLayout(["delta", "alpha", "charlie"], null, canvas);
    const second = openFloorLayout(["charlie", "delta", "alpha"], null, canvas);

    expect(roundAnchorMap(first.anchors)).toEqual(
      roundAnchorMap(second.anchors)
    );
    expect(Array.from(first.assignment.entries())).toEqual(
      Array.from(second.assignment.entries())
    );
  });

  it("keeps existing ids on their assigned slots when actors are added", () => {
    const initial = assignSlots(["alpha", "bravo", "charlie"], null, 8);
    const updated = assignSlots(
      ["echo", "charlie", "alpha", "bravo"],
      initial,
      8
    );

    expect(updated.get("alpha")).toBe(initial.get("alpha"));
    expect(updated.get("bravo")).toBe(initial.get("bravo"));
    expect(updated.get("charlie")).toBe(initial.get("charlie"));
  });

  it("reuses a released slot for a new id without moving retained ids", () => {
    const initial = assignSlots(["alpha", "bravo", "charlie"], null, 8);
    const afterRemoval = assignSlots(["alpha", "charlie"], initial, 8);
    const afterAdd = assignSlots(
      ["alpha", "charlie", "delta"],
      afterRemoval,
      8
    );

    expect(afterRemoval.has("bravo")).toBe(false);
    expect(afterAdd.get("delta")).toBe(initial.get("bravo"));
    expect(afterAdd.get("alpha")).toBe(initial.get("alpha"));
    expect(afterAdd.get("charlie")).toBe(initial.get("charlie"));
  });

  it("keeps generated slots at least one avatar diameter plus padding apart", () => {
    const points = Array.from({ length: 20 }, (_, index) =>
      slotPoint(index, canvas)
    );

    for (let i = 0; i < points.length; i += 1) {
      for (let j = i + 1; j < points.length; j += 1) {
        expect(distance(points[i], points[j])).toBeGreaterThanOrEqual(
          MIN_OPEN_FLOOR_SLOT_SPACING - 0.001
        );
      }
    }
  });

  it("excludes the central collaboration commons from home slots", () => {
    const points = Array.from({ length: 24 }, (_, index) =>
      slotPoint(index, canvas)
    );
    const center = { x: canvas.width / 2, y: canvas.height / 2 };
    const reservedRadius = Math.min(canvas.width, canvas.height) * 0.18;

    for (const point of points) {
      expect(distance(point, center)).toBeGreaterThanOrEqual(reservedRadius);
    }
  });

  it("prunes invalid previous slots when the slot count shrinks", () => {
    const previous = new Map([
      ["alpha", 0],
      ["bravo", 4],
      ["charlie", 8],
    ]);

    const assignment = assignSlots(["alpha", "bravo", "charlie"], previous, 3);

    expect(assignment.get("alpha")).toBe(0);
    expect(assignment.get("bravo")).toBe(1);
    expect(assignment.get("charlie")).toBe(2);
  });

  it("spreads a few agents across the floor instead of clumping in one row", () => {
    const wide = { width: 1320, height: 860 };
    const ids = ["a", "b", "c", "d", "e", "f"];
    const { anchors } = openFloorLayout(ids, new Map(), wide);
    const points = ids.map((id) => anchors.get(id));
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const xSpan = Math.max(...xs) - Math.min(...xs);
    const ySpan = Math.max(...ys) - Math.min(...ys);

    // Must use a large share of BOTH axes — not a single top row (the old bug,
    // where row-major slot fill put every agent in the top edge → ySpan ~ 0).
    expect(xSpan).toBeGreaterThan(wide.width * 0.4);
    expect(ySpan).toBeGreaterThan(wide.height * 0.3);

    let minDistance = Infinity;
    for (let i = 0; i < points.length; i += 1) {
      for (let j = i + 1; j < points.length; j += 1) {
        minDistance = Math.min(minDistance, distance(points[i], points[j]));
      }
    }
    expect(minDistance).toBeGreaterThanOrEqual(MIN_OPEN_FLOOR_SLOT_SPACING);
  });
});
