/**
 * @file OCR 性能优化模块
 * @description 提供大图片预处理、并发控制、结果缓存和监控指标
 * @module collector/utils/OCRLoader/ocrPerformance
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// 延迟加载 sharp
let sharpModule = null;
function getSharp() {
  if (!sharpModule) {
    sharpModule = require("sharp");
  }
  return sharpModule;
}

/**
 * OCR 性能管理器
 * 提供图片优化、并发控制、缓存和监控功能
 */
class OCRPerformanceManager {
  /**
   * @param {Object} options - 配置选项
   * @param {number} [options.maxImageWidth=4000] - 最大图片宽度（超过则缩小）
   * @param {number} [options.maxImageHeight=4000] - 最大图片高度
   * @param {number} [options.maxFileSizeMB=5] - 最大文件大小（MB）
   * @param {number} [options.maxConcurrent=2] - 最大并发 OCR 任务数
   * @param {number} [options.cacheMaxSize=100] - 缓存最大条目数
   * @param {number} [options.cacheTTL=3600000] - 缓存过期时间（毫秒，默认1小时）
   */
  constructor(options = {}) {
    // 大图片处理配置
    this.maxImageWidth = options.maxImageWidth ?? 4000;
    this.maxImageHeight = options.maxImageHeight ?? 4000;
    this.maxFileSizeMB = options.maxFileSizeMB ?? 5;

    // 并发控制
    this.maxConcurrent = options.maxConcurrent ?? 2;
    this.currentTasks = 0;
    this.taskQueue = [];

    // 缓存配置
    this.cacheMaxSize = options.cacheMaxSize ?? 100;
    this.cacheTTL = options.cacheTTL ?? 3600000; // 1 hour
    this.cache = new Map();

    // 监控指标
    this.metrics = {
      totalRequests: 0,
      successCount: 0,
      failureCount: 0,
      cacheHits: 0,
      cacheMisses: 0,
      resizedImages: 0,
      totalDuration: 0,
      engineUsage: {
        tesseract: 0,
        paddleocr: 0,
      },
      errors: [],
    };
  }

  /**
   * 日志输出
   * @private
   */
  log(text, ...args) {
    console.log(`\x1b[36m[OCRPerf]\x1b[0m ${text}`, ...args);
  }

  // ==================== 大图片处理 ====================

  /**
   * 检查图片是否需要缩小
   * @param {string} filePath - 图片文件路径
   * @returns {Promise<{needsResize: boolean, reason: string, originalSize: Object}>}
   */
  async checkImageSize(filePath) {
    const sharp = getSharp();
    const stats = fs.statSync(filePath);
    const fileSizeMB = stats.size / (1024 * 1024);

    const metadata = await sharp(filePath).metadata();
    const { width, height } = metadata;

    const result = {
      needsResize: false,
      reason: "",
      originalSize: { width, height, fileSizeMB },
    };

    if (fileSizeMB > this.maxFileSizeMB) {
      result.needsResize = true;
      result.reason = `File size ${fileSizeMB.toFixed(1)}MB exceeds ${
        this.maxFileSizeMB
      }MB limit`;
    } else if (width > this.maxImageWidth) {
      result.needsResize = true;
      result.reason = `Width ${width}px exceeds ${this.maxImageWidth}px limit`;
    } else if (height > this.maxImageHeight) {
      result.needsResize = true;
      result.reason = `Height ${height}px exceeds ${this.maxImageHeight}px limit`;
    }

    return result;
  }

