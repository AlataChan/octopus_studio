import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import VideoUnderstandingSettings, {
  buildVideoUnderstandingPayload,
  videoSummaryPreview,
} from "@/pages/GeneralSettings/Settings/components/VideoUnderstanding";
import Admin from "@/models/admin";

describe("VideoUnderstandingSettings", () => {
  it("renders the privacy notice and hides provider fields while disabled", () => {
    const markup = renderToStaticMarkup(
      <VideoUnderstandingSettings
        initialSettings={{
          video_understanding_enabled: "false",
          video_understanding_provider: "moonshot",
        }}
      />
    );

    expect(markup).toContain("Video Understanding");
    expect(markup).toContain("videos are uploaded");
    expect(markup).not.toContain("Base URL");
    expect(markup).not.toContain("Test connection");
  });

  it("renders provider configuration and test action when enabled", () => {
    const markup = renderToStaticMarkup(
      <VideoUnderstandingSettings
        initialSettings={{
          video_understanding_enabled: "true",
          video_understanding_provider: "moonshot",
          video_understanding_base_url: "https://api.moonshot.cn/v1",
          video_understanding_model: "kimi-k2.6",
          video_understanding_api_key: "********************",
        }}
      />
    );

    expect(markup).toContain("Base URL");
    expect(markup).toContain("kimi-k2.6");
    expect(markup).toContain("Moonshot");
    expect(markup).toContain("Test connection");
  });

  it("builds a system-preferences payload for video settings", () => {
    expect(
      buildVideoUnderstandingPayload({
        enabled: true,
        provider: "moonshot",
        baseUrl: "https://api.moonshot.cn/v1",
        model: "kimi-k2.6",
        apiKey: "sk-test",
      })
    ).toEqual({
      video_understanding_enabled: "true",
      video_understanding_provider: "moonshot",
      video_understanding_base_url: "https://api.moonshot.cn/v1",
      video_understanding_model: "kimi-k2.6",
      video_understanding_api_key: "sk-test",
    });
  });

  it("formats successful connection summaries for display", () => {
    expect(
      videoSummaryPreview({
        transcript: "hello",
        keyObservations: ["first", "second", "third"],
      })
    ).toContain("first");
    expect(
      videoSummaryPreview({
        transcript: "hello",
        keyObservations: ["first", "second", "third"],
      })
    ).not.toContain("third");
  });
});

describe("Admin video understanding API", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.window = {
      localStorage: {
        getItem: vi.fn(() => null),
        setItem: vi.fn(),
        removeItem: vi.fn(),
      },
    };
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    delete global.window;
  });

  it("posts video test settings to the admin test endpoint", async () => {
    global.fetch.mockResolvedValue({
      json: () =>
        Promise.resolve({
          ok: true,
          summary: { transcript: "fixture" },
        }),
    });

    const body = {
      provider: "moonshot",
      baseUrl: "https://api.moonshot.cn/v1",
      model: "kimi-k2.6",
      apiKey: "sk-test",
    };

    await expect(Admin.testVideoUnderstandingConnection(body)).resolves.toEqual(
      {
        ok: true,
        summary: { transcript: "fixture" },
      }
    );
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/admin/video-understanding/test"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(body),
      })
    );
  });
});
