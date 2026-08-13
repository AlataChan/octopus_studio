const fastq = require("fastq");
const pino = require("pino");

const logger = pino({ name: "queue", level: process.env.LOG_LEVEL || "info" });

function createMessageQueue({ concurrency = 5, handler }) {
  const queue = fastq.promise(handler, concurrency);

  queue.error((err, task) => {
    logger.error({ err, messageId: task?.message?.messageId }, "Queue processing error");
  });

  return {
    push(message, binding) {
      return queue.push({ message, binding });
    },
    get depth() {
      return queue.length();
    },
    get idle() {
      return queue.idle();
    },
  };
}

module.exports = { createMessageQueue };

