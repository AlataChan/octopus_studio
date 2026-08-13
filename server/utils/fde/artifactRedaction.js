const { redactFdeText, redactFdeValue } = require("./redaction");

function sanitizeArtifactData(data) {
  if (typeof data === "string") return redactFdeText(data);
  return JSON.stringify(redactFdeValue(data, { maxDepth: 64 }), null, 2);
}

module.exports = { sanitizeArtifactData };
