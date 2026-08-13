const ENGINES = {
  MASTRA: "mastra",
};

class UnsupportedWorkAgentEngineError extends Error {
  constructor() {
    super("Unsupported work-agent engine");
    this.name = "UnsupportedWorkAgentEngineError";
  }
}

function normalizeEngine(value) {
  const engine = typeof value === "string" ? value.trim().toLowerCase() : "";
  return Object.values(ENGINES).includes(engine) ? engine : null;
}

function resolveEngineSelection({
  requestedEngine = null,
  globalDefaultEngine = null,
} = {}) {
  const hasRequested =
    requestedEngine !== null && requestedEngine !== undefined;
  const hasGlobalDefault =
    globalDefaultEngine !== null && globalDefaultEngine !== undefined;
  const requested = hasRequested ? normalizeEngine(requestedEngine) : null;
  const globalDefault = hasGlobalDefault
    ? normalizeEngine(globalDefaultEngine)
    : null;
  if ((hasRequested && !requested) || (hasGlobalDefault && !globalDefault)) {
    throw new UnsupportedWorkAgentEngineError();
  }
  const selected = requested || globalDefault || ENGINES.MASTRA;

  return {
    engine: selected,
    requestedEngine: selected,
    reason: requested
      ? "requested"
      : globalDefault
        ? "global_default"
        : "default",
  };
}

module.exports = {
  ENGINES,
  UnsupportedWorkAgentEngineError,
  resolveEngineSelection,
};
