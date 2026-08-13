const { BindingMatcher } = require("../../src/router/BindingMatcher");

const makeBinding = (overrides = {}) => ({
  id: "b1",
  enabled: true,
  channel: "feishu",
  accountId: "app1",
  match: { peerType: "group", peerId: "*" },
  route: { workspaceSlug: "default", sessionScope: "per-channel-peer" },
  security: { commandPolicy: "inherit_workspace" },
  priority: 0,
  ...overrides,
});

const makeMessage = (overrides = {}) => ({
  provider: "feishu",
  accountId: "app1",
  peerType: "group",
  peerId: "chat1",
  senderId: "user1",
  ...overrides,
});

test("matches wildcard binding", () => {
  const matcher = new BindingMatcher([makeBinding()]);
  expect(matcher.match(makeMessage())).not.toBeNull();
});

test("returns null when channel does not match", () => {
  const matcher = new BindingMatcher([makeBinding({ channel: "wecom" })]);
  expect(matcher.match(makeMessage({ provider: "feishu" }))).toBeNull();
});

test("prefers exact peerId over wildcard", () => {
  const exact = makeBinding({ match: { peerId: "chat1" }, priority: 0, id: "exact" });
  const wildcard = makeBinding({ match: { peerId: "*" }, priority: 100, id: "wildcard" });
  const matcher = new BindingMatcher([wildcard, exact]);
  expect(matcher.match(makeMessage({ peerId: "chat1" })).id).toBe("exact");
});

test("disabled bindings are skipped", () => {
  const matcher = new BindingMatcher([makeBinding({ enabled: false })]);
  expect(matcher.match(makeMessage())).toBeNull();
});

