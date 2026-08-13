const EventEmitter = require("events");

class RunEventEmitter extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(200);
    this._connectionCount = 0;
  }

  emitForSession(sessionId, eventName, data) {
    this.emit(`session:${sessionId}`, eventName, data);
  }

  subscribe(sessionId, handler) {
    this._connectionCount++;
    this.on(`session:${sessionId}`, handler);
  }

  unsubscribe(sessionId, handler) {
    this._connectionCount = Math.max(0, this._connectionCount - 1);
    this.off(`session:${sessionId}`, handler);
  }

  get connectionCount() {
    return this._connectionCount;
  }
}

const runEventEmitter = new RunEventEmitter();
module.exports = { runEventEmitter };
