"use strict";

const RESERVED_DONE_TOOL = "done";

function cloneStep(step) {
  return { ...(step || {}) };
}

function stripSwarmFields(step) {
  const next = cloneStep(step);
  delete next.group;
  delete next.readOnly;
  delete next.reviewerAssistantId;
  return next;
}

function validGroup(value) {
  return typeof value === "string" && /^[A-Za-z0-9:_-]{1,64}$/.test(value);
}

function normalizeGroups(steps = []) {
  const out = (steps || []).map((step) => {
    const next = cloneStep(step);
    if (!validGroup(next.group)) delete next.group;
    return next;
  });

  const groups = new Map();
  out.forEach((step, index) => {
    if (!step.group) return;
    if (!groups.has(step.group)) groups.set(step.group, []);
    groups.get(step.group).push(index);
  });

  for (const indexes of groups.values()) {
    const tooLarge = indexes.length > 3;
    const nonContiguous =
      indexes[indexes.length - 1] - indexes[0] + 1 !== indexes.length;
    if (!tooLarge && !nonContiguous) continue;
    for (const index of indexes) delete out[index].group;
  }

  return out;
}

function functionEntries(functions) {
  if (!functions) return [];
  if (functions instanceof Map) return [...functions.entries()];
  if (Array.isArray(functions)) {
    return functions.map((fn) => [fn?.name, fn]).filter(([name]) => name);
  }
  if (typeof functions === "object") return Object.entries(functions);
  return [];
}

function auditReadOnly({ functions } = {}) {
  const entries = functionEntries(functions).filter(([name]) => name);
  if (entries.length === 0) {
    return { readOnly: false, reason: "no_functions" };
  }

  const unsafe = entries.filter(([name, config]) => {
    if (String(name) === RESERVED_DONE_TOOL) return false;
    return config?.isReadOnly !== true;
  });

  if (unsafe.length > 0) {
    return {
      readOnly: false,
      reason: "non_readonly_functions",
      unsafeTools: unsafe.map(([name]) => String(name)),
    };
  }
  return { readOnly: true, reason: "all_functions_readonly" };
}

function applyReadOnlyAudit(steps = [], readOnlyByIndex = new Map()) {
  const out = (steps || []).map((step, index) => ({
    ...cloneStep(step),
    readOnly: readOnlyByIndex.get(index) === true,
  }));

  for (let index = 0; index < out.length; index++) {
    if (out[index].group && out[index].readOnly !== true) {
      delete out[index].group;
    }
  }
  return normalizeGroups(out);
}

function shouldRetryReview(stepOrAudit) {
  return stepOrAudit?.readOnly === true;
}

module.exports = {
  normalizeGroups,
  auditReadOnly,
  applyReadOnlyAudit,
  shouldRetryReview,
  stripSwarmFields,
};
