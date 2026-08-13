/**
 * SmartOCR 路由器
 * 基于场景/Skill 的智能 OCR 引擎选择，支持自动降级
 *
 * 路由优先级：Skill 配置 > Workspace 配置 > 文件名启发式 > 默认引擎
 *
 * @module SmartOCRRouter
 */

const OCRLoader = require("./index");
const { PaddleOCRClient } = require("./paddleOCRClient");
const { OCRPerformanceManager } = require("./ocrPerformance");
const { isLightweightMode } = require("../featureDetection");

/**
 * SmartOCR 路由器类
 * 智能选择最合适的 OCR 引擎，支持性能优化
 */
class SmartOCRRouter {
  /**
   * 创建 SmartOCR 路由器实例
   * @param {Object} [options={}] - 配置选项
   * @param {string} [options.targetLanguages='chi_sim,eng'] - Tesseract 目标语言
   * @param {string} [options.paddleOCRURL='http://127.0.0.1:8866'] - PaddleOCR 服务地址
   * @param {string} [options.defaultEngine='tesseract'] - 默认 OCR 引擎
   * @param {boolean} [options.enableCache=true] - 是否启用结果缓存
   * @param {boolean} [options.enableResize=true] - 是否自动缩小大图片
   * @param {number} [options.maxConcurrent=2] - 最大并发 OCR 任务数
   */
  constructor(options = {}) {
    const {
      targetLanguages = "chi_sim,eng",
      paddleOCRURL = "http://127.0.0.1:8866",
      defaultEngine = "tesseract",
      enableCache = true,
      enableResize = true,
      maxConcurrent = 2,
    } = options;

    // 初始化 Tesseract OCR
    this.tesseract = new OCRLoader({ targetLanguages });

    // 初始化 PaddleOCR 客户端
    this.paddle = new PaddleOCRClient(paddleOCRURL);

    // PaddleOCR 状态
    this.paddleStatus = { available: false, modelsReady: false };

    // 默认引擎
    this.defaultEngine = defaultEngine;

    // 性能优化配置
    this.enableCache = enableCache;
    this.enableResize = enableResize;

    // 初始化性能管理器
    this.perfManager = new OCRPerformanceManager({
      maxConcurrent,
      maxImageWidth: 4000,
      maxImageHeight: 4000,
      maxFileSizeMB: 5,
    });

    // 支持注册新引擎（预留扩展点）
    this.engines = {
      tesseract: this.tesseract,
      paddleocr: this.paddle,
      // deepseek: null,  // Phase 2+ 再加
    };

    // 检查 PaddleOCR 状态
    if (!isLightweightMode()) {
      this.checkPaddleOCR();
    } else {
      this.paddleStatus = { available: false, modelsReady: false };
    }
  }

  /**
   * 日志输出
   * @param {string} text - 日志文本
   * @param {...any} args - 附加参数
   */
  log(text, ...args) {
    console.log(`\x1b[35m[SmartOCR]\x1b[0m ${text}`, ...args);
  }

  /**
   * 检查 PaddleOCR 服务状态
   * @returns {Promise<void>}
   */
  async checkPaddleOCR() {
    try {
      this.paddleStatus = await this.paddle.isAvailable();

      if (this.paddleStatus.available) {
        if (this.paddleStatus.modelsReady) {
          this.log("✅ PaddleOCR service is ready");
        } else {
          this.log("⚠️ PaddleOCR service running, models not yet downloaded");
          this.log(
            "   First-time setup: download models via OCR settings page"
          );
        }
      } else {
        this.log(
          "ℹ️ PaddleOCR service not running (optional high-accuracy OCR)"
        );
      }
    } catch (error) {
      this.log(`Error checking PaddleOCR: ${error.message}`);
      this.paddleStatus = { available: false, modelsReady: false };
    }
  }

  /**
   * ⭐ 手动触发 PaddleOCR 模型下载
   * 用户明确需要高精度 OCR 时调用
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async setupPaddleOCR() {
    if (!this.paddleStatus.available) {
      // 重新检查一次
      await this.checkPaddleOCR();
      if (!this.paddleStatus.available) {
        throw new Error("PaddleOCR service not running. Start it first.");
      }
    }

    const result = await this.paddle.setupModels();
    if (result.success) {
      this.paddleStatus.modelsReady = true;
    }
    return result;
  }

  /**
   * 注册新的 OCR 引擎（预留扩展点）
   * @param {string} name - 引擎名称
   * @param {Object} client - 引擎客户端
   */
  registerEngine(name, client) {
    this.engines[name] = client;
    this.log(`Registered OCR engine: ${name}`);
  }

