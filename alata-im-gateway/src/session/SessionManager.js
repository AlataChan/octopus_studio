const { getDb } = require("../db");

class SessionManager {
  async getOrCreateThread(message, binding, alataClient) {
    const sessionKey = this._buildSessionKey(message, binding.route.sessionScope);
    const db = getDb();

    const existing = db
      .prepare(
        "SELECT thread_slug FROM channel_sessions WHERE provider=? AND account_id=? AND peer_id=? AND sender_id=?"
      )
      .get(sessionKey.provider, sessionKey.accountId, sessionKey.peerId, sessionKey.senderId);

    if (existing) {
      db.prepare(
        "UPDATE channel_sessions SET last_active_at=? WHERE provider=? AND account_id=? AND peer_id=? AND sender_id=?"
      ).run(
        Date.now(),
        sessionKey.provider,
        sessionKey.accountId,
        sessionKey.peerId,
        sessionKey.senderId
      );
      return existing.thread_slug;
    }

    const threadName = `${message.provider}:${message.peerId}:${Date.now()}`;
    const thread = await alataClient.createThread(binding.route.workspaceSlug, { name: threadName });
    if (!thread?.slug) throw new Error("Alata createThread returned no slug");

    db.prepare(
      `INSERT INTO channel_sessions
        (provider, account_id, peer_id, peer_type, sender_id, binding_id, workspace_slug, thread_slug, last_active_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      sessionKey.provider,
      sessionKey.accountId,
      sessionKey.peerId,
      message.peerType,
      sessionKey.senderId,
      binding.id,
      binding.route.workspaceSlug,
      thread.slug,
      Date.now(),
      Date.now()
    );

    return thread.slug;
  }

  getSession(message, binding) {
    const sessionKey = this._buildSessionKey(message, binding.route.sessionScope);
    const db = getDb();
    return db
      .prepare(
        "SELECT * FROM channel_sessions WHERE provider=? AND account_id=? AND peer_id=? AND sender_id=?"
      )
      .get(sessionKey.provider, sessionKey.accountId, sessionKey.peerId, sessionKey.senderId);
  }

  _buildSessionKey(message, scope = "per-channel-peer") {
    return {
      provider: message.provider,
      accountId: message.accountId,
      peerId: message.peerId,
      senderId: scope === "per-channel-sender" ? message.senderId : "",
    };
  }

  cleanupStaleSessions(hours = 168) {
    const cutoff = Date.now() - hours * 3600 * 1000;
    const db = getDb();
    const { changes } = db.prepare("DELETE FROM channel_sessions WHERE last_active_at < ?").run(cutoff);
    return changes;
  }
}

module.exports = { SessionManager };

