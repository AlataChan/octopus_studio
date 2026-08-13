const mockUpsert = jest.fn();
const mockFindFirst = jest.fn();

jest.mock("../../utils/prisma", () => ({
  system_settings: {
    upsert: (...args) => mockUpsert(...args),
    findFirst: (...args) => mockFindFirst(...args),
  },
}));

const { SystemSettings } = require("../../models/systemSettings");

describe("SystemSettings validations", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpsert.mockResolvedValue({});
    mockFindFirst.mockResolvedValue(null);
  });

  describe("MOLT_BASE_URL", () => {
    test("stores valid http(s) URLs without trailing slashes", async () => {
      const result = await SystemSettings.updateSettings({
        MOLT_BASE_URL: "https://molt.example:8443/base/",
      });

      expect(result).toEqual({ success: true, error: null });
      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { label: "MOLT_BASE_URL" },
          update: { value: "https://molt.example:8443/base" },
          create: {
            label: "MOLT_BASE_URL",
            value: "https://molt.example:8443/base",
          },
        })
      );
    });

    test.each(["not a url", "ftp://x", "javascript:alert(1)"])(
      "rejects invalid URL value %p without persisting it",
      async (value) => {
        const result = await SystemSettings.updateSettings({
          MOLT_BASE_URL: value,
        });

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/MOLT_BASE_URL must/);
        expect(mockUpsert).not.toHaveBeenCalled();
      }
    );

    test("clears empty values to null", async () => {
      const result = await SystemSettings.updateSettings({
        MOLT_BASE_URL: "",
      });

      expect(result).toEqual({ success: true, error: null });
      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { label: "MOLT_BASE_URL" },
          update: { value: null },
          create: { label: "MOLT_BASE_URL", value: null },
        })
      );
    });
  });

  describe("currentLogoFilename", () => {
    test.each([
      "octopus-studio-banner-light.png",
      "octopus-studio-banner-dark.png",
      "anything-llm.png",
      "HA -w v02 long.png",
      "HA -b v02 long.png",
    ])("normalizes default logo row %s to null", async (filename) => {
      mockFindFirst.mockResolvedValue({
        label: "logo_filename",
        value: filename,
      });

      await expect(SystemSettings.currentLogoFilename()).resolves.toBeNull();
      expect(mockFindFirst).toHaveBeenCalledWith({
        where: { label: "logo_filename" },
      });
    });

    test("returns uploaded custom logo filenames unchanged", async () => {
      mockFindFirst.mockResolvedValue({
        label: "logo_filename",
        value: "custom-logo.png",
      });

      await expect(SystemSettings.currentLogoFilename()).resolves.toBe(
        "custom-logo.png"
      );
    });
  });

  describe("OCTOPUS_KB_MEMORY_ENABLED", () => {
    test("stores boolean memory enablement as a normalized string", async () => {
      const result = await SystemSettings.updateSettings({
        OCTOPUS_KB_MEMORY_ENABLED: true,
      });

      expect(result).toEqual({ success: true, error: null });
      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { label: "OCTOPUS_KB_MEMORY_ENABLED" },
          update: { value: "true" },
          create: {
            label: "OCTOPUS_KB_MEMORY_ENABLED",
            value: "true",
          },
        })
      );
    });
  });

  describe("video_understanding_enabled", () => {
    test("defaults to disabled when no setting is stored", async () => {
      mockFindFirst.mockResolvedValue(null);

      await expect(SystemSettings.videoUnderstandingEnabled()).resolves.toBe(
        false
      );
    });

    test("stores video understanding enablement as a normalized string", async () => {
      const result = await SystemSettings.updateSettings({
        video_understanding_enabled: true,
      });

      expect(result).toEqual({ success: true, error: null });
      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { label: "video_understanding_enabled" },
          update: { value: "true" },
          create: {
            label: "video_understanding_enabled",
            value: "true",
          },
        })
      );
    });
  });

  describe("video understanding provider settings", () => {
    test("stores provider, base URL, model, and API key settings", async () => {
      const result = await SystemSettings.updateSettings({
        video_understanding_provider: "moonshot",
        video_understanding_base_url: "https://api.moonshot.cn/v1/",
        video_understanding_model: "kimi-k2.6",
        video_understanding_api_key: "sk-video",
      });

      expect(result).toEqual({ success: true, error: null });
      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { label: "video_understanding_provider" },
          update: { value: "moonshot" },
        })
      );
      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { label: "video_understanding_base_url" },
          update: { value: "https://api.moonshot.cn/v1" },
        })
      );
      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { label: "video_understanding_model" },
          update: { value: "kimi-k2.6" },
        })
      );
      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { label: "video_understanding_api_key" },
          update: { value: "sk-video" },
        })
      );
    });

    test("keeps the stored video API key when a masked value is submitted", async () => {
      mockFindFirst.mockResolvedValue({
        label: "video_understanding_api_key",
        value: "sk-existing",
      });

      await SystemSettings.updateSettings({
        video_understanding_api_key: "********************",
      });

      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { label: "video_understanding_api_key" },
          update: { value: "sk-existing" },
          create: {
            label: "video_understanding_api_key",
            value: "sk-existing",
          },
        })
      );
    });

    test("returns masked admin video settings with effective defaults", async () => {
      mockFindFirst.mockImplementation(async ({ where }) => {
        const rows = {
          video_understanding_api_key: "sk-existing",
          video_understanding_model: "kimi-custom",
        };
        const value = rows[where.label];
        return value ? { label: where.label, value } : null;
      });

      await expect(
        SystemSettings.videoUnderstandingSettings()
      ).resolves.toEqual({
        enabled: false,
        provider: "moonshot",
        baseUrl: "https://api.moonshot.ai/v1",
        model: "kimi-custom",
        apiKey: "********************",
      });
    });
  });
});
