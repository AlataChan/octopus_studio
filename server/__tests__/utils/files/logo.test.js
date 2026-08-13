const {
  getDefaultFilename,
  isDefaultFilename,
} = require("../../../utils/files/logo");

describe("logo defaults", () => {
  test("maps UI themes to the correct Octopus Studio banner", () => {
    expect(getDefaultFilename(false)).toBe("octopus-studio-banner-light.png");
    expect(getDefaultFilename(true)).toBe("octopus-studio-banner-dark.png");
  });

  test.each([
    "octopus-studio-banner-light.png",
    "octopus-studio-banner-dark.png",
    "anything-llm.png",
    "anything-llm-light.png",
    "anything-llm-dark.png",
    "HA -w v02 long.png",
    "HA -b v02 long.png",
  ])("treats %s as a built-in default logo", (filename) => {
    expect(isDefaultFilename(filename)).toBe(true);
  });

  test("does not treat uploaded custom filenames as defaults", () => {
    expect(isDefaultFilename("custom-logo.png")).toBe(false);
  });
});
