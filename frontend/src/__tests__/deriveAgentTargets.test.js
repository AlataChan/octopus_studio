import { describe, expect, it } from "vitest";
import {
  deriveAgentTargets,
  MIN_AGENT_TARGET_SPACING,
} from "@/utils/office/deriveAgentTargets";

const canvas = { width: 640, height: 420 };

function anchorsFrom(entries) {
  return new Map(entries);
}

function link(id, source, target, strength = 0.8) {
  return { id, source, target, strength };
}

function distance(a, b) {
  return Math.hypot(a.targetX - b.targetX, a.targetY - b.targetY);
}

function minGroupDistance(targets, leftIds, rightIds) {
  let minDistance = Infinity;
  for (const leftId of leftIds) {
    for (const rightId of rightIds) {
      minDistance = Math.min(
        minDistance,
        distance(targets.get(leftId), targets.get(rightId))
      );
    }
  }
  return minDistance;
}

function roundedTargets(targets) {
  return Array.from(targets.entries())
    .sort(([left], [right]) => String(left).localeCompare(String(right)))
    .map(([id, target]) => [
      id,
      {
        targetX: Number(target.targetX.toFixed(2)),
        targetY: Number(target.targetY.toFixed(2)),
        collaborating: target.collaborating,
      },
    ]);
}

