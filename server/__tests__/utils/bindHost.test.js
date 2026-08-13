const { resolveServiceHost } = require("../../utils/bindHost");

describe("server bind host resolution", () => {
  test("preserves default listen behavior outside desktop runtime", () => {
    expect(resolveServiceHost({})).toBeUndefined();
  });

  test("defaults desktop runtime to loopback", () => {
    expect(resolveServiceHost({ ANYTHING_LLM_RUNTIME: "desktop" })).toBe(
      "127.0.0.1"
    );
  });

  test("honors explicit service host override", () => {
    expect(
      resolveServiceHost({
        ANYTHING_LLM_RUNTIME: "desktop",
        SERVER_HOST: "0.0.0.0",
      })
    ).toBe("0.0.0.0");
  });
});
