import { describe, expect, it, vi } from "vitest";
import { createGraphSimulationController } from "@/components/WorkspaceGraph/useGraphSimulation";

describe("createGraphSimulationController", () => {
  it("stops the simulation and prevents later ticks from writing positions", () => {
    const tickHandlers = [];
    const endHandlers = [];
    const simulation = {
      on: vi.fn((eventName, handler) => {
        if (eventName === "tick") tickHandlers.push(handler);
        if (eventName === "end") endHandlers.push(handler);
        return simulation;
      }),
      alpha: vi.fn(() => simulation),
      restart: vi.fn(() => simulation),
      stop: vi.fn(() => simulation),
    };
    const createSimulation = vi.fn(() => simulation);
    const requestAnimationFrameFn = vi.fn((callback) => {
      callback();
      return 1;
    });
    const nodes = [{ id: "node-1", x: 10, y: 20 }];
    const positionsRef = { current: new Map() };

    const controller = createGraphSimulationController({
      nodes,
      links: [],
      width: 400,
      height: 300,
      positionsRef,
      createSimulation,
      requestAnimationFrameFn,
      cancelAnimationFrameFn: vi.fn(),
    });

    tickHandlers[0]();
    expect(positionsRef.current.get("node-1")).toEqual({ x: 10, y: 20 });

    controller.stop();
    nodes[0].x = 40;
    nodes[0].y = 50;
    tickHandlers[0]();

    expect(simulation.stop).toHaveBeenCalledTimes(1);
    expect(positionsRef.current.get("node-1")).toEqual({ x: 10, y: 20 });
  });
});
