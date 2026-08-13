const { AlataClient } = require("../../client/AlataClient");

async function registerRuntimeCommand(options = {}, streams = {}, deps = {}) {
  const stdout = streams.stdout || process.stdout;
  const stderr = streams.stderr || process.stderr;
  const Client = deps.AlataClient || AlataClient;

  const runtimeId = options.runtimeId || process.env.ALATA_GATEWAY_RUNTIME_ID;
  const bootstrapToken =
    options.bootstrapToken || process.env.ALATA_GATEWAY_BOOTSTRAP_TOKEN;
  const baseUrl = options.baseUrl || process.env.ALATA_BASE_URL;

  if (!runtimeId) {
    stderr.write("Missing runtime id. Use --runtime-id or ALATA_GATEWAY_RUNTIME_ID.\n");
    return 1;
  }

  if (!bootstrapToken) {
    stderr.write(
      "Missing bootstrap token. Use --bootstrap-token or ALATA_GATEWAY_BOOTSTRAP_TOKEN.\n"
    );
    return 1;
  }

  if (!baseUrl) {
    stderr.write("Missing Alata base URL. Use --base-url or ALATA_BASE_URL.\n");
    return 1;
  }

  const client = new Client({
    baseUrl,
    apiKey: options.apiKey || process.env.ALATA_API_KEY || "",
    internalSecret:
      options.internalSecret || process.env.ALATA_INTERNAL_SECRET || "",
    timeout: options.timeout || 30000,
  });

  try {
    const result = await client.registerRuntime({
      runtimeId,
      bootstrapToken,
    });
    stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  } catch (error) {
    stderr.write(`${error?.message || String(error)}\n`);
    return 1;
  }
}

module.exports = {
  registerRuntimeCommand,
};
