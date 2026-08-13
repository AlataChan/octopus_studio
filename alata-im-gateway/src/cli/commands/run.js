const { AlataClient } = require("../../client/AlataClient");

async function runRuntimeCommand(options = {}, deps = {}) {
  const stdout = deps.stdout || process.stdout;
  const stderr = deps.stderr || process.stderr;
  const Client = deps.AlataClient || AlataClient;
  const startGateway = deps.startGateway || require("../../index").start;

  const baseUrl = options.baseUrl || process.env.ALATA_BASE_URL;
  const runtimeId = options.runtimeId || process.env.ALATA_GATEWAY_RUNTIME_ID;
  const bootstrapToken =
    options.bootstrapToken || process.env.ALATA_GATEWAY_BOOTSTRAP_TOKEN;
  const runtimeEnv = {
    ...process.env,
    ...(baseUrl ? { ALATA_BASE_URL: baseUrl } : {}),
    ...(options.apiKey || process.env.ALATA_API_KEY
      ? { ALATA_API_KEY: options.apiKey || process.env.ALATA_API_KEY }
      : {}),
    ...(options.internalSecret || process.env.ALATA_INTERNAL_SECRET
      ? {
          ALATA_INTERNAL_SECRET:
            options.internalSecret || process.env.ALATA_INTERNAL_SECRET,
        }
      : {}),
    ...(runtimeId ? { ALATA_GATEWAY_RUNTIME_ID: runtimeId } : {}),
  };

  if (runtimeId && bootstrapToken && baseUrl) {
    const client = new Client({
      baseUrl,
      apiKey: options.apiKey || process.env.ALATA_API_KEY || "",
      internalSecret:
        options.internalSecret || process.env.ALATA_INTERNAL_SECRET || "",
      timeout: options.timeout || 30000,
    });

    try {
      const registration = await client.registerRuntime({
        runtimeId,
        bootstrapToken,
      });
      const snapshot = await client.fetchRuntimeConfig({
        runtimeId,
        runtimeToken: registration.authToken,
      });

      runtimeEnv.ALATA_GATEWAY_RUNTIME_TOKEN = registration.authToken || "";
      runtimeEnv.ALATA_GATEWAY_RUNTIME_ETAG = snapshot.etag || "";

      process.env.ALATA_GATEWAY_RUNTIME_ID = runtimeId;
      process.env.ALATA_GATEWAY_RUNTIME_TOKEN = registration.authToken || "";
      process.env.ALATA_GATEWAY_RUNTIME_ETAG = snapshot.etag || "";

      stdout.write(
        `Managed runtime ${runtimeId} registered at revision ${snapshot.revision || "unknown"}.\n`
      );
    } catch (error) {
      stderr.write(`${error?.message || String(error)}\n`);
      return 1;
    }
  }

  await startGateway({ env: runtimeEnv });
  return 0;
}

module.exports = {
  runRuntimeCommand,
};
