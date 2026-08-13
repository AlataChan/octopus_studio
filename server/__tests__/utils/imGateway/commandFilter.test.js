const {
  evaluateCommandPolicy,
  extractSlashCommand,
} = require("../../../utils/imGateway/security/commandFilter");

describe("commandFilter", () => {
  test("extracts slash command", () => {
    expect(extractSlashCommand("/reset now")).toBe("/reset");
    expect(extractSlashCommand("hello")).toBeNull();
  });

  test("deny_all blocks commands", () => {
    const result = evaluateCommandPolicy({
      textContent: "/danger run",
      security: { commandPolicy: "deny_all" },
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("COMMAND_POLICY_DENY_ALL");
  });

  test("allowlist permits only listed commands", () => {
    const allowResult = evaluateCommandPolicy({
      textContent: "/query-db select 1",
      security: {
        commandPolicy: "allowlist",
        allowedCommands: ["/query-db"],
      },
    });

    const denyResult = evaluateCommandPolicy({
      textContent: "/reset",
      security: {
        commandPolicy: "allowlist",
        allowedCommands: ["/query-db"],
      },
    });

    expect(allowResult.allowed).toBe(true);
    expect(denyResult.allowed).toBe(false);
    expect(denyResult.reason).toBe("COMMAND_NOT_IN_ALLOWLIST");
  });

  test("non-command content is always allowed", () => {
    const result = evaluateCommandPolicy({
      textContent: "just plain text",
      security: { commandPolicy: "deny_all" },
    });

    expect(result.allowed).toBe(true);
    expect(result.command).toBeNull();
  });
});
