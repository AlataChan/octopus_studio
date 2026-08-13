"use strict";

const {
  normalizeGroups,
  auditReadOnly,
  shouldRetryReview,
} = require("../swarmPolicy");
const { createPlan } = require("../planner");

function step(assistantId, subtask, extra = {}) {
  return { assistantId, subtask, ...extra };
}

describe("swarmPolicy", () => {
  it("strips non-contiguous groups after salvage/filtering", () => {
    const normalized = normalizeGroups([
      step("a", "one", { group: "g1" }),
      step("b", "two"),
      step("c", "three", { group: "g1" }),
    ]);

    expect(normalized.map((s) => s.group)).toEqual([undefined, undefined, undefined]);
  });

  it("strips groups larger than three without failing the plan", () => {
    const normalized = normalizeGroups([
      step("a", "one", { group: "g1" }),
      step("b", "two", { group: "g1" }),
      step("c", "three", { group: "g1" }),
      step("d", "four", { group: "g1" }),
    ]);

    expect(normalized.every((s) => s.group === undefined)).toBe(true);
  });

  it("keeps valid contiguous groups of size three or less", () => {
    const normalized = normalizeGroups([
      step("a", "one", { group: "g1" }),
      step("b", "two", { group: "g1" }),
      step("c", "three"),
    ]);

    expect(normalized[0].group).toBe("g1");
    expect(normalized[1].group).toBe("g1");
    expect(normalized[2].group).toBeUndefined();
  });

  it("audits read-only from server-side function metadata, ignoring planner hints", () => {
    expect(
      auditReadOnly({
        step: step("a", "work", { readOnly: true }),
        functions: new Map([
          ["search", { isReadOnly: true }],
          ["done", { isReadOnly: false }],
        ]),
      }).readOnly
    ).toBe(true);

    expect(
      auditReadOnly({
        step: step("a", "work", { readOnly: true }),
        functions: new Map([
          ["search", { isReadOnly: true }],
          ["write_file", { isReadOnly: false }],
        ]),
      }).readOnly
    ).toBe(false);
  });

  it("only allows automatic reviewer retry for audited read-only steps", () => {
    expect(shouldRetryReview({ readOnly: true })).toBe(true);
    expect(shouldRetryReview({ readOnly: false })).toBe(false);
  });
});

describe("planner swarm fields", () => {
  const employees = [
    { assistantId: "a", name: "A" },
    { assistantId: "b", name: "B" },
  ];

  const generateText = async () =>
    JSON.stringify([
      {
        assistantId: "a",
        subtask: "first",
        group: "g1",
        readOnly: true,
        reviewerAssistantId: "b",
      },
      { assistantId: "b", subtask: "second", group: "g1", readOnly: true },
    ]);

  afterEach(() => {
    delete process.env.TEAM_ORCHESTRATION_ENABLED;
    delete process.env.SWARM_ORCHESTRATION_ENABLED;
    delete process.env.swarm_orchestration_enabled;
  });

  it("strips optional swarm fields when the swarm flag is off", async () => {
    const plan = await createPlan({
      goal: "do it",
      employees,
      generateText,
    });

    expect(plan.steps).toEqual([
      { assistantId: "a", subtask: "first" },
      { assistantId: "b", subtask: "second" },
    ]);
  });

  it("keeps normalized optional fields when both team and swarm flags are on", async () => {
    process.env.TEAM_ORCHESTRATION_ENABLED = "true";
    process.env.SWARM_ORCHESTRATION_ENABLED = "true";

    const plan = await createPlan({
      goal: "do it",
      employees,
      generateText,
    });

    expect(plan.steps[0]).toMatchObject({
      assistantId: "a",
      subtask: "first",
      group: "g1",
      readOnly: true,
      reviewerAssistantId: "b",
    });
    expect(plan.steps[1].group).toBe("g1");
  });
});