  /**
   * 缩小大图片以优化 OCR 性能
   * @param {string} filePath - 原始图片路径
   * @param {Object} [options] - 缩放选项
   * @returns {Promise<{resized: boolean, outputPath: string, originalSize: Object, newSize: Object}>}
   */
  async resizeIfNeeded(filePath, _options = {}) {
    const check = await this.checkImageSize(filePath);

    if (!check.needsResize) {
      return {
        resized: false,
        outputPath: filePath,
        originalSize: check.originalSize,
        newSize: check.originalSize,
      };
    }

    this.log(`Resizing image: ${check.reason}`);
    const sharp = getSharp();

    // 计算目标尺寸（保持宽高比）
    const { width, height } = check.originalSize;
    const scaleW = this.maxImageWidth / width;
    const scaleH = this.maxImageHeight / height;
    const scale = Math.min(scaleW, scaleH, 1);

    const newWidth = Math.round(width * scale);
    const newHeight = Math.round(height * scale);

    // 生成临时文件路径
    const ext = path.extname(filePath);
    const tempPath = path.join(
      require("os").tmpdir(),
      `ocr_resized_${Date.now()}_${Math.random().toString(36).slice(2)}${
        ext || ".png"
      }`
    );

    // 执行缩放
    await sharp(filePath)
      .resize(newWidth, newHeight, { fit: "inside" })
      .toFile(tempPath);

    this.metrics.resizedImages++;
    this.log(`Resized ${width}x${height} → ${newWidth}x${newHeight}`);

    return {
      resized: true,
      outputPath: tempPath,
      originalSize: check.originalSize,
      newSize: { width: newWidth, height: newHeight },
    };
  }

  /**
   * 清理缩放后的临时文件
   * @param {string} filePath - 临时文件路径
   */
  cleanupResizedFile(filePath) {
    try {
      if (
        filePath &&
        filePath.includes("ocr_resized_") &&
        fs.existsSync(filePath)
      ) {
        fs.unlinkSync(filePath);
        this.log(`Cleaned up resized file: ${path.basename(filePath)}`);
      }
    } catch (error) {
      this.log(`Warning: Failed to cleanup: ${error.message}`);
    }
  }

  // ==================== 并发控制 ====================

  /**
   * 获取任务执行许可（并发控制）
   * @returns {Promise<void>}
   */
  async acquireSlot() {
    return new Promise((resolve) => {
      if (this.currentTasks < this.maxConcurrent) {
        this.currentTasks++;
        resolve();
      } else {
        this.taskQueue.push(resolve);
        this.log(
          `Task queued (${this.taskQueue.length} waiting, ${this.currentTasks} running)`
        );
      }
    });
  }

  /**
   * 释放任务执行许可
   */
  releaseSlot() {
    this.currentTasks--;
    if (this.taskQueue.length > 0) {
      const next = this.taskQueue.shift();
      this.currentTasks++;
      next();
    }
  }

  /**
   * 带并发控制的任务执行
   * @param {Function} task - 异步任务函数
   * @returns {Promise<any>}
   */
  async withConcurrencyControl(task) {
    await this.acquireSlot();
    try {
      return await task();
    } finally {
      this.releaseSlot();
    }
  }

  // ==================== 缓存机制 ====================

  /**
   * 计算文件内容哈希（用于缓存键）
   * @param {string} filePath - 文件路径
   * @returns {string} MD5 哈希值
   */
  getFileHash(filePath) {
    const content = fs.readFileSync(filePath);
    return crypto.createHash("md5").update(content).digest("hex");
  }

  /**
   * 从缓存获取 OCR 结果
   * @param {string} filePath - 文件路径
   * @param {string} engine - OCR 引擎名称
   * @returns {Object|null} 缓存的结果或 null
   */
  getCachedResult(filePath, engine = "any") {
    const hash = this.getFileHash(filePath);
    const cacheKey = `${hash}_${engine}`;

    const cached = this.cache.get(cacheKey);
    if (cached) {
      // 检查是否过期
      if (Date.now() - cached.timestamp < this.cacheTTL) {
        this.metrics.cacheHits++;
        this.log(`Cache HIT for ${path.basename(filePath)} (${engine})`);
        return cached.result;
      } else {
        // 已过期，删除
        this.cache.delete(cacheKey);
      }
    }

    this.metrics.cacheMisses++;
    return null;
  }

  /**
   * 将 OCR 结果存入缓存
   * @param {string} filePath - 文件路径
   * @param {string} engine - OCR 引擎名称
   * @param {Object} result - OCR 结果
   */
  setCachedResult(filePath, engine, result) {
    const hash = this.getFileHash(filePath);
    const cacheKey = `${hash}_${engine}`;

    // 检查缓存大小，必要时清理
    if (this.cache.size >= this.cacheMaxSize) {
      this._evictOldestCache();
    }

    this.cache.set(cacheKey, {
      result,
      timestamp: Date.now(),
      filePath: path.basename(filePath),
    });

    this.log(`Cached result for ${path.basename(filePath)} (${engine})`);
  }

