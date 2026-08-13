const fs = require("fs");
const path = require("path");

/**
 * Minimal append-only event log for Phase 1 runtime pairing guarantees.
 */
class EventLog {
  /**
   * @param {string} sessionId
   */
  constructor(sessionId = "session-unknown") {
    this.sessionId = String(sessionId || "session-unknown");
    /** @type {Array<{type: string, toolUseId?: string, toolName?: string, timestamp: string, data?: Object}>} */
    this.events = [];
    this._flushQueue = Promise.resolve();
  }

  /**
   * @param {{type: "tool_use"|"tool_result"|"abort"|"retry_boundary", toolUseId?: string, toolName?: string, timestamp?: string, data?: Object}} event
   * @returns {Object}
   */
  append(event) {
    const entry = {
      ...event,
      timestamp: event.timestamp || new Date().toISOString(),
    };

    this.events.push(entry);
    this._flushAsync(entry);
    return entry;
  }

  /**
   * @returns {Array}
   */
  getUnpairedToolCalls() {
    const pairedToolUseIds = new Set(
      this.events
        .filter((event) => event.type === "tool_result" && !!event.toolUseId)
        .map((event) => event.toolUseId)
    );

    return this.events.filter(
      (event) =>
        event.type === "tool_use" &&
        !!event.toolUseId &&
        !pairedToolUseIds.has(event.toolUseId)
    );
  }

  /**
   * @private
   * @param {Object} entry
   */
  _flushAsync(entry) {
    const storageRoot = process.env.STORAGE_DIR || process.cwd();
    const safeSessionId = this.sessionId.replace(/[^a-zA-Z0-9._-]/g, "-");
    const logDir = path.resolve(storageRoot, ".alataflow", "events");
    const logPath = path.join(logDir, `${safeSessionId}.jsonl`);

    this._flushQueue = this._flushQueue
      .then(async () => {
        await fs.promises.mkdir(logDir, { recursive: true });
        await fs.promises.appendFile(
          logPath,
          `${JSON.stringify(entry)}\n`,
          "utf8"
        );
      })
      .catch((error) => {
        if (error?.code === "ENOENT" || error?.code === "ENOTDIR") return;
        console.error("[EventLog] Failed to flush event:", error.message);
      });
  }
}

module.exports = EventLog;
