const { getErrorText } = require("../outbound/errorTemplates");

class ChannelAdapter {
  constructor({ provider, account, secrets = {} }) {
    this._provider = provider;
    this.account = account;
    this.secrets = secrets || {};
  }

  get provider() {
    return this._provider;
  }

  verifyWebhook(_req) {
    throw new Error("verifyWebhook() must be implemented by adapter");
  }

  parseEvent(_rawEvent) {
    throw new Error("parseEvent() must be implemented by adapter");
  }

  async sendTextReply(_peer, _text) {
    throw new Error("sendTextReply() must be implemented by adapter");
  }

  async sendRichReply(_peer, richContent) {
    return this.sendTextReply(_peer, JSON.stringify(richContent));
  }

  async sendErrorFeedback(peer, errorType, lang = "zh") {
    return this.sendTextReply(peer, getErrorText(errorType, lang));
  }

  async refreshCredentials() {
    throw new Error("refreshCredentials() must be implemented by adapter");
  }

  async healthCheck() {
    const start = Date.now();
    try {
      await this.refreshCredentials();
      return { ok: true, latencyMs: Date.now() - start };
    } catch {
      return { ok: false, latencyMs: Date.now() - start };
    }
  }
}

module.exports = {
  ChannelAdapter,
};
