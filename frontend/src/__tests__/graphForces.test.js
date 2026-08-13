import { describe, expect, it } from "vitest";
import {
  assignClusters,
  createForces,
  nodeRadius,
  normalizeLinkEndpoint,
} from "@/components/WorkspaceGraph/layoutForces";

describe("layoutForces", () => {
  it("sizes nodes by type and degree", () => {
    expect(nodeRadius({ type: "assistant", degree: 10 })).toBe(28);
    expect(nodeRadius({ type: "doc", degree: 9 })).toBe(13);
    expect(nodeRadius({ type: "chat", degree: 3 })).toBe(6);
    expect(nodeRadius({ type: "tag", degree: 3 })).toBe(6);
  });

  it("assigns non-assistant nodes to the assistant with most links", () => {
    const nodes = [
      { id: "assistant-a", type: "assistant" },
      { id: "assistant-b", type: "assistant" },
      { id: "chat-1", type: "chat" },
      { id: "doc-1", type: "doc" },
      { id: "tag-1", type: "tag" },
    ];
    const links = [
      { source: "assistant-a", target: "chat-1" },
      { source: "assistant-a", target: "doc-1" },
      { source: "assistant-b", target: "doc-1" },
    ];

    const clusters = assignClusters(nodes, links);

    expect(clusters.get("assistant-a")).toBe("assistant-a");
    expect(clusters.get("assistant-b")).toBe("assistant-b");
    expect(clusters.get("chat-1")).toBe("assistant-a");
    expect(clusters.get("doc-1")).toBe("assistant-a");
    expect(clusters.get("tag-1")).toBe(null);
  });

  it("normalizes d3-mutated link endpoints", () => {
    expect(normalizeLinkEndpoint({ id: "node-object" })).toBe("node-object");
    expect(normalizeLinkEndpoint("node-string")).toBe("node-string");
  });

  it("creates a named force simulation", () => {
    const nodes = [
      { id: "assistant-a", type: "assistant", degree: 2 },
      { id: "chat-1", type: "chat", degree: 1 },
    ];
    const links = [{ source: "assistant-a", target: "chat-1" }];
    const clusters = assignClusters(nodes, links);

    const simulation = createForces({
      nodes,
      links,
      width: 800,
      height: 600,
      clusters,
    });

    expect(simulation.force("link")).toBeTruthy();
    expect(simulation.force("charge")).toBeTruthy();
    expect(simulation.force("collide")).toBeTruthy();
    expect(simulation.force("clusterX")).toBeTruthy();
    expect(simulation.force("clusterY")).toBeTruthy();
    expect(simulation.velocityDecay()).toBe(0.4);
    expect(simulation.alphaMin()).toBe(0.001);

    simulation.stop();
  });
});
