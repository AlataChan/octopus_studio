class ChannelAdapter {
  constructor({ provider, accountId, secrets }) {
    if (new.target === ChannelAdapter) throw new Error("ChannelAdapter is abstract");
    this.provider = provider;
    this.accountId = accountId;
    this.secrets = secrets;
  }

  verifyWebhook(_req) {
    throw new Error("not implemented");
  }

  parseEvent(_rawBody) {
    throw new Error("not implemented");
  }

  isDuplicate(_eventId) {
    throw new Error("not implemented");
  }

  markSeen(_eventId) {
    throw new Error("not implemented");
  }

  async sendTextReply(_peer, _text) {
    throw new Error("not implemented");
  }

  async sendErrorFeedback(_peer, _errorType, _lang = "zh") {
    throw new Error("not implemented");
  }

  async refreshCredentials() {
    throw new Error("not implemented");
  }

  async healthCheck() {
    throw new Error("not implemented");
  }
}

/**
 * @typedef {Object} StandardMessage
 * @property {string} messageId
 * @property {string} eventId       - dedup key
 * @property {"feishu"|"wecom"} provider
 * @property {string} accountId
 * @property {"user"|"group"} peerType
 * @property {string} peerId        - chat_id or user open_id
 * @property {string} senderId      - feishu: ou_xxx, wecom: userid
 * @property {string} senderName
 * @property {"text"|"image"|"file"|"interactive"} contentType
 * @property {string} textContent
 * @property {Object} rawContent
 * @property {boolean} isMentioned
 * @property {number} timestamp     - ms
 */

/**
 * @typedef {Object} Peer
 * @property {"feishu"|"wecom"} provider
 * @property {string} accountId
 * @property {"user"|"group"} peerType
 * @property {string} peerId
 * @property {string} senderId
 */

/**
 * @typedef {Object} SendResult
 * @property {boolean} ok
 * @property {string} [messageId]
 * @property {string} [error]
 */

module.exports = { ChannelAdapter };

