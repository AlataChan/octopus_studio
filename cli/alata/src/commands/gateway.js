function parseFlags(args) {
  const flags = {};
  const positionals = [];

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }

    const [rawKey, inlineValue] = token.slice(2).split("=", 2);
    const next = args[index + 1];
    if (inlineValue !== undefined) {
      flags[rawKey] = inlineValue;
      continue;
    }

    if (!next || next.startsWith("--")) {
      flags[rawKey] = true;
      continue;
    }

    flags[rawKey] = next;
    index += 1;
  }

  return { flags, positionals };
}

function normalizeValue(value) {
  if (value === undefined) return undefined;
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null") return null;
  if (value !== "" && !Number.isNaN(Number(value))) return Number(value);

  if (
    typeof value === "string" &&
    ((value.startsWith("{") && value.endsWith("}")) ||
      (value.startsWith("[") && value.endsWith("]")))
  ) {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  return value;
}

function serializeYaml(value, indent = 0) {
  const padding = " ".repeat(indent);

  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    return value
      .map((item) => {
        if (item && typeof item === "object") {
          const nested = serializeYaml(item, indent + 2)
            .split("\n")
            .map((line, index) => (index === 0 ? `- ${line}` : `${" ".repeat(indent + 2)}${line}`))
            .join("\n");
          return `${padding}${nested}`;
        }
        return `${padding}- ${String(item)}`;
      })
      .join("\n");
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value);
    if (entries.length === 0) return "{}";
    return entries
      .map(([key, nested]) => {
        if (nested && typeof nested === "object") {
          return `${padding}${key}:\n${serializeYaml(nested, indent + 2)}`;
        }
        return `${padding}${key}: ${nested === null ? "null" : String(nested)}`;
      })
      .join("\n");
  }

  if (value === null) return "null";
  return String(value);
}

function formatTable(rows) {
  const items = Array.isArray(rows) ? rows : [rows];
  if (items.length === 0) return "No records found.";

  const keys = Array.from(
    items.reduce((set, item) => {
      Object.keys(item || {}).forEach((key) => set.add(key));
      return set;
    }, new Set())
  );

  const widths = keys.map((key) =>
    Math.max(
      key.length,
      ...items.map((item) => {
        const value = item?.[key];
        return String(value === undefined ? "" : value).length;
      })
    )
  );

  const renderRow = (row) =>
    keys
      .map((key, index) => {
        const value = row?.[key];
        return String(value === undefined ? "" : value).padEnd(widths[index], " ");
      })
      .join("  ");

  const header = renderRow(
    Object.fromEntries(keys.map((key) => [key, key]))
  );
  const divider = widths.map((width) => "-".repeat(width)).join("  ");
  const body = items.map(renderRow).join("\n");
  return `${header}\n${divider}\n${body}`;
}

function printResult(payload, output, key) {
  if (output === "json") {
    process.stdout.write(`${JSON.stringify({ [key]: payload }, null, 2)}\n`);
    return;
  }

  if (output === "yaml") {
    process.stdout.write(`${serializeYaml({ [key]: payload })}\n`);
    return;
  }

  process.stdout.write(`${formatTable(payload)}\n`);
}

function requireValue(flags, name) {
  const value = flags[name];
  if (value === undefined || value === true || value === "") {
    throw new Error(`Missing required flag --${name}`);
  }
  return normalizeValue(value);
}

async function handleGatewayCommand(client, args, output) {
  const [resource, action, ...rest] = args;

  if (!resource || !action) {
    throw new Error("Usage: alata gateway <runtime|account|binding> <command>");
  }

  const { flags } = parseFlags(rest);

  if (resource === "runtime" && action === "list") {
    const result = await client.listRuntimes();
    printResult(result.runtimes || [], output, "runtimes");
    return 0;
  }

  if (resource === "runtime" && action === "rotate-token") {
    const runtimeId = requireValue(flags, "id");
    const result = await client.rotateRuntimeToken(runtimeId);
    const payload = {
      runtime: result.runtime || null,
      bootstrapToken: result.bootstrapToken || null,
    };
    printResult(payload, output, "rotation");
    return 0;
  }

  if (resource === "account" && action === "list") {
    const result = await client.listAccounts({
      provider: normalizeValue(flags.provider),
      status: normalizeValue(flags.status),
    });
    printResult(result.accounts || [], output, "accounts");
    return 0;
  }

  if (resource === "account" && action === "upsert") {
    const result = await client.upsertAccount({
      provider: requireValue(flags, "provider"),
      accountId: requireValue(flags, "account-id"),
      status: normalizeValue(flags.status) || "active",
      secrets: normalizeValue(flags.secrets) || {},
      tokenExpiresAt: normalizeValue(flags["token-expires-at"]) || null,
    });
    printResult(result.account || {}, output, "account");
    return 0;
  }

  if (resource === "binding" && action === "list") {
    const result = await client.listBindings({
      provider: normalizeValue(flags.provider),
      accountId: normalizeValue(flags["account-id"]),
      enabled: normalizeValue(flags.enabled),
    });
    printResult(result.bindings || [], output, "bindings");
    return 0;
  }

  if (resource === "binding" && action === "apply") {
    const result = await client.upsertBinding({
      id: normalizeValue(flags.id) || null,
      provider: requireValue(flags, "provider"),
      accountId: requireValue(flags, "account-id"),
      workspaceId: requireValue(flags, "workspace-id"),
      match: normalizeValue(flags.match) || {},
      route: normalizeValue(flags.route) || {},
      security: normalizeValue(flags.security) || {},
      priority: normalizeValue(flags.priority) || 0,
      enabled:
        flags.enabled === undefined ? true : normalizeValue(flags.enabled),
    });
    printResult(result.binding || {}, output, "binding");
    return 0;
  }

  throw new Error(`Unsupported gateway command: ${resource} ${action}`);
}

module.exports = {
  handleGatewayCommand,
  parseFlags,
  normalizeValue,
  printResult,
  serializeYaml,
  formatTable,
};