  /**
   * 获取当前可用的引擎列表
   * @returns {Promise<Object>} 引擎状态
   */
  async getEngineStatus() {
    // 刷新 PaddleOCR 状态
    await this.checkPaddleOCR();

    return {
      tesseract: { available: true, ready: true },
      paddleocr: {
        available: this.paddleStatus.available,
        ready: this.paddleStatus.modelsReady,
      },
      default: this.defaultEngine,
    };
  }

  /**
   * ⭐ 核心方法：基于场景/Skill 的智能 OCR 路由
   *
   * @param {string} filePath - 文件路径
   * @param {Object} [context={}] - 调用上下文
   * @param {string} [context.skill] - Skill ID（如 'builtin:id-card-recognition'）
   * @param {string} [context.assistant] - Assistant ID
   * @param {string} [context.workspace] - Workspace slug
   * @param {string} [context.documentTitle] - 文档标题
   * @param {string} [context.preferEngine] - 强制使用指定引擎
   * @returns {Promise<{pageContent: string, metadata: Object}>}
   */
  async ocrAuto(filePath, context = {}) {
    // 0. 如果指定了引擎，直接使用
    if (context.preferEngine) {
      return this.routeByEngine(filePath, context.preferEngine, context);
    }

    // 1. 优先级1：Skill 配置（从 Skill 定义或硬编码映射）
    if (context.skill) {
      const skillOCRPreference = this.getSkillOCRPreference(context.skill);
      if (skillOCRPreference) {
        this.log(
          `Skill [${context.skill}] prefers engine: ${skillOCRPreference}`
        );
        return this.routeByEngine(filePath, skillOCRPreference, context);
      }
    }

    // 2. 优先级2：Workspace 配置
    if (context.workspace) {
      const workspaceConfig = await this.getWorkspaceOCRConfig(
        context.workspace
      );
      if (workspaceConfig.preferHighAccuracy) {
        this.log(`Workspace [${context.workspace}] prefers high-accuracy OCR`);
        return this.routeByEngine(filePath, "paddleocr", context);
      }
    }

    // 3. 优先级3：文件名启发式（最后的 fallback）
    const docType = this.detectDocType(filePath, context.documentTitle);
    if (["id_card", "invoice", "receipt", "license"].includes(docType)) {
      this.log(`Document type [${docType}] detected, using PaddleOCR`);
      return this.routeByEngine(filePath, "paddleocr", context);
    }

    // 4. 默认引擎
    this.log(`Using default engine: ${this.defaultEngine}`);
    return this.routeByEngine(filePath, this.defaultEngine, context);
  }

  /**
   * 获取 Skill 的 OCR 偏好
   * Phase 0：硬编码映射
   * Phase 1+：从 Skill 定义的 ocrPreference 字段读取
   * @param {string} skillId - Skill ID
   * @returns {string|null} OCR 引擎名称
   */
  getSkillOCRPreference(skillId) {
    // Phase 0：硬编码映射
    const skillOCRMap = {
      // 需要高精度的场景 → PaddleOCR
      "builtin:id-card-recognition": "paddleocr",
      "builtin:invoice-recognition": "paddleocr",
      "builtin:receipt-recognition": "paddleocr",
      "builtin:license-recognition": "paddleocr",
      "builtin:form-extraction": "paddleocr",

      // 速度优先的场景 → Tesseract
      "builtin:contract-review": "tesseract",
      "builtin:document-search": "tesseract",
      "builtin:general-ocr": "tesseract",
    };

    return skillOCRMap[skillId] || null;
  }

  /**
   * 获取 Workspace 的 OCR 配置
   * @param {string} workspaceSlug - Workspace slug
   * @returns {Promise<Object>} Workspace OCR 配置
   */
  async getWorkspaceOCRConfig(_workspaceSlug) {
    // TODO Phase 1: 从数据库读取配置
    // const workspace = await prisma.workspaces.findFirst({ where: { slug: _workspaceSlug } });
    // return workspace?.ocrConfig || defaultConfig;

    // Phase 0：返回默认配置
    return {
      preferHighAccuracy: false,
      allowPaddleOCR: true,
      defaultEngine: "tesseract",
    };
  }

