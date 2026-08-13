const { AlataApiClient, ApiError } = require("./lib/client");
const { handleGatewayCommand } = require("./commands/gateway");
const { handleApprovalsCommand } = require("./commands/approvals");

function helpText() {
  return [
    "Usage: alata <command> [subcommand] [flags]",
    "",
    "Commands:",
    "  gateway runtime list [--output json|yaml|table]",
    "  gateway runtime rotate-token --id <runtimeId>",
    "  gateway account list [--provider wecom] [--status active]",
    "  gateway account upsert --provider wecom --account-id corp-main [--secrets '{...}']",
    "  gateway binding list [--provider wecom] [--account-id corp-main]",
    "  gateway binding apply --provider wecom --account-id corp-main --workspace-id 1",
    "  approvals list --workspace <slug>",
    "  approvals approve --workspace <slug> --id <confirmationId>",
    "  approvals reject --workspace <slug> --id <confirmationId>",
  ].join("\n");
}

function extractGlobalOptions(argv = []) {
  const args = [];
  let output = "table";

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === "--output") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("Missing value for --output");
      }
      output = value;
      index += 1;
      continue;
    }

    if (token.startsWith("--output=")) {
      output = token.split("=", 2)[1];
      continue;
    }

    args.push(token);
  }

  return { args, output: String(output).toLowerCase() };
}

async function main(argv = []) {
  if (argv.includes("--help") || argv.length === 0) {
    process.stdout.write(`${helpText()}\n`);
    return 0;
  }

  const { args, output } = extractGlobalOptions(argv);
  if (!["table", "json", "yaml"].includes(output)) {
    throw new Error(`Unsupported output format: ${output}`);
  }

  const [command, ...rest] = args;
  const client = new AlataApiClient({
    baseUrl: process.env.ALATA_API_BASE,
    token: process.env.ALATA_API_TOKEN,
  });

  try {
    if (command === "gateway") {
      return await handleGatewayCommand(client, rest, output);
    }

    if (command === "approvals") {
      return await handleApprovalsCommand(client, rest, output);
    }

    throw new Error(`Unknown command: ${command}`);
  } catch (error) {
    if (error instanceof ApiError) {
      console.error(error.message);
      return 1;
    }
    throw error;
  }
}

module.exports = {
  main,
};
