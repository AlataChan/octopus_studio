"use strict";

const {
  isTeamOrchestrationEnabled,
  isTeamTrigger,
  TEAM_HANDLES,
} = require("../../../../utils/agents/orchestration/teamTrigger");

describe("isTeamOrchestrationEnabled", () => {
  test("returns false when env var is absent", () => {
    expect(isTeamOrchestrationEnabled({})).toBe(false);
  });

  test("returns false when env var is 'false'", () => {
    expect(isTeamOrchestrationEnabled({ TEAM_ORCHESTRATION_ENABLED: "false" })).toBe(false);
  });

  test("returns false when env var is '0'", () => {
    expect(isTeamOrchestrationEnabled({ TEAM_ORCHESTRATION_ENABLED: "0" })).toBe(false);
  });

  test("returns true when env var is 'true'", () => {
    expect(isTeamOrchestrationEnabled({ TEAM_ORCHESTRATION_ENABLED: "true" })).toBe(true);
  });

  test("returns true when env var is 'TRUE' (case-insensitive)", () => {
    expect(isTeamOrchestrationEnabled({ TEAM_ORCHESTRATION_ENABLED: "TRUE" })).toBe(true);
  });
});

describe("isTeamTrigger — flag OFF (zero-impact)", () => {
  const flagOffEnv = {};

  test("returns false with @团队 in message when flag is OFF", () => {
    expect(isTeamTrigger({ message: "hello @团队 world", assistantId: null, env: flagOffEnv })).toBe(false);
  });

  test("returns false with @team in message when flag is OFF", () => {
    expect(isTeamTrigger({ message: "@team do something", assistantId: null, env: flagOffEnv })).toBe(false);
  });

  test("returns false with matching assistantId when flag is OFF", () => {
    expect(isTeamTrigger({ message: "hello", assistantId: "42", teamAssistantId: "42", env: flagOffEnv })).toBe(false);
  });

  test("returns false for any input when flag is OFF", () => {
    expect(isTeamTrigger({ message: "", assistantId: null, env: flagOffEnv })).toBe(false);
  });
});

describe("isTeamTrigger — flag ON", () => {
  const flagOnEnv = { TEAM_ORCHESTRATION_ENABLED: "true" };

  test("returns true when message contains @团队", () => {
    expect(isTeamTrigger({ message: "@团队 请帮我完成任务", assistantId: null, env: flagOnEnv })).toBe(true);
  });

  test("returns true when message contains @team", () => {
    expect(isTeamTrigger({ message: "@team please do this", assistantId: null, env: flagOnEnv })).toBe(true);
  });

  test("returns true when message contains @team anywhere", () => {
    expect(isTeamTrigger({ message: "hello @team world", assistantId: null, env: flagOnEnv })).toBe(true);
  });

  test("returns false when message has no team handle", () => {
    expect(isTeamTrigger({ message: "normal message", assistantId: null, env: flagOnEnv })).toBe(false);
  });

  test("returns false when message is empty", () => {
    expect(isTeamTrigger({ message: "", assistantId: null, env: flagOnEnv })).toBe(false);
  });

  test("returns true when assistantId matches teamAssistantId", () => {
    expect(
      isTeamTrigger({ message: "no handle", assistantId: "42", teamAssistantId: "42", env: flagOnEnv })
    ).toBe(true);
  });

  test("returns false when assistantId does NOT match teamAssistantId", () => {
    expect(
      isTeamTrigger({ message: "no handle", assistantId: "42", teamAssistantId: "99", env: flagOnEnv })
    ).toBe(false);
  });

  test("returns false when teamAssistantId is null even if assistantId is set", () => {
    expect(
      isTeamTrigger({ message: "no handle", assistantId: "42", teamAssistantId: null, env: flagOnEnv })
    ).toBe(false);
  });

  test("coerces assistantId and teamAssistantId to strings for comparison", () => {
    expect(
      isTeamTrigger({ message: "no handle", assistantId: 42, teamAssistantId: "42", env: flagOnEnv })
    ).toBe(true);
  });
});

describe("TEAM_HANDLES", () => {
  test("exports the expected handles", () => {
    expect(TEAM_HANDLES).toContain("@团队");
    expect(TEAM_HANDLES).toContain("@team");
  });
});