  /**
   * 文件名/标题启发式检测文档类型
   * @param {string} filePath - 文件路径
   * @param {string} [documentTitle] - 文档标题
   * @returns {string} 文档类型
   */
  detectDocType(filePath, documentTitle) {
    const text = `${filePath} ${documentTitle || ""}`.toLowerCase();

    // 身份证
    if (
      text.includes("id") ||
      text.includes("身份证") ||
      text.includes("idcard") ||
      text.includes("identity")
    ) {
      return "id_card";
    }

    // 发票
    if (
      text.includes("invoice") ||
      text.includes("发票") ||
      text.includes("fapiao")
    ) {
      return "invoice";
    }

    // 收据
    if (
      text.includes("receipt") ||
      text.includes("收据") ||
      text.includes("小票")
    ) {
      return "receipt";
    }

    // 营业执照
    if (
      text.includes("license") ||
      text.includes("营业执照") ||
      text.includes("许可证")
    ) {
      return "license";
    }

    // 合同
    if (
      text.includes("contract") ||
      text.includes("合同") ||
      text.includes("协议")
    ) {
      return "contract";
    }

    return "general";
  }

  /**
   * 按引擎路由（含降级逻辑 + 性能优化）
   * @param {string} filePath - 文件路径
   * @param {string} engineName - 引擎名称
   * @param {Object} context - 上下文
   * @returns {Promise<{pageContent: string, metadata: Object}>}
   */
  async routeByEngine(filePath, engineName, context) {
    const startTime = Date.now();
    this.perfManager.recordRequestStart();

    // 检查缓存
    if (this.enableCache) {
      const cached = this.perfManager.getCachedResult(filePath, engineName);
      if (cached) {
        return {
          ...cached,
          metadata: {
            ...cached.metadata,
            fromCache: true,
          },
        };
      }
    }

    // 大图片自动缩小
    let processPath = filePath;
    let resizeInfo = null;
    if (this.enableResize) {
      resizeInfo = await this.perfManager.resizeIfNeeded(filePath);
      processPath = resizeInfo.outputPath;
    }

    try {
      // 使用并发控制执行 OCR
      const result = await this.perfManager.withConcurrencyControl(async () => {
        return this._executeOCR(processPath, engineName, context, startTime);
      });

      // 记录成功
      const duration = Date.now() - startTime;
      this.perfManager.recordRequestSuccess(result.metadata.engine, duration);

      // 添加缩放信息到 metadata
      if (resizeInfo && resizeInfo.resized) {
        result.metadata.resized = true;
        result.metadata.originalSize = resizeInfo.originalSize;
        result.metadata.resizedTo = resizeInfo.newSize;
      }

      // 缓存结果
      if (this.enableCache) {
        this.perfManager.setCachedResult(
          filePath,
          result.metadata.engine,
          result
        );
      }

      return result;
    } catch (error) {
      this.perfManager.recordRequestFailure(error.message);
      throw error;
    } finally {
      // 清理临时缩放文件
      if (resizeInfo && resizeInfo.resized) {
        this.perfManager.cleanupResizedFile(resizeInfo.outputPath);
      }
    }
  }

  /**
   * 实际执行 OCR（内部方法）
   * @private
   */
  async _executeOCR(filePath, engineName, context, startTime) {
    // 尝试使用 PaddleOCR
    if (engineName === "paddleocr") {
      // 检查 PaddleOCR 是否可用
      if (!this.paddleStatus.available) {
        await this.checkPaddleOCR(); // 重新检查
      }

      if (!this.paddleStatus.available) {
        this.log("⚠️ PaddleOCR not available, falling back to Tesseract");
      } else if (!this.paddleStatus.modelsReady) {
        this.log("⚠️ PaddleOCR models not ready, falling back to Tesseract");
        this.log("   Call setupPaddleOCR() to download models");
      } else {
        try {
          this.log(`📸 Using PaddleOCR for ${context.skill || "general"}`);
          const result = await this.paddle.ocr(filePath);

          if (result.success) {
            return {
              pageContent: result.text,
              metadata: {
                source: filePath,
                engine: "paddleocr",
                skill: context.skill,
                workspace: context.workspace,
                lineCount: result.line_count,
                duration: result.duration,
                executionTime: (Date.now() - startTime) / 1000,
              },
            };
          }
        } catch (error) {
          this.log(`PaddleOCR failed: ${error.message}`);
          this.log("Falling back to Tesseract...");
        }
      }
    }

    // 使用 Tesseract（作为主引擎或降级引擎）
    this.log(`📝 Using Tesseract for ${context.skill || "general"}`);
    const result = await this.tesseract.ocrImage(filePath, {
      smartPreprocess: true,
    });

    if (!result) {
      throw new Error(`OCR failed for file: ${filePath}`);
    }

    // 合并 metadata
    result.metadata = {
      ...result.metadata,
      engine: "tesseract",
      skill: context.skill,
      workspace: context.workspace,
      fallback: engineName === "paddleocr", // 标记是否为降级
      executionTime: (Date.now() - startTime) / 1000,
    };

    return result;
  }

