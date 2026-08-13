const { checkCommandPolicy, checkMessageLength } = require("../../src/security/commandFilter");

const binding = (policy, allowed = []) => ({
  security: { commandPolicy: policy, allowedCommands: allowed, maxMessageLength: 100 },
});
const msg = (text) => ({ textContent: text });

test("deny_all blocks commands", () => {
  expect(checkCommandPolicy(msg("/approve"), binding("deny_all")).blocked).toBe(true);
});

test("allowlist blocks non-allowed commands", () => {
  expect(checkCommandPolicy(msg("/hack"), binding("allowlist", ["/approve"])).blocked).toBe(true);
});

test("allowlist allows listed commands", () => {
  expect(checkCommandPolicy(msg("/approve"), binding("allowlist", ["/approve"])).blocked).toBe(false);
});

test("non-commands are not blocked", () => {
  expect(checkCommandPolicy(msg("hello"), binding("deny_all")).blocked).toBe(false);
});

test("message length limit blocks oversized messages", () => {
  expect(checkMessageLength(msg("x".repeat(101)), binding("deny_all")).blocked).toBe(true);
});

test("message under limit passes", () => {
  expect(checkMessageLength(msg("hello"), binding("deny_all")).blocked).toBe(false);
});

