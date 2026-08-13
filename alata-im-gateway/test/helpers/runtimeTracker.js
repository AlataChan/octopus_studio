const { shutdownAdapters } = require("../../src/index");

const defaultLogger = { error() {}, info() {} };

function isExpectedShutdownWsError(error) {
  const message = String(error?.message || error || "");
  return (
    error?.code === "ECANCELED" ||
    message.includes("SSL destruction") ||
    message.includes("Canceled because of") ||
    (message.includes("WSClient") && /clos|shut|destroy/i.test(message))
  );
}

function rethrowUnexpected(error) {
  if (isExpectedShutdownWsError(error)) return;
  throw error instanceof Error ? error : new Error(String(error));
}

function createRuntimeTracker() {
  const runtimes = new Map();
  const guardedEmitters = new WeakSet();

  function guardEmitter(emitter) {
    if (!emitter || typeof emitter.on !== "function") return;
    if (guardedEmitters.has(emitter)) return;
    emitter.on("error", rethrowUnexpected);
    guardedEmitters.add(emitter);
  }

  function attachWsErrorGuard(runtime) {
    const wsClient = runtime?.adapters?.feishu?._wsClient;
    if (!wsClient) return;

    guardEmitter(wsClient);

    const wsInstance = wsClient.wsConfig?.getWSInstance?.();
    guardEmitter(wsInstance);

    const tlsSocket = wsInstance?._socket || wsInstance?._req?.socket;
    guardEmitter(tlsSocket);
  }

  function trackApp(runtime, options = {}) {
    runtimes.set(runtime, {
      server: options.server || runtime?.server,
      logger: options.logger || defaultLogger,
    });
    attachWsErrorGuard(runtime);
    return runtime;
  }

  async function shutdownAll() {
    for (const [runtime, options] of [...runtimes.entries()]) {
      if (!runtime) continue;
      attachWsErrorGuard(runtime);
      try {
        await shutdownAdapters(runtime.adapters, options.server, options.logger);
      } finally {
        runtimes.delete(runtime);
      }
    }
  }

  return { trackApp, shutdownAll };
}

module.exports = { createRuntimeTracker };
