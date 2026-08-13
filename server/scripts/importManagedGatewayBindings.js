const fs = require("node:fs");
const path = require("node:path");

const { ChannelBinding } = require("../models/channelBinding");
const { Workspace } = require("../models/workspace");

function parseArgs(argv = process.argv.slice(2)) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    args[key] = next && !next.startsWith("--") ? next : true;
    if (args[key] === next) index += 1;
  }

  return args;
}

async function resolveWorkspaceId(binding) {
  if (binding.workspaceId) return Number(binding.workspaceId);

  const workspaceSlug = binding?.route?.workspaceSlug || null;
  if (!workspaceSlug) {
    throw new Error(`Binding ${binding.id || "<unknown>"} is missing workspaceId and route.workspaceSlug`);
  }

  const workspace = await Workspace.get({ slug: workspaceSlug });
  if (!workspace) {
    throw new Error(`Workspace not found for slug "${workspaceSlug}"`);
  }

  return workspace.id;
}

async function importManagedGatewayBindings(filePath) {
  const resolved = path.resolve(filePath);
  const payload = JSON.parse(fs.readFileSync(resolved, "utf8"));
  const sourceBindings = Array.isArray(payload?.bindings) ? payload.bindings : [];
  const imported = [];

  for (const binding of sourceBindings) {
    const workspaceId = await resolveWorkspaceId(binding);
    const record = await ChannelBinding.upsert({
      id: binding.id || null,
      provider: binding.provider || binding.channel,
      accountId: binding.accountId,
      workspaceId,
      match: binding.match || {},
      route: binding.route || {},
      security: binding.security || {},
      priority: Number(binding.priority || 0),
      enabled: binding.enabled !== false,
    });
    imported.push(record);
  }

  const validation = {
    sourceCount: sourceBindings.length,
    importedCount: imported.length,
    idParity:
      sourceBindings.map((item) => item.id).sort().join(",") ===
      imported.map((item) => item.id).sort().join(","),
  };

  return { imported, validation };
}

if (require.main === module) {
  const args = parseArgs();
  const filePath = args.file;

  if (!filePath || filePath === true) {
    console.error("Usage: node server/scripts/importManagedGatewayBindings.js --file <export.json>");
    process.exit(1);
  }

  importManagedGatewayBindings(filePath)
    .then(({ validation }) => {
      console.log(JSON.stringify({ success: true, validation }, null, 2));
    })
    .catch((error) => {
      console.error(error?.message || String(error));
      process.exit(1);
    });
}

module.exports = { importManagedGatewayBindings };
