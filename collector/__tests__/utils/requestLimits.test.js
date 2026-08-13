const {
  DEFAULT_COLLECTOR_REQUEST_BODY_LIMIT,
  getCollectorRequestBodyLimit,
} = require("../../utils/requestLimits");

describe("collector request limits", () => {
  test("uses a modest default for global request bodies", () => {
    expect(getCollectorRequestBodyLimit({})).toBe(
      DEFAULT_COLLECTOR_REQUEST_BODY_LIMIT
    );
  });

  test("accepts configured collector request body limit overrides", () => {
    expect(
      getCollectorRequestBodyLimit({ COLLECTOR_REQUEST_BODY_LIMIT: "5mb" })
    ).toBe("5mb");
  });

  test("falls back when collector request body limit is invalid", () => {
    expect(
      getCollectorRequestBodyLimit({ COLLECTOR_REQUEST_BODY_LIMIT: "bad-size" })
    ).toBe(DEFAULT_COLLECTOR_REQUEST_BODY_LIMIT);
    expect(
      getCollectorRequestBodyLimit({ COLLECTOR_REQUEST_BODY_LIMIT: "" })
    ).toBe(DEFAULT_COLLECTOR_REQUEST_BODY_LIMIT);
  });
});