  /**
   * 直接使用 Tesseract OCR
   * @param {string} filePath - 文件路径
   * @param {Object} [options={}] - OCR 选项
   * @returns {Promise<{pageContent: string, metadata: Object}>}
   */
  async ocrWithTesseract(filePath, options = {}) {
    return this.tesseract.ocrImage(filePath, options);
  }

  /**
   * 直接使用 PaddleOCR
   * @param {string} filePath - 文件路径
   * @param {Object} [options={}] - OCR 选项
   * @returns {Promise<{pageContent: string, metadata: Object}>}
   */
  async ocrWithPaddleOCR(filePath, options = {}) {
    if (!this.paddleStatus.available || !this.paddleStatus.modelsReady) {
      throw new Error(
        "PaddleOCR not available. Check service status and call setupPaddleOCR()."
      );
    }

    const result = await this.paddle.ocr(filePath, options);
    return {
      pageContent: result.text,
      metadata: {
        source: filePath,
        engine: "paddleocr",
        lineCount: result.line_count,
        duration: result.duration,
      },
    };
  }

  /**
   * ⭐ OCR 布局提取 - 用于 Canvas 场景
   * 返回文本块及其坐标信息，可用于构建 SceneGraph 中的 TextElement
   *
   * @param {string} filePath - 图像文件路径
   * @param {Object} [options={}] - 选项
   * @param {string} [options.preferEngine='paddleocr'] - 首选引擎（布局提取推荐 PaddleOCR）
   * @returns {Promise<{success: boolean, text: string, blocks: Array<{text: string, confidence: number, bbox: {x: number, y: number, width: number, height: number}, polygon: Array<[number, number]>}>, metadata: Object}>}
   */
  async ocrWithLayout(filePath, options = {}) {
    const startTime = Date.now();
    const preferEngine = options.preferEngine || "paddleocr";

    this.log(`📐 OCR with layout extraction: ${filePath}`);

    // 刷新 PaddleOCR 状态
    if (!this.paddleStatus.available) {
      await this.checkPaddleOCR();
    }

    // 优先使用 PaddleOCR（布局提取更准确）
    if (
      preferEngine === "paddleocr" &&
      this.paddleStatus.available &&
      this.paddleStatus.modelsReady
    ) {
      try {
        const result = await this.paddle.ocrWithLayout(filePath, options);
        return {
          success: true,
          text: result.text,
          blocks: result.blocks,
          metadata: {
            source: filePath,
            engine: "paddleocr",
            lineCount: result.lineCount,
            blockCount: result.blocks.length,
            duration: result.duration,
            executionTime: (Date.now() - startTime) / 1000,
          },
        };
      } catch (error) {
        this.log(`PaddleOCR layout failed: ${error.message}, falling back...`);
      }
    }

    // Fallback: 使用 Tesseract（只能返回纯文本，无精确坐标）
    this.log("⚠️ Using Tesseract fallback (limited layout support)");
    const result = await this.tesseract.ocrImage(filePath, {
      smartPreprocess: true,
    });

    if (!result) {
      return {
        success: false,
        text: "",
        blocks: [],
        metadata: {
          source: filePath,
          engine: "tesseract",
          error: "OCR failed",
          executionTime: (Date.now() - startTime) / 1000,
        },
      };
    }

    // 将 Tesseract 结果转换为块格式（简化版，无精确坐标）
    const lines = result.pageContent.split("\n").filter((l) => l.trim());
    const blocks = lines.map((line, index) => ({
      text: line.trim(),
      confidence: 0.85, // Tesseract 默认置信度
      bbox: { x: 0, y: index * 30, width: 0, height: 30 }, // 占位坐标
      polygon: [],
    }));

    return {
      success: true,
      text: result.pageContent,
      blocks,
      metadata: {
        source: filePath,
        engine: "tesseract",
        fallback: true,
        lineCount: lines.length,
        blockCount: blocks.length,
        executionTime: (Date.now() - startTime) / 1000,
      },
    };
  }

  // ==================== 性能监控 API ====================

  /**
   * 获取性能监控指标
   * @returns {Object} 性能指标摘要
   */
  getPerformanceMetrics() {
    return this.perfManager.getMetrics();
  }

  /**
   * 重置性能指标
   */
  resetPerformanceMetrics() {
    this.perfManager.resetMetrics();
  }

  /**
   * 清空 OCR 结果缓存
   */
  clearCache() {
    this.perfManager.clearCache();
  }

  /**
   * 获取缓存统计信息
   * @returns {Object} 缓存统计
   */
  getCacheStats() {
    const metrics = this.perfManager.getMetrics();
    return {
      size: metrics.cacheSize,
      hits: metrics.cacheHits,
      misses: metrics.cacheMisses,
      hitRate: metrics.cacheHitRate,
    };
  }
}

module.exports = { SmartOCRRouter };
