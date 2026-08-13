const { Workspace } = require("../../../models/workspace");
const { WorkspaceThread } = require("../../../models/workspaceThread");
const { ChannelSession } = require("../../../models/channelSession");
const { SESSION_SCOPES } = require("../constants");

class SessionManager {
  buildSessionKey(message, sessionScope = SESSION_SCOPES.PER_CHANNEL_PEER) {
    const { provider, accountId, peerId, senderId } = message;

    if (sessionScope === SESSION_SCOPES.PER_CHANNEL_ACCOUNT) {
      return `${provider}:${accountId}`;
    }

    if (sessionScope === SESSION_SCOPES.PER_CHANNEL_SENDER) {
      return `${provider}:${accountId}:${peerId}:${senderId || "unknown"}`;
    }

    return `${provider}:${accountId}:${peerId}`;
  }

  async _resolveWorkspace(binding) {
    if (binding.workspaceId) {
      return Workspace.get({ id: Number(binding.workspaceId) });
    }

    const route = binding.route || {};
    if (route.workspaceId) {
      return Workspace.get({ id: Number(route.workspaceId) });
    }

    if (route.workspaceSlug) {
      return Workspace.get({ slug: String(route.workspaceSlug) });
    }

    return null;
  }

  async getOrCreateThread({ message, binding }) {
    const route = binding.route || {};
    const sessionScope = route.sessionScope || SESSION_SCOPES.PER_CHANNEL_PEER;
    const sessionKey = this.buildSessionKey(message, sessionScope);

    const workspace = await this._resolveWorkspace(binding);
    if (!workspace) {
      throw new Error(`Workspace not found for binding ${binding.id}`);
    }

    const existing = await ChannelSession.getBySessionKey(sessionKey);
    if (existing) {
      await ChannelSession.touch(sessionKey);
      const thread = await WorkspaceThread.get({ id: existing.threadId });
      if (!thread) {
        throw new Error(
          `Thread ${existing.threadId} not found for session ${sessionKey}`
        );
      }
      return { session: existing, thread, workspace, sessionKey };
    }

    const { thread, message: createMessage } = await WorkspaceThread.new(
      workspace,
      null,
      {
        name: `${message.provider}:${message.peerId}`,
      }
    );

    if (!thread) {
      throw new Error(createMessage || "Failed to create workspace thread");
    }

    const session = await ChannelSession.upsert({
      provider: message.provider,
      accountId: message.accountId,
      peerId: message.peerId,
      peerType: message.peerType,
      senderId: message.senderId,
      sessionKey,
      sessionScope,
      bindingId: binding.id,
      workspaceId: workspace.id,
      threadId: thread.id,
      lastActiveAt: new Date(),
    });

    return { session, thread, workspace, sessionKey };
  }
}

module.exports = {
  SessionManager,
};
