/**
 * @file ImagePreprocessor 单元测试
 * @description 测试图像预处理器的各项功能
 */

process.env.STORAGE_DIR = "test-storage";

const path = require("path");
const fs = require("fs");
const os = require("os");

// 支持从根目录或 collector 目录运行测试
const modulePath = fs.existsSync(path.join(__dirname, "../../../utils/OCRLoader/imagePreprocessor.js"))
  ? "../../../utils/OCRLoader/imagePreprocessor"
  : "../../../../collector/utils/OCRLoader/imagePreprocessor";
const { ImagePreprocessor } = require(modulePath);

// 最小的有效 PNG 图像（1x1 白色像素）
const MINIMAL_PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49,
  0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02,
  0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44,
  0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xff, 0xff, 0x3f, 0x00, 0x05, 0xfe, 0x02,
  0xfe, 0xdc, 0xcc, 0x59, 0xe7, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44,
  0xae, 0x42, 0x60, 0x82,
]);

describe("ImagePreprocessor", () => {
  let preprocessor;
  let testImagePath;
  let tempFiles = [];

  beforeAll(async () => {
    preprocessor = new ImagePreprocessor();

    // 使用最小 PNG 创建测试文件
    testImagePath = path.join(os.tmpdir(), "test_image_preprocessor.png");
    fs.writeFileSync(testImagePath, MINIMAL_PNG);
    tempFiles.push(testImagePath);
  });

  afterAll(() => {
    // 清理临时文件
    for (const file of tempFiles) {
      try {
        if (fs.existsSync(file)) {
          fs.unlinkSync(file);
        }
      } catch {
        // 忽略清理错误
      }
    }
  });

  describe("constructor", () => {
    it("should use default options", () => {
      const p = new ImagePreprocessor();
      expect(p.threshold).toBe(128);
      expect(p.enableBinarization).toBe(true);
      expect(p.sharpenSigma).toBe(1);
    });

    it("should accept custom options", () => {
      const p = new ImagePreprocessor({
        threshold: 200,
        enableBinarization: false,
        sharpenSigma: 2,
      });
      expect(p.threshold).toBe(200);
      expect(p.enableBinarization).toBe(false);
      expect(p.sharpenSigma).toBe(2);
    });
  });

  describe("preprocess", () => {
    it("should preprocess an image from file path", async () => {
      const result = await preprocessor.preprocess(testImagePath);
      expect(Buffer.isBuffer(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it("should preprocess an image from buffer", async () => {
      const buffer = fs.readFileSync(testImagePath);
      const result = await preprocessor.preprocess(buffer);
      expect(Buffer.isBuffer(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it("should throw error for non-existent file", async () => {
      await expect(
        preprocessor.preprocess("/non/existent/file.png")
      ).rejects.toThrow("File not found");
    });

    it("should throw error for invalid input type", async () => {
      await expect(preprocessor.preprocess(12345)).rejects.toThrow(
        "Input must be a file path or Buffer"
      );
    });

    it("should respect binarize option", async () => {
      // 测试启用二值化
      const withBinarize = await preprocessor.preprocess(testImagePath, {
        binarize: true,
      });
      // 测试禁用二值化
      const withoutBinarize = await preprocessor.preprocess(testImagePath, {
        binarize: false,
      });

      // 两者应该都是有效的 buffer
      expect(Buffer.isBuffer(withBinarize)).toBe(true);
      expect(Buffer.isBuffer(withoutBinarize)).toBe(true);
    });

    it("should respect grayscale option", async () => {
      // 测试启用灰度
      const withGrayscale = await preprocessor.preprocess(testImagePath, {
        grayscale: true,
      });
      // 测试禁用灰度
      const withoutGrayscale = await preprocessor.preprocess(testImagePath, {
        grayscale: false,
      });

      // 两者应该都是有效的 buffer
      expect(Buffer.isBuffer(withGrayscale)).toBe(true);
      expect(Buffer.isBuffer(withoutGrayscale)).toBe(true);
    });

    it("should apply normalize and sharpen by default", async () => {
      const result = await preprocessor.preprocess(testImagePath);
      // 结果应该是有效的 buffer
      expect(Buffer.isBuffer(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe("preprocessToFile", () => {
    it("should save preprocessed image to temp file", async () => {
      const tempPath = await preprocessor.preprocessToFile(testImagePath);
      tempFiles.push(tempPath);

      expect(fs.existsSync(tempPath)).toBe(true);
      expect(tempPath).toContain("ocr_preprocessed_");
      expect(tempPath).toMatch(/\.png$/);
    });
  });

  describe("cleanupTempFile", () => {
    it("should delete temp file", async () => {
      const tempPath = await preprocessor.preprocessToFile(testImagePath);
      expect(fs.existsSync(tempPath)).toBe(true);

      preprocessor.cleanupTempFile(tempPath);
      expect(fs.existsSync(tempPath)).toBe(false);
    });

    it("should not throw for non-existent file", () => {
      expect(() => {
        preprocessor.cleanupTempFile("/non/existent/file.png");
      }).not.toThrow();
    });
  });

  describe("getImageInfo", () => {
    it("should return image metadata", async () => {
      const info = await preprocessor.getImageInfo(testImagePath);

      // MINIMAL_PNG 是 1x1 像素的图像
      expect(info.width).toBe(1);
      expect(info.height).toBe(1);
      expect(info.format).toBe("png");
      expect(info.channels).toBeDefined();
    });
  });

  describe("analyzeImage", () => {
    it("should analyze image and return features and strategy", async () => {
      const result = await preprocessor.analyzeImage(testImagePath);

      expect(result).toHaveProperty("features");
      expect(result).toHaveProperty("strategy");
      expect(result.strategy).toHaveProperty("shouldPreprocess");
      expect(result.strategy).toHaveProperty("shouldBinarize");
      expect(result.strategy).toHaveProperty("reason");
    });

    it("should accept Buffer input", async () => {
      const result = await preprocessor.analyzeImage(MINIMAL_PNG);

      expect(result).toHaveProperty("features");
      expect(result).toHaveProperty("strategy");
    });

    it("should return default strategy on error", async () => {
      const result = await preprocessor.analyzeImage("/non/existent/file.png");

      expect(result.features).toBeNull();
      expect(result.strategy.shouldPreprocess).toBe(true);
      expect(result.strategy.shouldBinarize).toBe(true);
      expect(result.strategy.reason).toContain("Analysis failed");
    });

    it("should extract image features correctly", async () => {
      const result = await preprocessor.analyzeImage(testImagePath);

      expect(result.features).toHaveProperty("width");
      expect(result.features).toHaveProperty("height");
      expect(result.features).toHaveProperty("totalPixels");
      expect(result.features).toHaveProperty("imageType");
      expect(result.features).toHaveProperty("qualityLevel");
      expect(result.features).toHaveProperty("avgStdDev");
      expect(result.features).toHaveProperty("avgMean");
    });

    it("should infer strategy based on features", async () => {
      const result = await preprocessor.analyzeImage(testImagePath);

      // 策略应该是有效的布尔值
      expect(typeof result.strategy.shouldPreprocess).toBe("boolean");
      expect(typeof result.strategy.shouldBinarize).toBe("boolean");
      expect(typeof result.strategy.reason).toBe("string");
      expect(result.strategy.reason.length).toBeGreaterThan(0);
    });
  });
});

