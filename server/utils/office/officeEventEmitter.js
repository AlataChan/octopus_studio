const EventEmitter = require("events");

class OfficeEventEmitter extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(100);
  }

  subscribe(handler) {
    this.on("office-event", handler);
  }

  unsubscribe(handler) {
    this.off("office-event", handler);
  }

  emit(eventName, data) {
    return super.emit("office-event", eventName, data);
  }
}

const officeEventEmitter = new OfficeEventEmitter();

module.exports = { OfficeEventEmitter, officeEventEmitter };
