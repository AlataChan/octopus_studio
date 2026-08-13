import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  scheduleDeferredGraphTransform,
  scheduleDeferredGraphWork,
} from "@/components/WorkspaceGraph/deferredGraphWork";

const graphPageSource = readFileSync(
  resolve("src/pages/WorkspaceGraph/index.jsx"),
  "utf8"
);
const graphViewSource = readFileSync(
  resolve("src/components/WorkspaceGraph/KnowledgeGraphView.jsx"),
  "utf8"
);
const graphRendererSource = readFileSync(
  resolve("src/components/WorkspaceGraph/GraphRenderer.jsx"),
  "utf8"
);

describe("workspace graph deferred work", () => {
  it("defers graph data conversion until after animation frame and idle callbacks", () => {
    let frameCallback;
    let idleCallback;
    const requestAnimationFrameFn = vi.fn((callback) => {
      frameCallback = callback;
      return 1;
    });
    const requestIdleCallbackFn = vi.fn((callback) => {
      idleCallback = callback;
      return 2;
    });
    const transform = vi.fn(() => ({ nodes: ["d3-node"], links: [] }));
    const onComplete = vi.fn();
    const data = {
      nodes: [{ id: "node-1" }],
      links: [
        {
          source: "node-1",
          target: "node-2",
          type: "reference",
          weight: 3,
        },
      ],
      stats: { nodes: 1 },
    };

    scheduleDeferredGraphTransform({
      data,
      transform,
      onComplete,
      schedulerOptions: {
        requestAnimationFrameFn,
        cancelAnimationFrameFn: vi.fn(),
        requestIdleCallbackFn,
        cancelIdleCallbackFn: vi.fn(),
      },
    });

    expect(transform).not.toHaveBeenCalled();
    frameCallback();
    expect(requestIdleCallbackFn).toHaveBeenCalledWith(expect.any(Function), {
      timeout: 250,
    });
    expect(transform).not.toHaveBeenCalled();

    idleCallback();
    expect(transform).toHaveBeenCalledWith({
      nodes: data.nodes,
      links: [
        {
          source: "node-1",
          target: "node-2",
          relation: "reference",
          weight: 3,
        },
      ],
    });
    expect(onComplete).toHaveBeenCalledWith({
      graph: { nodes: ["d3-node"], links: [] },
      stats: data.stats,
      nodeIds: ["node-1"],
    });
  });

  it("cancels pending deferred work before callbacks run", () => {
    let frameCallback;
    const cancelAnimationFrameFn = vi.fn();
    const work = vi.fn();
    const cancel = scheduleDeferredGraphWork(work, {
      requestAnimationFrameFn: (callback) => {
        frameCallback = callback;
        return 7;
      },
      cancelAnimationFrameFn,
      requestIdleCallbackFn: vi.fn(),
      cancelIdleCallbackFn: vi.fn(),
    });

    cancel();
    frameCallback();

    expect(work).not.toHaveBeenCalled();
    expect(cancelAnimationFrameFn).toHaveBeenCalledWith(7);
  });
});

describe("workspace graph source guards", () => {
  it("schedules graph transforms and ignores stale workspace responses", () => {
    expect(graphPageSource).toContain("scheduleDeferredGraphTransform");
    expect(graphPageSource).toContain("graphRequestRef");
    expect(graphPageSource).toContain("requestId !== graphRequestRef.current");
    expect(graphPageSource).toContain("transformCancelRef.current?.()");
    expect(graphPageSource).toContain("transformGraphData");
    expect(graphPageSource).toContain("visibleTypes={activeTypes}");
    expect(graphPageSource).toContain("highlightIds={highlightIds}");
    expect(graphPageSource).toContain("<GraphSkeleton />");
    expect(graphPageSource).toContain("<GraphEmptyState />");
    expect(graphPageSource).not.toContain("animate-spin");
    expect(graphPageSource).not.toContain("transformToCytoscapeElements");
    expect(graphPageSource).not.toContain("getCyInstance");
    expect(graphPageSource).not.toContain("highlightNodes");
    expect(graphPageSource).not.toContain('theme="dark"');
  });

  it("uses the D3 simulation lifecycle without reintroducing Cytoscape", () => {
    expect(graphViewSource).toContain("useGraphSimulation");
    expect(graphViewSource).toContain("GraphRenderer");
    expect(graphViewSource).toContain("resetView");
    expect(graphRendererSource).toContain(".graphZoom");
    expect(graphRendererSource).toContain(".graphDrag");
    expect(graphRendererSource).toContain("requestAnimationFrame");
    expect(graphRendererSource).toContain("cancelAnimationFrame");
    expect(graphRendererSource).toContain("fill={graphTheme.bg}");
    expect(graphRendererSource).toContain("if (!focused) return null;");
    expect(graphRendererSource).not.toContain("radialGradient");
    expect(graphViewSource).not.toContain("cytoscape");
    expect(graphViewSource).not.toContain("getCyInstance");
    expect(graphViewSource).not.toContain("highlightNodes");
  });
});
