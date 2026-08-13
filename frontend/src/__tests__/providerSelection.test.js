import { describe, expect, it } from "vitest";
import { resolveProviderChoice } from "@/utils/providerSelection";

describe("resolveProviderChoice", () => {
  const providers = [
    { name: "Default", value: "default" },
    { name: "Configured", value: "configured" },
  ];

  it("returns the selected provider when it is known", () => {
    expect(resolveProviderChoice(providers, "configured", "default")).toEqual(
      providers[1]
    );
  });

  it("falls back when the selected provider is unknown", () => {
    expect(resolveProviderChoice(providers, "legacy", "default")).toEqual(
      providers[0]
    );
  });

  it("falls back to the first provider when the fallback is unknown", () => {
    expect(resolveProviderChoice(providers, "legacy", "missing")).toEqual(
      providers[0]
    );
  });

  it("returns null for an empty provider list", () => {
    expect(resolveProviderChoice([], "configured", "default")).toBeNull();
  });
});
