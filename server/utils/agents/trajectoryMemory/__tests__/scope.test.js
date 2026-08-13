"use strict";

const { resolveTrajectoryScope } = require("../scope");

describe("trajectory memory scope", () => {
  test("single-user mode resolves to workspace system scope", () => {
    expect(
      resolveTrajectoryScope({
        workspaceId: 7,
        userId: null,
        multiUserMode: false,
      })
    ).toEqual({
      ok: true,
      scopeKey: "ws:7:system",
      namespace: "traj-ws-7-u-0",
    });
  });

  test("multi-user mode resolves to workspace user scope", () => {
    expect(
      resolveTrajectoryScope({
        workspaceId: "7",
        userId: "42",
        multiUserMode: true,
      })
    ).toEqual({
      ok: true,
      scopeKey: "ws:7:user:42",
      namespace: "traj-ws-7-u-42",
    });
  });

  test("multi-user mode without userId fails closed and never falls back to u-0", () => {
    const result = resolveTrajectoryScope({
      workspaceId: 7,
      userId: null,
      multiUserMode: true,
    });

    expect(result).toEqual({
      ok: false,
      reason: "scope_unresolvable",
    });
    expect(JSON.stringify(result)).not.toContain("u-0");
  });

  test("invalid workspace id fails closed", () => {
    expect(
      resolveTrajectoryScope({
        workspaceId: "not-a-number",
        userId: 1,
        multiUserMode: false,
      })
    ).toEqual({
      ok: false,
      reason: "scope_unresolvable",
    });
  });
});
