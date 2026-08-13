function parseApprovalCommand(text = "") {
  const raw = String(text || "").trim();
  if (!raw.startsWith("/")) return null;

  const parts = raw.split(/\s+/);
  const cmd = parts[0];
  if (cmd !== "/approve" && cmd !== "/reject") return null;

  const idRaw = parts[1];
  const id = parseInt(idRaw);
  if (!idRaw || Number.isNaN(id)) {
    return { error: "INVALID_ID", cmd };
  }

  const reason = parts.slice(2).join(" ").trim();
  return {
    cmd,
    action: cmd === "/approve" ? "approve" : "reject",
    confirmationId: id,
    reason,
  };
}

module.exports = { parseApprovalCommand };

