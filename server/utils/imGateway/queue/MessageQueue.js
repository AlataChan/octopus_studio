class MessageQueue {
  constructor({ concurrency = 5, handler }) {
    if (typeof handler !== "function") {
      throw new Error("MessageQueue requires a handler function");
    }

    this.concurrency = Math.max(1, Number(concurrency || 1));
    this.handler = handler;
    this._pending = [];
    this._running = 0;
  }

  push(task) {
    return new Promise((resolve, reject) => {
      this._pending.push({ task, resolve, reject });
      this._drain();
    });
  }

  _drain() {
    while (this._running < this.concurrency && this._pending.length > 0) {
      const item = this._pending.shift();
      this._running += 1;
      let resolvedValue = null;
      let rejectedError = null;

      Promise.resolve(this.handler(item.task))
        .then((result) => {
          resolvedValue = result;
        })
        .catch((error) => {
          rejectedError = error;
        })
        .finally(() => {
          this._running -= 1;
          this._drain();
          if (rejectedError) {
            item.reject(rejectedError);
            return;
          }
          item.resolve(resolvedValue);
        });
    }
  }

  get pending() {
    return this._pending.length;
  }

  get running() {
    return this._running;
  }

  get idle() {
    return this._pending.length === 0 && this._running === 0;
  }
}

module.exports = {
  MessageQueue,
};
