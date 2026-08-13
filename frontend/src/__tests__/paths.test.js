import { describe, expect, it } from "vitest";
import paths from "@/utils/paths";

describe("paths", () => {
  it("uses the agent chat home as the default route", () => {
    expect(paths.home()).toBe("/");
  });
});
