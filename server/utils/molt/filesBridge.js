function buildTextUploadPayload({ filename, content } = {}) {
  if (!filename || !String(filename).trim()) {
    throw new Error("filename is required");
  }
  if (content === undefined || content === null) {
    throw new Error("content is required");
  }

  return {
    filename: String(filename).trim(),
    dataBase64: Buffer.from(String(content), "utf8").toString("base64"),
  };
}

function normalizeFailure(result, fallbackCode) {
  return {
    success: false,
    code: result?.code || fallbackCode,
    error: result?.error || "Molt file upload failed",
    ...(result?.statusCode ? { statusCode: result.statusCode } : {}),
    ...(result?.body ? { details: result.body } : {}),
  };
}

async function uploadTextFileToMolt({
  client,
  agentId = process.env.MOLT_DEFAULT_AGENT_ID || "molt-matrix",
  filename,
  content,
} = {}) {
  if (!client) {
    return {
      success: false,
      code: "MOLT_NOT_CONFIGURED",
      error: "Molt client is not configured",
    };
  }

  const payload = buildTextUploadPayload({ filename, content });
  const result = await client.uploadAgentFile(agentId, payload);
  if (result?.ok === false) {
    return normalizeFailure(result, "MOLT_FILE_UPLOAD_ERROR");
  }

  return {
    success: true,
    upload: result?.data || result,
    raw: result,
  };
}

module.exports = { buildTextUploadPayload, uploadTextFileToMolt };
