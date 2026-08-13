const { redactFdeText } = require("./redaction");

class FdeRequestError extends Error {
  constructor(code, path, status = 400, message = "invalid request") {
    super(message);
    this.name = "FdeRequestError";
    this.code = code;
    this.path = path;
    this.status = status;
  }
}

function exceedsDepth(value, maxDepth, depth = 0) {
  if (value == null || typeof value !== "object") return false;
  if (depth >= maxDepth) return Object.keys(value).length > 0;
  return Object.values(value).some((child) =>
    exceedsDepth(child, maxDepth, depth + 1)
  );
}

function validateFdeBody(request, options = {}) {
  const body = request?.body;
  if (!body || Array.isArray(body) || typeof body !== "object") {
    throw new FdeRequestError(
      "STUDIO_REQUEST_BODY_INVALID",
      "body",
      400,
      "request body must be an object"
    );
  }
  const allowed = new Set(options.allowedKeys || []);
  if (Object.keys(body).some((key) => !allowed.has(key))) {
    throw new FdeRequestError(
      "STUDIO_REQUEST_FIELDS_INVALID",
      "body",
      400,
      "request contains an unsupported field"
    );
  }

  const serialized = JSON.stringify(body);
  const bytes = Buffer.byteLength(request?.rawBody || serialized, "utf8");
  if (options.maxBytes && bytes > options.maxBytes) {
    throw new FdeRequestError(
      "STUDIO_REQUEST_TOO_LARGE",
      "body",
      413,
      "request exceeds the endpoint size limit"
    );
  }
  if (options.maxDepth && exceedsDepth(body, options.maxDepth)) {
    throw new FdeRequestError(
      "STUDIO_REQUEST_TOO_DEEP",
      "body",
      413,
      "request exceeds the endpoint nesting limit"
    );
  }

  const nodes = body.spec?.workflow?.nodes;
  if (
    options.maxNodes &&
    Array.isArray(nodes) &&
    nodes.length > options.maxNodes
  ) {
    throw new FdeRequestError(
      "STUDIO_REQUEST_TOO_MANY_NODES",
      "spec.workflow.nodes",
      413,
      "workflow exceeds the endpoint node limit"
    );
  }
  if (options.rejectSecrets && redactFdeText(serialized) !== serialized) {
    throw new FdeRequestError(
      "STUDIO_REQUEST_SECRET_REJECTED",
      "spec",
      400,
      "workflow content contains secret-like material"
    );
  }
  return body;
}

module.exports = { FdeRequestError, validateFdeBody };
