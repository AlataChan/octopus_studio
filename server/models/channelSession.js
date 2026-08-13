const prisma = require("../utils/prisma");

const ChannelSession = {
  async getBySessionKey(sessionKey) {
    try {
      return await prisma.channel_sessions.findUnique({
        where: { sessionKey: String(sessionKey) },
      });
    } catch (error) {
      console.error("[ChannelSession] getBySessionKey failed:", error.message);
      return null;
    }
  },

  async upsert({
    provider,
    accountId,
    peerId,
    peerType,
    senderId = null,
    sessionKey,
    sessionScope = "per-channel-peer",
    bindingId,
    workspaceId,
    threadId,
    lastActiveAt = new Date(),
  }) {
    return prisma.channel_sessions.upsert({
      where: { sessionKey: String(sessionKey) },
      create: {
        provider: String(provider),
        accountId: String(accountId),
        peerId: String(peerId),
        peerType: String(peerType),
        senderId: senderId ? String(senderId) : null,
        sessionKey: String(sessionKey),
        sessionScope: String(sessionScope),
        bindingId: String(bindingId),
        workspaceId: Number(workspaceId),
        threadId: Number(threadId),
        lastActiveAt: new Date(lastActiveAt),
      },
      update: {
        bindingId: String(bindingId),
        workspaceId: Number(workspaceId),
        threadId: Number(threadId),
        lastActiveAt: new Date(lastActiveAt),
      },
    });
  },

  async touch(sessionKey) {
    try {
      await prisma.channel_sessions.update({
        where: { sessionKey: String(sessionKey) },
        data: { lastActiveAt: new Date() },
      });
      return true;
    } catch (error) {
      console.error("[ChannelSession] touch failed:", error.message);
      return false;
    }
  },
};

module.exports = { ChannelSession };
