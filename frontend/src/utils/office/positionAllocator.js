function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function calculateDeskSlots(zone) {
  const [cols, rows] = zone.gridSize || [4, 3];
  const { x, y } = zone.position;
  const { w, h } = zone.size;
  const padding = 20;
  const slotW = (w - padding * 2) / cols;
  const slotH = (h - padding * 2) / rows;
  const slots = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      slots.push({
        x: x + padding + col * slotW + slotW / 2,
        y: y + padding + row * slotH + slotH / 2,
      });
    }
  }

  return slots;
}

export function calculateMeetingSeats(zone, count) {
  const cx = zone.position.x + zone.size.w / 2;
  const cy = zone.position.y + zone.size.h / 2;
  const radius = Math.min(zone.size.w, zone.size.h) / 3;
  const seats = [];

  for (let i = 0; i < count; i++) {
    const angle = (2 * Math.PI * i) / count - Math.PI / 2;
    seats.push({
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    });
  }

  return seats;
}

export function allocateSeat(agentId, slots, occupied = new Set()) {
  if (!slots?.length) return { x: 0, y: 0 };

  const startIndex = hashCode(agentId) % slots.length;
  for (let i = 0; i < slots.length; i++) {
    const idx = (startIndex + i) % slots.length;
    if (!occupied.has(idx)) {
      occupied.add(idx);
      return slots[idx];
    }
  }

  return slots[startIndex];
}

export function allocateAllSeats(actors, layout) {
  if (!layout?.zones?.length) return new Map();

  const actorsList =
    actors instanceof Map
      ? Array.from(actors.values())
      : Array.from(actors || []);
  const seatMap = new Map();
  const slotMap = new Map();
  const occupiedMap = new Map();
  const workspaceZones = layout.zones.filter(
    (zone) => zone.type === "workspace"
  );

  for (const zone of layout.zones) {
    if (zone.type === "workspace" || zone.type === "hotdesk") {
      slotMap.set(zone.id, calculateDeskSlots(zone));
      occupiedMap.set(zone.id, new Set());
    }
  }

  for (const actor of actorsList) {
    const workspaceZone =
      layout.zones.find(
        (zone) =>
          zone.type === "workspace" &&
          zone.workspaceSlug === actor.workspaceSlug
      ) || (workspaceZones.length === 1 ? workspaceZones[0] : null);
    if (workspaceZone) {
      seatMap.set(actor.id, {
        zoneId: workspaceZone.id,
        seat: allocateSeat(
          actor.id,
          slotMap.get(workspaceZone.id),
          occupiedMap.get(workspaceZone.id)
        ),
      });
    }
  }

  const hotdeskZone = layout.zones.find((zone) => zone.type === "hotdesk");
  for (const actor of actorsList) {
    if (!seatMap.has(actor.id) && hotdeskZone) {
      seatMap.set(actor.id, {
        zoneId: hotdeskZone.id,
        seat: allocateSeat(
          actor.id,
          slotMap.get(hotdeskZone.id),
          occupiedMap.get(hotdeskZone.id)
        ),
      });
    }
  }

  return seatMap;
}

const SCALE_X = 0.02;
const SCALE_Z = 0.02;
const OFFSET_X = -12;
const OFFSET_Z = -8;

export function position2dTo3d(pos2d) {
  return {
    x: pos2d.x * SCALE_X + OFFSET_X,
    y: 0,
    z: pos2d.y * SCALE_Z + OFFSET_Z,
  };
}
