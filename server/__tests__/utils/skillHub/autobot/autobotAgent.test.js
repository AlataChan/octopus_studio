const { SkillAutobotAgent } = require("../../../../utils/plugins/skillHub/autobot/autobotAgent");

describe("SkillAutobotAgent", () => {
  test("prefers local recommendation and auto-installs when workspaceId is provided", async () => {
    const unifiedSearch = {
      search: jest.fn().mockResolvedValue({
        query: "invoice",
        local: [{ skillId: "custom:local-skill", name: "Local" }],
        external: [{ skillId: "github:invoice-organizer", name: "External" }],
      }),
    };
    const installer = {
      install: jest.fn().mockResolvedValue({ installed: true, skillId: "custom:local-skill" }),
    };

    const agent = new SkillAutobotAgent({ unifiedSearch, installer });
    const result = await agent.handle({ message: "invoice", context: { workspaceId: 1 } });

    expect(result.success).toBe(true);
    expect(result.recommended.skillId).toBe("custom:local-skill");
    expect(installer.install).toHaveBeenCalledWith("custom:local-skill", {
      workspaceId: 1,
      assistantId: null,
    });
    expect(result.installResult).toEqual({ installed: true, skillId: "custom:local-skill" });
  });

  test("does not auto-install when workspaceId is missing", async () => {
    const unifiedSearch = {
      search: jest.fn().mockResolvedValue({
        query: "invoice",
        local: [{ skillId: "custom:local-skill", name: "Local" }],
        external: [],
      }),
    };
    const installer = { install: jest.fn() };
    const agent = new SkillAutobotAgent({ unifiedSearch, installer });

    const result = await agent.handle({ message: "invoice", context: {} });
    expect(installer.install).not.toHaveBeenCalled();
    expect(result.installResult).toBe(null);
  });

  test("returns a safe installResult when install throws", async () => {
    const unifiedSearch = {
      search: jest.fn().mockResolvedValue({
        query: "invoice",
        local: [{ skillId: "custom:local-skill", name: "Local" }],
        external: [],
      }),
    };
    const installer = { install: jest.fn().mockRejectedValue(new Error("blocked")) };
    const agent = new SkillAutobotAgent({ unifiedSearch, installer });

    const result = await agent.handle({ message: "invoice", context: { workspaceId: 1 } });
    expect(result.installResult).toEqual({ success: false, error: "blocked" });
  });
});

