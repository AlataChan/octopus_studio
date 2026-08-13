function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function extractKmState(snapshot = {}) {
  const km = snapshot?.state?.km || snapshot?.km || {};
  return {
    configured: km.configured === true,
    httpReady: km.httpReady === true || km.http_ready === true,
    knowledgeBases: asArray(km.knowledgeBases || km.knowledge_bases),
    datasets: asArray(km.datasets),
    defaults: km.defaults && typeof km.defaults === "object" ? km.defaults : {},
  };
}

function normalizeFailure(result, fallbackCode) {
  return {
    success: false,
    code: result?.code || fallbackCode,
    error: result?.error || "Molt KM request failed",
    ...(result?.statusCode ? { statusCode: result.statusCode } : {}),
  };
}

function createKmBridge({ client } = {}) {
  return {
    async status() {
      if (!client) {
        return {
          success: false,
          code: "MOLT_NOT_CONFIGURED",
          error: "Molt client is not configured",
        };
      }

      const snapshot = await client.capabilitySnapshot();
      if (snapshot?.ok === false) {
        return normalizeFailure(snapshot, "MOLT_KM_STATUS_ERROR");
      }

      return {
        success: true,
        km: extractKmState(snapshot),
        raw: snapshot,
      };
    },
  };
}

module.exports = { createKmBridge, extractKmState };
