/**
 * SmartOCRRouter 单元测试
 */

const path = require("path");
const { SmartOCRRouter } = require("../../utils/OCRLoader/smartOCRRouter");

// 测试样本路径
const FIXTURES_PATH = path.join(__dirname, "../fixtures/ocr_samples");

describe("SmartOCRRouter", () => {
  let router;

  beforeAll(() => {
    // 使用默认配置初始化
    router = new SmartOCRRouter({
      targetLanguages: "chi_sim,eng",
      defaultEngine: "tesseract",
    });

    // Lite mode: tesseract.js is an optional dependency. These tests focus on
    // routing logic, so we stub OCR execution to avoid requiring native OCR.
    router.tesseract.ocrImage = async (filePath) => ({
      pageContent: "DUMMY_OCR_TEXT",
      metadata: {
        source: filePath,
        confidence: 1,
        preprocessed: false,
      },
    });
  });

  describe("构造函数和初始化", () => {
    test("应该正确初始化默认配置", () => {
      expect(router).toBeDefined();
      expect(router.tesseract).toBeDefined();
      expect(router.paddle).toBeDefined();
      expect(router.defaultEngine).toBe("tesseract");
    });

    test("应该能获取引擎状态", async () => {
      // getEngineStatus() 会调用 checkPaddleOCR()，其内部会探测本地 PaddleOCR
      // 服务（可能需要网络请求）。这里仅验证返回结构，不依赖外部服务。
      const originalCheck = router.checkPaddleOCR;
      const originalStatus = { ...router.paddleStatus };

      router.checkPaddleOCR = async () => {
        router.paddleStatus = { available: false, modelsReady: false };
      };

      let status;
      try {
        status = await router.getEngineStatus();
      } finally {
        router.checkPaddleOCR = originalCheck;
        router.paddleStatus = originalStatus;
      }
      expect(status.tesseract).toBeDefined();
      expect(status.tesseract.available).toBe(true);
      expect(status.paddleocr).toBeDefined();
      expect(status.default).toBe("tesseract");
    });
  });

  describe("文档类型检测", () => {
    test("应该检测身份证", () => {
      expect(router.detectDocType("/path/to/id_card.jpg")).toBe("id_card");
      expect(router.detectDocType("/path/to/身份证.png")).toBe("id_card");
      expect(router.detectDocType("/path/to/identity.jpg")).toBe("id_card");
    });

    test("应该检测发票", () => {
      expect(router.detectDocType("/path/to/invoice.jpg")).toBe("invoice");
      expect(router.detectDocType("/path/to/发票.png")).toBe("invoice");
    });

    test("应该检测收据", () => {
      expect(router.detectDocType("/path/to/receipt.jpg")).toBe("receipt");
      expect(router.detectDocType("/path/to/收据.png")).toBe("receipt");
    });

    test("应该检测营业执照", () => {
      expect(router.detectDocType("/path/to/license.jpg")).toBe("license");
      expect(router.detectDocType("/path/to/营业执照.png")).toBe("license");
    });

    test("应该返回 general 对于未知类型", () => {
      expect(router.detectDocType("/path/to/IMG_1234.jpg")).toBe("general");
      expect(router.detectDocType("/path/to/document.png")).toBe("general");
    });
  });

  describe("Skill OCR 偏好", () => {
    test("应该返回 paddleocr 对于身份证识别 Skill", () => {
      expect(router.getSkillOCRPreference("builtin:id-card-recognition")).toBe("paddleocr");
    });

    test("应该返回 paddleocr 对于发票识别 Skill", () => {
      expect(router.getSkillOCRPreference("builtin:invoice-recognition")).toBe("paddleocr");
    });

    test("应该返回 tesseract 对于合同审核 Skill", () => {
      expect(router.getSkillOCRPreference("builtin:contract-review")).toBe("tesseract");
    });

    test("应该返回 null 对于未知 Skill", () => {
      expect(router.getSkillOCRPreference("unknown:skill")).toBeNull();
    });
  });

  describe("OCR 路由逻辑", () => {
    test("应该在 ocrAuto 中检测发票文件并使用 PaddleOCR", async () => {
      const testImage = path.join(FIXTURES_PATH, "01_invoice_chinese.png");

      // 确保 PaddleOCR 可用
      await router.checkPaddleOCR();

      if (router.paddleStatus.available && router.paddleStatus.modelsReady) {
        const result = await router.ocrAuto(testImage, {});
        expect(result).toBeDefined();
        expect(result.pageContent).toBeDefined();
        // 由于文件名包含 invoice，应该自动选择 PaddleOCR
        expect(result.metadata.engine).toBe("paddleocr");
      } else {
        // PaddleOCR 不可用时跳过此测试
        console.log("Skipping PaddleOCR test - service not available");
      }
    }, 120000);

    test("应该根据 preferEngine 使用指定引擎", async () => {
      const testImage = path.join(FIXTURES_PATH, "07_low_contrast.jpg");

      // 确保 PaddleOCR 可用
      await router.checkPaddleOCR();

      if (router.paddleStatus.available && router.paddleStatus.modelsReady) {
        const result = await router.ocrAuto(testImage, {
          preferEngine: "paddleocr",
        });
        expect(result.metadata.engine).toBe("paddleocr");
      } else {
        console.log("Skipping PaddleOCR test - service not available");
      }
    }, 120000);

    test("应该在 PaddleOCR 不可用时降级到 Tesseract", async () => {
      const testImage = path.join(FIXTURES_PATH, "07_low_contrast.jpg");

      // 清除缓存以确保测试不受之前结果影响
      router.clearCache();

      // 保存原始的 checkPaddleOCR 方法
      const originalCheck = router.checkPaddleOCR.bind(router);
      const originalStatus = { ...router.paddleStatus };

      // Mock checkPaddleOCR 使其始终返回不可用
      router.checkPaddleOCR = async () => {
        router.paddleStatus = { available: false, modelsReady: false };
      };
      router.paddleStatus = { available: false, modelsReady: false };

      const result = await router.ocrAuto(testImage, {
        skill: "builtin:invoice-recognition", // 这个 Skill 偏好 PaddleOCR
      });

      // 即使 Skill 偏好 PaddleOCR，也应该降级到 Tesseract
      expect(result.metadata.engine).toBe("tesseract");
      expect(result.metadata.fallback).toBe(true);

      // 恢复原始方法和状态
      router.checkPaddleOCR = originalCheck;
      router.paddleStatus = originalStatus;
    }, 120000);
  });
});
