class BindingMatcher {
  constructor(bindings) {
    this.bindings = bindings;
  }

  match(message) {
    const candidates = this.bindings.filter((b) => {
      if (!b.enabled) return false;
      if (b.channel !== message.provider) return false;
      if (b.accountId !== message.accountId) return false;

      const m = typeof b.match === "string" ? JSON.parse(b.match) : b.match;
      if (m.peerType && m.peerType !== message.peerType) return false;
      if (m.peerId && m.peerId !== "*" && m.peerId !== message.peerId) return false;
      if (
        m.senderAllowlist &&
        !m.senderAllowlist.includes("*") &&
        !m.senderAllowlist.includes(message.senderId)
      ) {
        return false;
      }
      return true;
    });

    if (!candidates.length) return null;

    candidates.sort((a, b) => {
      const scoreA = this._specificity(a, message);
      const scoreB = this._specificity(b, message);
      if (scoreB !== scoreA) return scoreB - scoreA;
      return (b.priority || 0) - (a.priority || 0);
    });

    return candidates[0];
  }

  _specificity(binding, message) {
    const m = typeof binding.match === "string" ? JSON.parse(binding.match) : binding.match;
    let score = 0;
    if (m.peerId && m.peerId !== "*" && m.peerId === message.peerId) score += 10;
    if (m.senderAllowlist) {
      if (m.senderAllowlist.includes(message.senderId)) score += 5;
      else if (m.senderAllowlist.includes("*")) score += 2;
    }
    return score;
  }
}

module.exports = { BindingMatcher };

