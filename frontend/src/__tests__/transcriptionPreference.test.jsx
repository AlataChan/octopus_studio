import { describe, expect, it } from "vitest";
import { resolveTranscriptionProvider } from "@/pages/GeneralSettings/TranscriptionPreference";

describe("TranscriptionPreference provider selection", () => {
  it("falls back when the saved provider is not available", () => {
    const provider = resolveTranscriptionProvider("removed-provider");

    expect(provider.name).toBe("Unavailable transcription provider");
    expect(provider.description).toContain("no longer available");
    expect(provider.logo).toBeTruthy();
  });
});
