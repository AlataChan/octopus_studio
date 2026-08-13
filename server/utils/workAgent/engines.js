const { ENGINES } = require("./enginePolicy");
const { MastraEngineAdapter } = require("./engine/mastraAdapter");

const engineInstances = new Map();

function getWorkAgentEngine(engine = ENGINES.MASTRA) {
  if (engine !== ENGINES.MASTRA) {
    throw new Error("Unsupported work-agent engine");
  }
  if (engineInstances.has(engine)) return engineInstances.get(engine);

  const engineInstance = new MastraEngineAdapter();

  engineInstances.set(engine, engineInstance);
  return engineInstance;
}

function resetWorkAgentEnginesForTest() {
  engineInstances.clear();
}

function shutdownWorkAgentEngines() {
  for (const engine of engineInstances.values()) {
    if (typeof engine.shutdown !== "function") continue;
    try {
      Promise.resolve(engine.shutdown()).catch((error) =>
        console.warn(
          "[workAgent] engine shutdown failed:",
          error?.message || error
        )
      );
    } catch (error) {
      console.warn(
        "[workAgent] engine shutdown failed:",
        error?.message || error
      );
    }
  }
  engineInstances.clear();
}

module.exports = {
  getWorkAgentEngine,
  resetWorkAgentEnginesForTest,
  shutdownWorkAgentEngines,
};
