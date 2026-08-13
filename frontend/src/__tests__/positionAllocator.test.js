import { describe, expect, it } from "vitest";
import {
  allocateAllSeats,
  allocateSeat,
  calculateDeskSlots,
} from "@/utils/office/positionAllocator";

describe("positionAllocator", () => {
  const zone = {
    id: "z1",
    type: "workspace",
    gridSize: [4, 3],
    position: { x: 20, y: 60 },
    size: { w: 340, h: 310 },
  };

  it("calculateDeskSlots returns correct slot count", () => {
    const slots = calculateDeskSlots(zone);
    expect(slots).toHaveLength(12);
    for (const slot of slots) {
      expect(slot).toHaveProperty("x");
      expect(slot).toHaveProperty("y");
      expect(slot.x).toBeGreaterThanOrEqual(zone.position.x);
      expect(slot.y).toBeGreaterThanOrEqual(zone.position.y);
    }
  });

  it("allocateSeat returns deterministic position for same agentId", () => {
    const slots = calculateDeskSlots(zone);
    const seat1 = allocateSeat("agent-abc", slots);
    const seat2 = allocateSeat("agent-abc", slots);
    expect(seat1).toEqual(seat2);
  });

  it("different agents may get different seats", () => {
    const slots = calculateDeskSlots(zone);
    const seat1 = allocateSeat("agent-abc", slots);
    const seat2 = allocateSeat("agent-xyz", slots);
    expect(seat1).toBeDefined();
    expect(seat2).toBeDefined();
  });

  it("allocateSeat with occupied set avoids collisions", () => {
    const slots = calculateDeskSlots(zone);
    const occupied = new Set();
    const seats = [];
    for (let i = 0; i < 6; i++) {
      seats.push(allocateSeat(`agent-${i}`, slots, occupied));
    }
    const unique = new Set(seats.map((seat) => `${seat.x},${seat.y}`));
    expect(unique.size).toBe(6);
  });

  it("allocateSeat overflows gracefully when all slots occupied", () => {
    const tinyZone = { ...zone, gridSize: [1, 2] };
    const slots = calculateDeskSlots(tinyZone);
    const occupied = new Set();
    allocateSeat("agent-a", slots, occupied);
    allocateSeat("agent-b", slots, occupied);
    const overflow = allocateSeat("agent-c", slots, occupied);
    expect(overflow).toBeDefined();
    expect(overflow).toHaveProperty("x");
    expect(overflow).toHaveProperty("y");
  });

  it("places actors into the primary workspace zone when only one workspace zone exists", () => {
    const actors = new Map([
      [
        "assistant-1",
        {
          id: "assistant-1",
          workspaceSlug: "phase0-test-1771569052949",
        },
      ],
    ]);
    const layout = {
      zones: [
        {
          ...zone,
          id: "zone-default",
          workspaceSlug: "default",
        },
        {
          id: "hot-desk",
          type: "hotdesk",
          gridSize: [6, 2],
          position: { x: 20, y: 470 },
          size: { w: 540, h: 260 },
        },
      ],
    };

    const seatMap = allocateAllSeats(actors, layout);

    expect(seatMap.get("assistant-1").zoneId).toBe("zone-default");
  });
});
