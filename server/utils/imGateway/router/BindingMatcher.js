const { safeJsonParse } = require("../../http");

function normalizeBinding(binding = {}) {
  const rawMatch =
    binding.match ||
    safeJsonParse(binding.matchJson, {
      triggerType: "message",
      peerType: null,
      peerId: "*",
      senderAllowlist: [],
    });

  return {
    ...binding,
    match: {
      triggerType: "message",
      peerType: null,
      peerId: "*",
      senderAllowlist: [],
      ...(rawMatch || {}),
    },
    route:
      binding.route ||
      safeJsonParse(binding.routeJson, {
        sessionScope: "per-channel-peer",
      }),
    security: binding.security || safeJsonParse(binding.securityJson, {}),
  };
}

function scoreBinding(binding, message) {
  const normalized = normalizeBinding(binding);
  const { match = {} } = normalized;
  const triggerType = String(match.triggerType || "message");
  const incomingTriggerType = String(message?.triggerType || "message");
  let score = 0;

  if (triggerType !== incomingTriggerType) {
    return null;
  }

  if (triggerType === "menu_action") {
    const eventType = match.eventType || null;
    const eventKey = match.eventKey || null;

    if (eventType && eventType !== message.eventType) {
      return null;
    }
    if (eventKey && eventKey !== message.eventKey) {
      return null;
    }

    if (eventType) score += 4;
    if (eventKey) score += 6;

    return {
      binding: normalized,
      score,
      priority: Number(normalized.priority || 0),
    };
  }

  const peerType = match.peerType || null;
  if (peerType && peerType !== message.peerType) {
    return null;
  }
  if (peerType) score += 1;

  const peerId = match.peerId || "*";
  if (peerId !== "*" && peerId !== message.peerId) {
    return null;
  }
  if (peerId === message.peerId) score += 4;

  const senderAllowlist = Array.isArray(match.senderAllowlist)
    ? match.senderAllowlist
    : [];

  if (senderAllowlist.length > 0) {
    if (senderAllowlist.includes(message.senderId)) {
      score += 3;
    } else if (senderAllowlist.includes("*")) {
      score += 2;
    } else {
      return null;
    }
  }

  const priority = Number(normalized.priority || 0);

  return {
    binding: normalized,
    score,
    priority,
  };
}

function matchBinding(bindings = [], message) {
  const candidates = [];

  for (const binding of bindings) {
    if (!binding || binding.enabled === false) continue;
    const result = scoreBinding(binding, message);
    if (!result) continue;
    candidates.push(result);
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.priority !== a.priority) return b.priority - a.priority;
    return String(a.binding.id).localeCompare(String(b.binding.id));
  });

  // Conflict detection: same specificity + same priority (ordering becomes arbitrary).
  if (candidates.length > 1) {
    const winner = candidates[0];
    const ties = candidates.filter(
      (c) => c.score === winner.score && c.priority === winner.priority
    );
    if (ties.length > 1) {
      console.warn("[IMGateway] Binding match conflict detected", {
        provider: message?.provider,
        accountId: message?.accountId,
        peerType: message?.peerType,
        peerId: message?.peerId,
        senderId: message?.senderId,
        selected: winner.binding?.id,
        ties: ties.map((t) => t.binding?.id),
      });
    }
  }

  return candidates[0].binding;
}

module.exports = {
  normalizeBinding,
  scoreBinding,
  matchBinding,
};
