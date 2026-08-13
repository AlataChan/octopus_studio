const { CommandRegistry } = require("../../../utils/commands/CommandRegistry");
const { skillRegistry } = require("../../../utils/skills");

describe("CommandRegistry channel context", () => {
  test("filters command by skill availability", () => {
    const registry = new CommandRegistry();
    registry.registerCommand({
      command: "/demo",
      name: "demo",
      description: "demo",
      source: "skill",
      skillId: "custom_demo",
      executionMode: "agent",
    });

    const originalGetSkill = skillRegistry.getSkill;
    try {
      skillRegistry.getSkill = jest.fn(() => null);
      expect(registry.getCommand("/demo", { channel: "feishu" })).toBeNull();

      skillRegistry.getSkill = jest.fn(() => ({ id: "custom_demo" }));
      const command = registry.getCommand("/demo", { channel: "web" });

      expect(command).not.toBeNull();
      expect(command.command).toBe("/demo");
    } finally {
      skillRegistry.getSkill = originalGetSkill;
    }
  });
});
