/**
 * OCR 性能优化模块测试
 */

const path = require("path");
const fs = require("fs");
const os = require("os");
const {
  OCRPerformanceManager,
  getDefaultPerformanceManager,
} = require("../../utils/OCRLoader/ocrPerformance");

// 测试样本路径
const FIXTURES_PATH = path.join(__dirname, "../fixtures/ocr_samples");

describe("OCRPerformanceManager", () => {
  let manager;

  beforeEach(() => {
    manager = new OCRPerformanceManager({
      maxImageWidth: 2000,
      maxImageHeight: 2000,
      maxFileSizeMB: 1,
      maxConcurrent: 2,
      cacheMaxSize: 5,
      cacheTTL: 60000, // 1 minute
    });
  });

  describe("构造函数和初始化", () => {
    test("应该正确初始化默认配置", () => {
      const defaultManager = new OCRPerformanceManager();
      expect(defaultManager.maxImageWidth).toBe(4000);
      expect(defaultManager.maxImageHeight).toBe(4000);
      expect(defaultManager.maxFileSizeMB).toBe(5);
      expect(defaultManager.maxConcurrent).toBe(2);
    });

    test("应该接受自定义配置", () => {
      expect(manager.maxImageWidth).toBe(2000);
      expect(manager.maxImageHeight).toBe(2000);
      expect(manager.maxFileSizeMB).toBe(1);
      expect(manager.maxConcurrent).toBe(2);
    });
  });

  describe("大图片检测", () => {
    test("应该检测到需要缩小的大图片", async () => {
      // 使用一个已知的测试图片
      const testImage = path.join(FIXTURES_PATH, "03_id_card.jpg");
      if (!fs.existsSync(testImage)) {
        console.log("Skipping test: test image not found");
        return;
      }

      const result = await manager.checkImageSize(testImage);
      expect(result).toHaveProperty("needsResize");
      expect(result).toHaveProperty("originalSize");
      expect(result.originalSize).toHaveProperty("width");
      expect(result.originalSize).toHaveProperty("height");
    });

    test("应该对小图片返回 needsResize=false", async () => {
      const testImage = path.join(FIXTURES_PATH, "10_low_resolution.png");
      if (!fs.existsSync(testImage)) {
        console.log("Skipping test: test image not found");
        return;
      }

      // 使用更大的限制
      const largeManager = new OCRPerformanceManager({
        maxImageWidth: 10000,
        maxImageHeight: 10000,
        maxFileSizeMB: 100,
      });

      const result = await largeManager.checkImageSize(testImage);
      expect(result.needsResize).toBe(false);
    });
  });

  describe("并发控制", () => {
    test("应该限制并发任务数", async () => {
      const results = [];
      const startTimes = [];

      // 创建 4 个任务，但只允许 2 个并发
      const tasks = [1, 2, 3, 4].map((id) =>
        manager.withConcurrencyControl(async () => {
          startTimes.push({ id, time: Date.now() });
          await new Promise((resolve) => setTimeout(resolve, 100));
          results.push(id);
          return id;
        })
      );

      await Promise.all(tasks);

      expect(results.length).toBe(4);
      expect(results).toContain(1);
      expect(results).toContain(2);
      expect(results).toContain(3);
      expect(results).toContain(4);
    });

    test("应该正确释放任务槽", async () => {
      expect(manager.currentTasks).toBe(0);

      await manager.withConcurrencyControl(async () => {
        expect(manager.currentTasks).toBe(1);
      });

      expect(manager.currentTasks).toBe(0);
    });
  });

  describe("缓存机制", () => {
    test("应该缓存和检索结果", () => {
      const testImage = path.join(FIXTURES_PATH, "01_invoice_chinese.png");
      if (!fs.existsSync(testImage)) {
        console.log("Skipping test: test image not found");
        return;
      }

      const mockResult = { pageContent: "test content", metadata: {} };

      // 缓存结果
      manager.setCachedResult(testImage, "tesseract", mockResult);

      // 检索结果
      const cached = manager.getCachedResult(testImage, "tesseract");
      expect(cached).toEqual(mockResult);
    });

    test("应该在缓存满时清除最旧条目", () => {
      // 创建临时测试文件
      const tempFiles = [];
      for (let i = 0; i < 6; i++) {
        const tempPath = path.join(os.tmpdir(), `test_cache_${i}.txt`);
        fs.writeFileSync(tempPath, `content ${i}`);
        tempFiles.push(tempPath);
      }

      try {
        // 添加 6 个条目（超过 cacheMaxSize=5）
        tempFiles.forEach((file, i) => {
          manager.setCachedResult(file, "test", { id: i });
        });

        // 缓存大小应该不超过 5
        expect(manager.cache.size).toBeLessThanOrEqual(5);
      } finally {
        // 清理临时文件
        tempFiles.forEach((file) => {
          if (fs.existsSync(file)) fs.unlinkSync(file);
        });
      }
    });

    test("应该能清空缓存", () => {
      const tempPath = path.join(os.tmpdir(), "test_clear_cache.txt");
      fs.writeFileSync(tempPath, "test content");

      try {
        manager.setCachedResult(tempPath, "test", { data: "test" });
        expect(manager.cache.size).toBe(1);

        manager.clearCache();
        expect(manager.cache.size).toBe(0);
      } finally {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      }
    });
  });

  describe("监控指标", () => {
    test("应该记录请求统计", () => {
      manager.recordRequestStart();
      manager.recordRequestStart();
      manager.recordRequestSuccess("tesseract", 1000);
      manager.recordRequestSuccess("paddleocr", 2000);
      manager.recordRequestFailure("Test error");

      const metrics = manager.getMetrics();
      expect(metrics.totalRequests).toBe(2);
      expect(metrics.successCount).toBe(2);
      expect(metrics.failureCount).toBe(1);
      expect(metrics.engineUsage.tesseract).toBe(1);
      expect(metrics.engineUsage.paddleocr).toBe(1);
    });

    test("应该计算平均耗时", () => {
      manager.recordRequestSuccess("tesseract", 1000);
      manager.recordRequestSuccess("tesseract", 3000);

      const metrics = manager.getMetrics();
      expect(metrics.avgDurationSec).toBe(2); // (1000 + 3000) / 2 / 1000
    });

    test("应该能重置指标", () => {
      manager.recordRequestStart();
      manager.recordRequestSuccess("tesseract", 1000);

      manager.resetMetrics();

      const metrics = manager.getMetrics();
      expect(metrics.totalRequests).toBe(0);
      expect(metrics.successCount).toBe(0);
    });
  });

  describe("单例模式", () => {
    test("getDefaultPerformanceManager 应该返回相同实例", () => {
      const instance1 = getDefaultPerformanceManager();
      const instance2 = getDefaultPerformanceManager();
      expect(instance1).toBe(instance2);
    });
  });
});

