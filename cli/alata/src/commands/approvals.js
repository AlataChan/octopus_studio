const { parseFlags, normalizeValue, printResult } = require("./gateway");

function parseUserResponse(flags) {
  const value = flags["user-response"];
  if (value === undefined || value === true || value === "") return null;
  return normalizeValue(value);
}

async function handleApprovalsCommand(client, args, output) {
  const [action, ...rest] = args;
  if (!action) {
    throw new Error("Usage: alata approvals <list|approve|reject>");
  }

  const { flags } = parseFlags(rest);
  const workspaceSlug = flags.workspace;
  if (!workspaceSlug || workspaceSlug === true) {
    throw new Error("Missing required flag --workspace");
  }

  if (action === "list") {
    const result = await client.listApprovals(workspaceSlug);
    printResult(result.confirmations || [], output, "confirmations");
    return 0;
  }

  const confirmationId = flags.id;
  if (!confirmationId || confirmationId === true) {
    throw new Error("Missing required flag --id");
  }

  if (action === "approve") {
    const result = await client.approveConfirmation(
      workspaceSlug,
      normalizeValue(confirmationId),
      parseUserResponse(flags)
    );
    printResult(result, output, "result");
    return 0;
  }

  if (action === "reject") {
    const result = await client.rejectConfirmation(
      workspaceSlug,
      normalizeValue(confirmationId),
      parseUserResponse(flags)
    );
    printResult(result, output, "result");
    return 0;
  }

  throw new Error(`Unsupported approvals command: ${action}`);
}

module.exports = {
  handleApprovalsCommand,
};