  /**
   * 清除最旧的缓存条目
   * @private
   */
  _evictOldestCache() {
    let oldest = null;
    let oldestKey = null;

    for (const [key, value] of this.cache.entries()) {
      if (!oldest || value.timestamp < oldest.timestamp) {
        oldest = value;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.log(`Evicted oldest cache entry: ${oldest.filePath}`);
    }
  }

  /**
   * 清空所有缓存
   */
  clearCache() {
    const size = this.cache.size;
    this.cache.clear();
    this.log(`Cleared ${size} cache entries`);
  }

  // ==================== 监控指标 ====================

  /**
   * 记录 OCR 请求开始
   */
  recordRequestStart() {
    this.metrics.totalRequests++;
  }

  /**
   * 记录 OCR 请求成功
   * @param {string} engine - 使用的引擎
   * @param {number} duration - 耗时（毫秒）
   */
  recordRequestSuccess(engine, duration) {
    this.metrics.successCount++;
    this.metrics.totalDuration += duration;
    if (this.metrics.engineUsage[engine] !== undefined) {
      this.metrics.engineUsage[engine]++;
    }
  }

  /**
   * 记录 OCR 请求失败
   * @param {string} error - 错误信息
   */
  recordRequestFailure(error) {
    this.metrics.failureCount++;
    this.metrics.errors.push({
      timestamp: new Date().toISOString(),
      error: error.substring(0, 200), // 限制错误信息长度
    });
    // 只保留最近 50 条错误
    if (this.metrics.errors.length > 50) {
      this.metrics.errors.shift();
    }
  }

  /**
   * 获取监控指标摘要
   * @returns {Object} 指标摘要
   */
  getMetrics() {
    const avgDuration =
      this.metrics.successCount > 0
        ? (
            this.metrics.totalDuration /
            this.metrics.successCount /
            1000
          ).toFixed(2)
        : 0;

    const successRate =
      this.metrics.totalRequests > 0
        ? (
            (this.metrics.successCount / this.metrics.totalRequests) *
            100
          ).toFixed(1)
        : 0;

    const cacheHitRate =
      this.metrics.cacheHits + this.metrics.cacheMisses > 0
        ? (
            (this.metrics.cacheHits /
              (this.metrics.cacheHits + this.metrics.cacheMisses)) *
            100
          ).toFixed(1)
        : 0;

    return {
      totalRequests: this.metrics.totalRequests,
      successCount: this.metrics.successCount,
      failureCount: this.metrics.failureCount,
      successRate: `${successRate}%`,
      avgDurationSec: parseFloat(avgDuration),
      cacheHits: this.metrics.cacheHits,
      cacheMisses: this.metrics.cacheMisses,
      cacheHitRate: `${cacheHitRate}%`,
      cacheSize: this.cache.size,
      resizedImages: this.metrics.resizedImages,
      engineUsage: { ...this.metrics.engineUsage },
      currentConcurrent: this.currentTasks,
      queuedTasks: this.taskQueue.length,
      recentErrors: this.metrics.errors.slice(-5),
    };
  }

  /**
   * 重置所有指标
   */
  resetMetrics() {
    this.metrics = {
      totalRequests: 0,
      successCount: 0,
      failureCount: 0,
      cacheHits: 0,
      cacheMisses: 0,
      resizedImages: 0,
      totalDuration: 0,
      engineUsage: { tesseract: 0, paddleocr: 0 },
      errors: [],
    };
    this.log("Metrics reset");
  }
}

// 单例实例（可选）
let defaultInstance = null;

/**
 * 获取默认的性能管理器实例
 * @returns {OCRPerformanceManager}
 */
function getDefaultPerformanceManager() {
  if (!defaultInstance) {
    defaultInstance = new OCRPerformanceManager();
  }
  return defaultInstance;
}

module.exports = {
  OCRPerformanceManager,
  getDefaultPerformanceManager,
};
