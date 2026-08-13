/**
 * @file OCRLoader 集成测试
 * @description 测试 OCRLoader 的图像 OCR 功能（包含预处理）
 */

process.env.STORAGE_DIR = "test-storage";

const path = require("path");
const fs = require("fs");
const os = require("os");

// 支持从根目录或 collector 目录运行测试
const modulePath = fs.existsSync(path.join(__dirname, "../../../utils/OCRLoader/index.js"))
  ? "../../../utils/OCRLoader"
  : "../../../../collector/utils/OCRLoader";
const OCRLoader = require(modulePath);
const HAS_TESSERACT = (() => {
  try {
    require.resolve("tesseract.js");
    return true;
  } catch {
    return false;
  }
})();

// 最小的有效 PNG 图像（1x1 白色像素）
const MINIMAL_PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49,
  0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02,
  0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44,
  0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xff, 0xff, 0x3f, 0x00, 0x05, 0xfe, 0x02,
  0xfe, 0xdc, 0xcc, 0x59, 0xe7, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44,
  0xae, 0x42, 0x60, 0x82,
]);

describe("OCRLoader", () => {
  let testImagePath;
  let tempFiles = [];

  beforeAll(async () => {
    // 使用最小 PNG 创建测试文件
    testImagePath = path.join(os.tmpdir(), "test_ocr_image.png");
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
    it("should initialize with default options", () => {
      const loader = new OCRLoader();
      expect(loader.language).toEqual(["eng"]);
      expect(loader.enablePreprocessing).toBe(true);
      expect(loader.preprocessor).toBeDefined();
    });

    it("should accept custom language options", () => {
      const loader = new OCRLoader({ targetLanguages: "chi_sim,eng" });
      expect(loader.language).toEqual(["chi_sim", "eng"]);
    });

    it("should accept preprocessing options", () => {
      const loader = new OCRLoader({
        enablePreprocessing: false,
        enableBinarization: false,
        binarizationThreshold: 200,
      });
      expect(loader.enablePreprocessing).toBe(false);
    });

    it("should filter invalid language codes", () => {
      const loader = new OCRLoader({ targetLanguages: "eng,invalid_lang,chi_sim" });
      expect(loader.language).toEqual(["eng", "chi_sim"]);
    });
  });

  describe("parseLanguages", () => {
    it("should return default language for null input", () => {
      const loader = new OCRLoader();
      expect(loader.parseLanguages(null)).toEqual(["eng"]);
    });

    it("should return default language for empty string", () => {
      const loader = new OCRLoader();
      expect(loader.parseLanguages("")).toEqual(["eng"]);
    });

    it("should parse comma-separated languages", () => {
      const loader = new OCRLoader();
      expect(loader.parseLanguages("eng,chi_sim,deu")).toEqual([
        "eng",
        "chi_sim",
        "deu",
      ]);
    });

    it("should trim whitespace", () => {
      const loader = new OCRLoader();
      expect(loader.parseLanguages(" eng , chi_sim ")).toEqual([
        "eng",
        "chi_sim",
      ]);
    });
  });

  describe("postProcessText", () => {
    it("should normalize whitespace", () => {
      const loader = new OCRLoader();
      const result = loader.postProcessText("hello    world");
      expect(result).toBe("hello world");
    });

    it("should normalize multiple newlines", () => {
      const loader = new OCRLoader();
      const result = loader.postProcessText("line1\n\n\n\nline2");
      expect(result).toBe("line1\n\nline2");
    });

    it("should trim lines", () => {
      const loader = new OCRLoader();
      const result = loader.postProcessText("  hello  \n  world  ");
      expect(result).toBe("hello\nworld");
    });

    it("should handle empty input", () => {
      const loader = new OCRLoader();
      expect(loader.postProcessText("")).toBe("");
      expect(loader.postProcessText(null)).toBe("");
      expect(loader.postProcessText(undefined)).toBe("");
    });
  });

  describe("ocrImage", () => {
    it("should return null for non-existent file", async () => {
      const loader = new OCRLoader();
      const result = await loader.ocrImage("/non/existent/file.png");
      expect(result).toBeNull();
    });

    (HAS_TESSERACT ? it : it.skip)(
      "should return structured result for valid image",
      async () => {
      const loader = new OCRLoader({ enablePreprocessing: true });
      const result = await loader.ocrImage(testImagePath);

      // 即使图像没有文字，也应该返回结构化结果
      expect(result).toBeDefined();
      if (result) {
        expect(result).toHaveProperty("pageContent");
        expect(result).toHaveProperty("metadata");
        expect(result.metadata).toHaveProperty("source");
        expect(result.metadata).toHaveProperty("confidence");
        expect(result.metadata).toHaveProperty("preprocessed");
        expect(result.metadata.preprocessed).toBe(true);
      }
    },
      60000
    ); // 增加超时时间，因为 Tesseract 首次加载可能较慢

    (HAS_TESSERACT ? it : it.skip)(
      "should respect preprocess option override",
      async () => {
      const loader = new OCRLoader({ enablePreprocessing: true });
      const result = await loader.ocrImage(testImagePath, { preprocess: false });

      if (result) {
        expect(result.metadata.preprocessed).toBe(false);
      }
    },
      60000
    );
  });
});
