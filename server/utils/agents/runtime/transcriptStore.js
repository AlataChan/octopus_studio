const fs = require("fs");
const path = require("path");

/**
 * Minimal append-only transcript store for the Phase 4 runtime layer.
 */
class TranscriptStore {
  /**
   * @param {string} sessionId
   * @param {{storageDir?: string}} [options]
   */
  constructor(sessionId, options = {}) {
    this.sessionId = String(sessionId || "session-unknown");
    this._buffer = [];
    this._storageDir =
      options.storageDir || process.env.STORAGE_DIR || process.cwd();
    this._flushQueue = Promise.resolve();
    this._flushScheduled = false;
  }

  /**
   * @private
   * @returns {Promise<void>}
   */
  async _drainBuffer() {
    const pending = this._buffer.splice(0, this._buffer.length);
    if (!pending.length) return;

    const transcriptPath = this._resolvePath();
    await fs.promises.mkdir(path.dirname(transcriptPath), { recursive: true });
    const payload = pending.map((entry) => JSON.stringify(entry)).join("\n");
    await fs.promises.appendFile(transcriptPath, `${payload}\n`, "utf8");
  }

  /**
   * @private
   * @param {string} [sessionId]
   * @returns {string}
   */
  _resolvePath(sessionId = this.sessionId) {
    const safeSessionId = String(sessionId || this.sessionId).replace(
      /[^a-zA-Z0-9._-]/g,
      "-"
    );
    return path.join(
      path.resolve(this._storageDir, ".alataflow", "transcripts"),
      `${safeSessionId}.jsonl`
    );
  }

  /**
   * @param {Object} message
   * @returns {Promise<Object>}
   */
  async append(message) {
    const entry = {
      ...message,
      timestamp: new Date().toISOString(),
    };

    this._buffer.push(entry);
    this._flushAsync();
    return entry;
  }

  /**
   * @returns {Promise<void>}
   */
  async flush() {
    this._flushQueue = this._flushQueue
      .then(() => this._drainBuffer())
      .catch((error) => {
        if (error?.code === "ENOENT" || error?.code === "ENOTDIR") return;
        console.error("[TranscriptStore] flush error:", error.message);
      });

    await this._flushQueue;
  }

  /**
   * @private
   */
  _flushAsync() {
    if (this._flushScheduled) return;
    this._flushScheduled = true;

    Promise.resolve()
      .then(async () => {
        this._flushScheduled = false;
        await this.flush();
        if (this._buffer.length > 0) {
          this._flushAsync();
        }
      })
      .catch((error) => {
        this._flushScheduled = false;
        if (error?.code === "ENOENT" || error?.code === "ENOTDIR") return;
        console.error("[TranscriptStore] flush error:", error.message);
      });
  }

  /**
   * @param {string} [sessionId]
   * @returns {Promise<Array<Object>>}
   */
  async load(sessionId = this.sessionId) {
    const transcriptPath = this._resolvePath(sessionId);

    try {
      const content = await fs.promises.readFile(transcriptPath, "utf8");
      return content
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => JSON.parse(line));
    } catch {
      return [];
    }
  }
}

module.exports = TranscriptStore;
