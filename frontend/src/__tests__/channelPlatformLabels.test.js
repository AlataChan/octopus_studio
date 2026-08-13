import { describe, expect, it } from "vitest";

import { CHANNEL_PLATFORM_LABELS } from "@/utils/channelPlatformLabels";

describe("channel platform labels", () => {
  it("uses first-party naming for channel integration and runtime diagnostics entry points", () => {
    expect(CHANNEL_PLATFORM_LABELS.integration).toBe("渠道接入");
    expect(CHANNEL_PLATFORM_LABELS.runtimeOps).toBe("运行时诊断");
  });
});
