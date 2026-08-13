const { registerRuntimeCommand } = require("./commands/register");
const { runRuntimeCommand } = require("./commands/run");
const { doctorCommand } = require("./commands/doctor");

function parseFlags(argv = []) {
  const flags = {};
  const positionals = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }

    const [key, inlineValue] = token.slice(2).split("=", 2);
    if (inlineValue !== undefined) {
      flags[key] = inlineValue;
      continue;
    }

    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      flags[key] = true;
      continue;
    }

    flags[key] = next;
    index += 1;
  }

  return { flags, positionals };
}

async function main(argv = []) {
  const { flags, positionals } = parseFlags(argv);
  const [command = "run"] = positionals;
  const options = {
    output: flags.output || "table",
    baseUrl: flags["base-url"],
    runtimeId: flags["runtime-id"],
    bootstrapToken: flags["bootstrap-token"],
    apiKey: flags["api-key"],
    internalSecret: flags["internal-secret"],
  };

  if (command === "register") {
    return registerRuntimeCommand(options);
  }

  if (command === "run") {
    return runRuntimeCommand(options);
  }

  if (command === "doctor") {
    return doctorCommand(options);
  }

  process.stderr.write(`Unknown command: ${command}\n`);
  return 1;
}

module.exports = {
  main,
  parseFlags,
};
