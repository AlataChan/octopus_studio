"use strict";

describe("VideoProviders registry", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    delete process.env.MOONSHOT_AI_API_KEY;
    delete process.env.MOONSHOT_AI_BASE_URL;
    delete process.env.MOONSHOT_AI_VIDEO_MODEL_PREF;
    delete process.env.VIDEO_UNDERSTANDING_PROVIDER;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  afterEach(() => {
    jest.dontMock("../../../models/systemSettings");
    jest.dontMock("../../../utils/VideoProviders/moonshot");
  });

  function mockVideoSettings(settings = {}) {
    jest.doMock("../../../models/systemSettings", () => ({
      SystemSettings: {
        videoUnderstandingSettings: jest.fn().mockResolvedValue({
          enabled: false,
          provider: "moonshot",
          baseUrl: "https://api.moonshot.ai/v1",
          model: "kimi-k2.6",
          apiKey: null,
          ...settings,
        }),
      },
    }));
  }

  test("reports no provider and throws NoVideoProviderError when no backend is configured", async () => {
    mockVideoSettings({ apiKey: null });
    const {
      getVideoProvider,
      hasVideoProvider,
    } = require("../../../utils/VideoProviders");
    const {
      NoVideoProviderError,
    } = require("../../../utils/VideoProviders/errors");

    await expect(hasVideoProvider()).resolves.toBe(false);
    await expect(getVideoProvider()).rejects.toThrow(NoVideoProviderError);
  });

  test("returns the configured Moonshot video provider when Moonshot credentials exist", async () => {
    mockVideoSettings({ apiKey: null });
    process.env.MOONSHOT_AI_API_KEY = "test-key";
    const {
      getVideoProvider,
      hasVideoProvider,
    } = require("../../../utils/VideoProviders");
    const {
      MoonshotVideoAdapter,
    } = require("../../../utils/VideoProviders/moonshot");

    await expect(hasVideoProvider()).resolves.toBe(true);
    await expect(getVideoProvider()).resolves.toBeInstanceOf(
      MoonshotVideoAdapter
    );
  });

  test("uses persisted video settings before environment fallbacks", async () => {
    mockVideoSettings({
      apiKey: "sk-from-settings",
      baseUrl: "https://api.moonshot.cn/v1",
      model: "kimi-k2.6",
    });
    const adapterConstructor = jest.fn();
    jest.doMock("../../../utils/VideoProviders/moonshot", () => ({
      MoonshotVideoAdapter: function MoonshotVideoAdapter(config) {
        adapterConstructor(config);
        this.provider = "moonshot";
      },
    }));

    const {
      hasVideoProvider,
      getVideoProvider,
    } = require("../../../utils/VideoProviders");

    await expect(hasVideoProvider()).resolves.toBe(true);
    await getVideoProvider();
    expect(adapterConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: "sk-from-settings",
        baseURL: "https://api.moonshot.cn/v1",
        model: "kimi-k2.6",
      })
    );
  });
});

