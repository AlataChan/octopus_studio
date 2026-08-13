/**
 * Thin IO adapter for IM Gateway style message exchange. It keeps SessionEngine
 * as the shared runtime shell while leaving transport-specific concerns outside.
 */
class IMGatewayShell {
  /**
   * @param {import("./sessionEngine")} sessionEngine
   */
  constructor(sessionEngine) {
    this.engine = sessionEngine;
  }

  /**
   * @param {string} userMessage
   * @returns {Promise<{content: string, sessionId: string|null}>}
   */
  async handleMessage(userMessage) {
    let finalContent = "";

    for await (const event of this.engine.submitMessage(userMessage)) {
      if (event?.type === "result") {
        finalContent = String(event.content || "");
      }
    }

    return {
      content: finalContent,
      sessionId: this.engine.sessionId || null,
    };
  }
}

module.exports = IMGatewayShell;
