const RUNTIME_BRANDING_ALLOWLIST = [
  "NOTICE",
  "LICENSE",
  "CHANGELOG",
  "package.json",
  "anythingllm.db",
  "anythingllm_vectors",
  "anythingllm_mcp_servers.json",
  "anythingllm-chat-widget.js",
  "anythingllm-chat-widget.min.js",
  "anythingllm-chat-widget.min.css",
  "EmbeddedAnythingLLM",
];

function isAllowed(stringOrPath = "") {
  const value = String(stringOrPath).toLowerCase();
  return RUNTIME_BRANDING_ALLOWLIST.some((entry) =>
    value.includes(String(entry).toLowerCase())
  );
}

module.exports = {
  RUNTIME_BRANDING_ALLOWLIST,
  isAllowed,
};