describe("MoonshotVideoAdapter", () => {
  const makeClient = () => ({
    files: {
      create: jest.fn().mockResolvedValue({ id: "file_123" }),
    },
    chat: {
      completions: {
        create: jest.fn(),
      },
    },
  });

  test("uploads video data with purpose video and returns an ms:// sourceRef", async () => {
    const {
      MoonshotVideoAdapter,
    } = require("../../../utils/VideoProviders/moonshot");
    const client = makeClient();
    const adapter = new MoonshotVideoAdapter({
      client,
      model: "moonshot-v1-8k",
    });

    const result = await adapter.uploadVideo({
      data: Buffer.from("fake video"),
      mimeType: "video/mp4",
      filename: "clip.mp4",
    });

    expect(result).toEqual({ sourceRef: "ms://file_123" });
    expect(client.files.create).toHaveBeenCalledTimes(1);
    expect(client.files.create.mock.calls[0][0]).toMatchObject({
      purpose: "video",
    });
    expect(client.files.create.mock.calls[0][0].file.name).toBe("clip.mp4");
    expect(client.files.create.mock.calls[0][0].file.type).toBe("video/mp4");
  });

  test("understands a Moonshot video sourceRef into the normalized summary shape", async () => {
    const {
      MoonshotVideoAdapter,
    } = require("../../../utils/VideoProviders/moonshot");
    const client = makeClient();
    client.chat.completions.create.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              transcript: "hello from the video",
              sceneTimeline: [
                { tStart: 0, tEnd: 3.5, description: "Opening shot" },
              ],
              keyObservations: ["A person demonstrates the product"],
            }),
          },
        },
      ],
    });
    const adapter = new MoonshotVideoAdapter({
      client,
      model: "moonshot-v1-8k",
    });

    const result = await adapter.understand({ sourceRef: "ms://file_123" });

    expect(result).toEqual({
      transcript: "hello from the video",
      sceneTimeline: [{ tStart: 0, tEnd: 3.5, description: "Opening shot" }],
      keyObservations: ["A person demonstrates the product"],
      meta: {
        provider: "moonshot",
        sourceRef: "ms://file_123",
      },
    });
    expect(client.chat.completions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "moonshot-v1-8k",
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: "user",
            content: expect.arrayContaining([
              {
                type: "video_url",
                video_url: { url: "ms://file_123" },
              },
              expect.objectContaining({ type: "text" }),
            ]),
          }),
        ]),
      })
    );
    // Must NOT send a hardcoded temperature: some vision models (kimi-k2.6)
    // only accept temperature=1 and reject any explicit value.
    const payload = client.chat.completions.create.mock.calls[0][0];
    expect(payload).not.toHaveProperty("temperature");
  });

  test("falls back to a keyObservations-only summary when model output is not JSON", async () => {
    const {
      MoonshotVideoAdapter,
    } = require("../../../utils/VideoProviders/moonshot");
    const client = makeClient();
    client.chat.completions.create.mockResolvedValue({
      choices: [{ message: { content: "A raw narrative summary." } }],
    });
    const adapter = new MoonshotVideoAdapter({ client });

    await expect(
      adapter.understand({ sourceRef: "ms://file_123" })
    ).resolves.toEqual({
      transcript: "",
      sceneTimeline: [],
      keyObservations: ["A raw narrative summary."],
      meta: {
        provider: "moonshot",
        sourceRef: "ms://file_123",
      },
    });
  });

  test("rejects non-video mime types before uploading", async () => {
    const {
      MoonshotVideoAdapter,
    } = require("../../../utils/VideoProviders/moonshot");
    const client = makeClient();
    const adapter = new MoonshotVideoAdapter({ client });

    await expect(
      adapter.uploadVideo({
        data: Buffer.from("not a video"),
        mimeType: "text/plain",
        filename: "notes.txt",
      })
    ).rejects.toThrow("Expected a video mime type");
    expect(client.files.create).not.toHaveBeenCalled();
  });
});

describe("testVideoUnderstandingConnection", () => {
  test("uploads the bundled fixture and returns the normalized summary", async () => {
    const provider = {
      uploadVideo: jest.fn().mockResolvedValue({ sourceRef: "ms://fixture" }),
      understand: jest.fn().mockResolvedValue({
        transcript: "test clip",
        sceneTimeline: [],
        keyObservations: ["colored test pattern"],
        meta: { provider: "moonshot", sourceRef: "ms://fixture" },
      }),
    };
    const {
      testVideoUnderstandingConnection,
    } = require("../../../utils/VideoProviders/testConnection");

    const result = await testVideoUnderstandingConnection(
      { provider: "moonshot", apiKey: "sk-test" },
      { providerFactory: jest.fn().mockResolvedValue(provider) }
    );

    expect(result).toEqual({
      ok: true,
      summary: expect.objectContaining({
        transcript: "test clip",
        keyObservations: ["colored test pattern"],
      }),
    });
    expect(provider.uploadVideo).toHaveBeenCalledWith(
      expect.objectContaining({
        mimeType: "video/mp4",
        filename: "video-understanding-test.mp4",
      })
    );
    expect(provider.understand).toHaveBeenCalledWith({
      sourceRef: "ms://fixture",
    });
  });
});
