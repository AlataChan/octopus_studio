const {
  filterActorsByPermission,
  redactForRole,
  filterLinksByPermission,
  filterMetricsByPermission,
  resolveOfficeUserInfo,
} = require("../../endpoints/office");

describe("office endpoint helpers", () => {
  const adminUser = { role: "admin", workspaceSlugs: ["sales", "support"] };
  const managerUser = { role: "manager", workspaceSlugs: ["sales"] };
  const defaultUser = { role: "default", workspaceSlugs: ["sales"] };

  const actors = [
    {
      id: "a1",
      workspaceSlug: "sales",
      speechBubble: "Full response text here with sensitive data",
    },
    {
      id: "a2",
      workspaceSlug: "support",
      speechBubble: "Another response",
    },
  ];

  const links = [
    {
      id: "a1-a2",
      source: "a1",
      target: "a2",
      type: "co_session",
      strength: 0.5,
    },
    {
      id: "a2-a3",
      source: "a2",
      target: "a3",
      type: "co_session",
      strength: 0.3,
    },
  ];

  const metricActors = [
    {
      actorId: "a1",
      workspaceSlug: "sales",
      metrics: { totalInvocations: 3 },
    },
    {
      actorId: "a2",
      workspaceSlug: "support",
      metrics: { totalInvocations: 7 },
    },
  ];

  it("admin sees all actors", () => {
    expect(filterActorsByPermission(actors, adminUser)).toHaveLength(2);
  });

  it("manager sees only managed workspaces", () => {
    expect(filterActorsByPermission(actors, managerUser)).toHaveLength(1);
    expect(filterActorsByPermission(actors, managerUser)[0].id).toBe("a1");
  });

  it("default user sees only own workspaces", () => {
    expect(filterActorsByPermission(actors, defaultUser)).toHaveLength(1);
  });

  it("redacts speechBubble for default role", () => {
    const redacted = redactForRole(actors[0], "default");
    expect(redacted.speechBubble.length).toBeLessThanOrEqual(53);
  });

  it("does not redact for admin", () => {
    const redacted = redactForRole(actors[0], "admin");
    expect(redacted.speechBubble).toBe(actors[0].speechBubble);
  });

  it("filterLinksByPermission keeps only edges where both ends are visible", () => {
    const visible = new Set(["a1", "a2"]);
    const filtered = filterLinksByPermission(links, visible);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe("a1-a2");
  });

  it("filterLinksByPermission returns empty for no visible actors", () => {
    const filtered = filterLinksByPermission(links, new Set());
    expect(filtered).toHaveLength(0);
  });

  it("filterMetricsByPermission filters by payload workspaceSlug and strips it", () => {
    const filtered = filterMetricsByPermission(metricActors, defaultUser);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]).toEqual({
      actorId: "a1",
      metrics: { totalInvocations: 3 },
    });
    expect(filtered[0].workspaceSlug).toBeUndefined();
  });

  it("resolveOfficeUserInfo allows single-user mode without a user object", () => {
    const info = resolveOfficeUserInfo({
      user: null,
      multiUserMode: false,
      workspaceSlugs: [],
    });
    expect(info).toEqual({ role: "admin", workspaceSlugs: [] });
  });
});
