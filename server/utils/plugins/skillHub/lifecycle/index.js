const {
  localRegistry,
  externalRegistry,
  communityRegistry,
} = require("../registry");
const { SkillCreator } = require("./creator");
const { SkillChecker } = require("./checker");
const { SkillUpgrader } = require("./upgrader");
const { SkillEvolver } = require("./evolver");
const { SkillValidator } = require("./validator");
const { SkillInstaller } = require("./installer");

// Singletons for app usage
const creator = new SkillCreator();
const checker = new SkillChecker({ localRegistry });
const upgrader = new SkillUpgrader({ localRegistry });
const evolver = new SkillEvolver({ localRegistry });
const validator = new SkillValidator({ localRegistry });
const installer = new SkillInstaller({
  localRegistry,
  externalRegistry,
  communityRegistry,
});

function createLifecycle({
  localRegistry: lr,
  externalRegistry: er,
  communityRegistry: cr,
} = {}) {
  return {
    creator: new SkillCreator(),
    checker: new SkillChecker({ localRegistry: lr }),
    upgrader: new SkillUpgrader({ localRegistry: lr }),
    evolver: new SkillEvolver({ localRegistry: lr }),
    validator: new SkillValidator({ localRegistry: lr }),
    installer: new SkillInstaller({
      localRegistry: lr,
      externalRegistry: er,
      communityRegistry: cr,
    }),
  };
}

async function runCycle(overrides = {}) {
  const cycleChecker = overrides.checker || checker;
  const cycleUpgrader = overrides.upgrader || upgrader;
  const cycleEvolver = overrides.evolver || evolver;
  const cycleValidator = overrides.validator || validator;

  const checkResults = await cycleChecker.checkAll();
  const upgraded = [];

  for (const row of checkResults) {
    if (row.status !== "outdated") continue;
    try {
      const res = await cycleUpgrader.upgrade(row.skillId);
      upgraded.push(res);
    } catch (error) {
      upgraded.push({
        upgraded: false,
        skillId: row.skillId,
        error: error.message,
      });
    }
  }

  const aligned = await cycleEvolver.alignAll();
  const validations = await cycleValidator.validateAll();

  return { checkResults, upgraded, aligned, validations };
}

module.exports = {
  SkillCreator,
  SkillChecker,
  SkillUpgrader,
  SkillEvolver,
  SkillValidator,
  SkillInstaller,
  creator,
  checker,
  upgrader,
  evolver,
  validator,
  installer,
  createLifecycle,
  runCycle,
};
