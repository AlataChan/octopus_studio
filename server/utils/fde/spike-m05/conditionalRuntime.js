const REFERENCE = /\$\{(input|binding)\.([a-zA-Z_][a-zA-Z0-9_]*)\}/g;

class M05InvariantError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "M05InvariantError";
    this.code = code;
  }
}

function validateConditionalSpec(spec) {
  if (
    !spec ||
    spec.type !== "condition" ||
    spec.condition?.operator !== "equals" ||
    spec.condition?.source !== "input" ||
    typeof spec.condition?.field !== "string" ||
    !Array.isArray(spec.branches) ||
    spec.branches.length !== 2 ||
    !spec.branches.some((branch) => branch.when === true) ||
    !spec.branches.some((branch) => branch.when === false)
  ) {
    throw new M05InvariantError(
      "M05_UNSUPPORTED_CONDITION",
      "condition must use the supported input-equals form with true and false branches"
    );
  }

  for (const branch of spec.branches) {
    if (
      typeof branch.route !== "string" ||
      typeof branch.message !== "string"
    ) {
      throw new M05InvariantError(
        "M05_UNSUPPORTED_BRANCH",
        "each branch must declare a route and message template"
      );
    }
  }
}

function validateContext(spec, context) {
  const field = spec.condition.field;
  if (!Object.prototype.hasOwnProperty.call(context.inputs, field)) {
    throw new M05InvariantError(
      "M05_UNRESOLVED_INPUT",
      "the condition references an input that was not supplied"
    );
  }
}

function evaluateCondition(spec, context) {
  return context.inputs[spec.condition.field] === spec.condition.value;
}

function interpolate(template, context) {
  return template.replace(REFERENCE, (_match, source, key) => {
    const values = source === "input" ? context.inputs : context.bindings;
    if (!Object.prototype.hasOwnProperty.call(values, key)) {
      throw new M05InvariantError(
        source === "input" ? "M05_UNRESOLVED_INPUT" : "M05_UNRESOLVED_BINDING",
        `a required ${source} value was not resolved`
      );
    }
    return String(values[key]);
  });
}

function renderBranch(specId, branch, context) {
  return {
    output: {
      route: branch.route,
      message: interpolate(branch.message, context),
    },
    trace: [
      { event: "condition.start", nodeId: specId },
      { event: "condition.end", nodeId: specId, selected: branch.route },
    ],
  };
}

function prepareConditionalRun(spec, context) {
  validateConditionalSpec(spec);
  validateContext(spec, context);
  return {
    selected: evaluateCondition(spec, context),
    specId: spec.id,
    branches: spec.branches,
    context,
  };
}

module.exports = {
  M05InvariantError,
  prepareConditionalRun,
  renderBranch,
};
