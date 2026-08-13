const { resolveGatewayHost } = require("../../src");

describe("gateway bind host resolution", () => {
  test("preserves default listen behavior outside desktop runtime", () => {
    expect(resolveGatewayHost({})).toBeUndefined();
  });

  test("defaults desktop runtime to loopback", () => {
    expect(resolveGatewayHost({ ANYTHING_LLM_RUNTIME: "desktop" })).toBe(
      "127.0.0.1"
    );
  });

  test("honors explicit gateway host override", () => {
    expect(
      resolveGatewayHost({
        ANYTHING_LLM_RUNTIME: "desktop",
        GATEWAY_HOST: "0.0.0.0",
      })
    ).toBe("0.0.0.0");
  });
});