describe("deriveAgentTargets", () => {
  it("keeps unlinked agents at their home anchors", () => {
    const anchors = anchorsFrom([
      ["a", { x: 100, y: 100 }],
      ["b", { x: 520, y: 100 }],
    ]);

    const targets = deriveAgentTargets(["b", "a"], [], anchors, canvas);

    expect(targets.get("a")).toEqual({
      targetX: 100,
      targetY: 100,
      collaborating: false,
    });
    expect(targets.get("b")).toEqual({
      targetX: 520,
      targetY: 100,
      collaborating: false,
    });
  });

  it("moves linked pairs to deterministic ring positions around a center-pulled centroid", () => {
    const anchors = anchorsFrom([
      ["a", { x: 100, y: 100 }],
      ["b", { x: 540, y: 100 }],
    ]);

    const targets = deriveAgentTargets(
      ["b", "a"],
      [link("ab", "a", "b")],
      anchors,
      canvas
    );
    const a = targets.get("a");
    const b = targets.get("b");

    expect(a.collaborating).toBe(true);
    expect(b.collaborating).toBe(true);
    expect(distance(a, b)).toBeGreaterThanOrEqual(
      MIN_AGENT_TARGET_SPACING - 0.01
    );
    expect((a.targetY + b.targetY) / 2).toBeGreaterThan(100);
    expect(a.targetX).toBeLessThan(b.targetX);
  });

  it("treats chains as one connected collaboration component", () => {
    const anchors = anchorsFrom([
      ["a", { x: 100, y: 120 }],
      ["b", { x: 300, y: 90 }],
      ["c", { x: 520, y: 130 }],
    ]);

    const targets = deriveAgentTargets(
      ["c", "b", "a"],
      [link("ab", "a", "b"), link("bc", "b", "c")],
      anchors,
      canvas
    );

    expect(targets.get("a").collaborating).toBe(true);
    expect(targets.get("b").collaborating).toBe(true);
    expect(targets.get("c").collaborating).toBe(true);
    expect(distance(targets.get("a"), targets.get("b"))).toBeGreaterThanOrEqual(
      MIN_AGENT_TARGET_SPACING - 0.01
    );
    expect(distance(targets.get("b"), targets.get("c"))).toBeGreaterThanOrEqual(
      MIN_AGENT_TARGET_SPACING - 0.01
    );
  });

  it("supports star-shaped collaboration components", () => {
    const anchors = anchorsFrom([
      ["hub", { x: 320, y: 72 }],
      ["b", { x: 120, y: 290 }],
      ["c", { x: 320, y: 340 }],
      ["d", { x: 520, y: 290 }],
    ]);

    const targets = deriveAgentTargets(
      ["d", "hub", "c", "b"],
      [
        link("hub-b", "hub", "b"),
        link("hub-c", "hub", "c"),
        link("hub-d", "hub", "d"),
      ],
      anchors,
      canvas
    );

    expect(Array.from(targets.values()).every((target) => target.collaborating))
      .toBe(true);
    expect(distance(targets.get("hub"), targets.get("b"))).toBeGreaterThanOrEqual(
      MIN_AGENT_TARGET_SPACING - 0.01
    );
  });

  it("keeps independent link clusters separate", () => {
    const anchors = anchorsFrom([
      ["a", { x: 80, y: 90 }],
      ["b", { x: 220, y: 120 }],
      ["c", { x: 430, y: 290 }],
      ["d", { x: 560, y: 320 }],
    ]);

    const targets = deriveAgentTargets(
      ["d", "c", "b", "a"],
      [link("ab", "a", "b"), link("cd", "c", "d")],
      anchors,
      canvas
    );
    const leftClusterMidX =
      (targets.get("a").targetX + targets.get("b").targetX) / 2;
    const rightClusterMidX =
      (targets.get("c").targetX + targets.get("d").targetX) / 2;

    expect(targets.get("a").collaborating).toBe(true);
    expect(targets.get("d").collaborating).toBe(true);
    expect(rightClusterMidX).toBeGreaterThan(leftClusterMidX + 120);
  });

  it("pushes overlapping independent multi-member clusters into separate spaces deterministically", () => {
    const anchors = anchorsFrom([
      ["a1", { x: 290, y: 190 }],
      ["a2", { x: 300, y: 200 }],
      ["a3", { x: 310, y: 190 }],
      ["b1", { x: 330, y: 205 }],
      ["b2", { x: 340, y: 215 }],
      ["b3", { x: 350, y: 205 }],
    ]);
    const links = [
      link("a1-a2", "a1", "a2"),
      link("a2-a3", "a2", "a3"),
      link("b1-b2", "b1", "b2"),
      link("b2-b3", "b2", "b3"),
    ];

    const first = deriveAgentTargets(
      ["b3", "a3", "b2", "a2", "b1", "a1"],
      links,
      anchors,
      canvas
    );
    const second = deriveAgentTargets(
      ["a1", "b1", "a2", "b2", "a3", "b3"],
      [...links].reverse(),
      anchors,
      canvas
    );

    expect(
      minGroupDistance(first, ["a1", "a2", "a3"], ["b1", "b2", "b3"])
    ).toBeGreaterThanOrEqual(MIN_AGENT_TARGET_SPACING - 0.01);
    expect(roundedTargets(second)).toEqual(roundedTargets(first));
  });

  it("is deterministic regardless of actor or link input order", () => {
    const anchors = anchorsFrom([
      ["a", { x: 90, y: 110 }],
      ["b", { x: 240, y: 80 }],
      ["c", { x: 410, y: 120 }],
      ["d", { x: 560, y: 150 }],
    ]);
    const links = [
      link("bc", "b", "c"),
      link("ab", "a", "b"),
      link("cd", "c", "d"),
    ];

    const first = deriveAgentTargets(
      ["a", "b", "c", "d"],
      links,
      anchors,
      canvas
    );
    const second = deriveAgentTargets(
      ["d", "c", "b", "a"],
      [...links].reverse(),
      anchors,
      canvas
    );

    expect(roundedTargets(second)).toEqual(roundedTargets(first));
  });

  it("separates dense clusters so avatar targets do not overlap", () => {
    const anchors = anchorsFrom([
      ["a", { x: 300, y: 200 }],
      ["b", { x: 310, y: 205 }],
      ["c", { x: 320, y: 198 }],
      ["d", { x: 330, y: 210 }],
      ["e", { x: 340, y: 202 }],
    ]);
    const targets = deriveAgentTargets(
      ["a", "b", "c", "d", "e"],
      [
        link("ab", "a", "b"),
        link("bc", "b", "c"),
        link("cd", "c", "d"),
        link("de", "d", "e"),
      ],
      anchors,
      canvas
    );
    const values = Array.from(targets.values());

    for (let left = 0; left < values.length; left += 1) {
      for (let right = left + 1; right < values.length; right += 1) {
        expect(distance(values[left], values[right])).toBeGreaterThanOrEqual(
          MIN_AGENT_TARGET_SPACING - 0.01
        );
      }
    }
  });
});
