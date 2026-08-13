const { prepareConditionalRun, renderBranch } = require("./conditionalRuntime");

async function executeWithOwnOrchestrator(spec, context) {
  const prepared = prepareConditionalRun(spec, context);
  const branch = prepared.branches.find(
    (candidate) => candidate.when === prepared.selected
  );
  return renderBranch(prepared.specId, branch, prepared.context);
}

module.exports = { executeWithOwnOrchestrator };
