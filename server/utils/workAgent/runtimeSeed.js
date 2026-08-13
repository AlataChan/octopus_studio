const {
  seedDefaultAssistants,
} = require("../../prisma/seeds/seedDefaultAssistants");
const {
  WORK_AGENT_SETTINGS,
  getBooleanWorkAgentSetting,
} = require("./settings");

async function reseedWorkAgentAssistants({
  env = process.env,
  getBooleanWorkAgentSetting: getBooleanSetting = getBooleanWorkAgentSetting,
  seedDefaultAssistants: runSeedDefaultAssistants = seedDefaultAssistants,
} = {}) {
  const includeGstack = await getBooleanSetting(
    WORK_AGENT_SETTINGS.seedGstackAssistants,
    { env }
  );
  const includeDemo = true;

  const result = await runSeedDefaultAssistants(undefined, {
    env,
    includeDemo,
    includeGstack,
  });

  return {
    skipped: false,
    includeDemo,
    includeGstack,
    result,
  };
}

function scheduleWorkAgentAssistantReseed({
  log = console.log,
  warn = console.warn,
  reseed = reseedWorkAgentAssistants,
} = {}) {
  setImmediate(async () => {
    try {
      const result = await reseed();
      if (result?.skipped) return;
      log(
        `[WorkAgentSeed] Runtime assistant seed complete: ${JSON.stringify(
          result.result || {}
        )}`
      );
    } catch (error) {
      warn(`[WorkAgentSeed] Runtime assistant seed skipped: ${error.message}`);
    }
  });
}

module.exports = {
  reseedWorkAgentAssistants,
  scheduleWorkAgentAssistantReseed,
};
