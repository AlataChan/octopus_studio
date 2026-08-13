const { resolveServiceHost } = require("../../utils/bindHost");

describe("collector bind host resolution", () => {
  test("preserves default listen behavior outside desktop runtime", () => {
    expect(resolveServiceHost({}, "COLLECTOR_HOST")).toBeUndefined();
  });

  test("defaults desktop runtime to loopback", () => {
    expect(
      resolveServiceHost({ ANYTHING_LLM_RUNTIME: "desktop" }, "COLLECTOR_HOST")
    ).toBe("127.0.0.1");
  });

  test("honors explicit service host override", () => {
    expect(
      resolveServiceHost(
        {
          ANYTHING_LLM_RUNTIME: "desktop",
          COLLECTOR_HOST: "0.0.0.0",
        },
        "COLLECTOR_HOST"
      )
    ).toBe("0.0.0.0");
  });
});
