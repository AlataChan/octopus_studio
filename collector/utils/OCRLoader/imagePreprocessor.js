/**
 * @file 图像预处理器 - 用于提升 OCR 识别准确率
 * @description 提供灰度化、对比度增强、锐化、二值化等图像预处理功能
 * @module collector/utils/OCRLoader/imagePreprocessor
 */

const fs = require("fs");
const path = require("path");

// 延迟加载 sharp（避免在不需要时加载）
let sharpModule = null;
function getSharp() {
  if (!sharpModule) {
    sharpModule = require("sharp");
  }
  return sharpModule;
}

/**
 * 图像预处理器类
 * 用于在 OCR 识别前对图像进行预处理，提升识别准确率
 */
class ImagePreprocessor {
  /**
   * @param {Object} options - 预处理器配置选项
   * @param {number} [options.threshold=128] - 二值化阈值（0-255），设为 0 则跳过二值化
   * @param {boolean} [options.enableBinarization=true] - 是否默认启用二值化
   * @param {number} [options.sharpenSigma=1] - 锐化强度（sigma 值）
   */
  constructor(options = {}) {
    this.threshold = options.threshold ?? 128;
    this.enableBinarization = options.enableBinarization ?? true;
    this.sharpenSigma = options.sharpenSigma ?? 1;
  }

  /**
   * 日志输出
   * @private
   */
  log(text, ...args) {
    console.log(`\x1b[35m[ImagePreprocessor]\x1b[0m ${text}`, ...args);
  }

  /**
   * 预处理图像以提升 OCR 准确率
   * @param {Buffer|string} input - 输入图像（Buffer 或文件路径）
   * @param {Object} [options] - 预处理选项
   * @param {boolean} [options.binarize] - 是否启用二值化（覆盖默认设置）
   * @param {boolean} [options.grayscale=true] - 是否转为灰度图
   * @param {boolean} [options.normalize=true] - 是否进行对比度增强
   * @param {boolean} [options.sharpen=true] - 是否锐化
   * @returns {Promise<Buffer>} 处理后的图像 Buffer
   */
  async preprocess(input, options = {}) {
    const sharp = getSharp();

    const {
      binarize = this.enableBinarization,
      grayscale = true,
      normalize = true,
      sharpen = true,
    } = options;

    try {
      // 读取输入
      let imageBuffer;
      if (typeof input === "string") {
        if (!fs.existsSync(input)) {
          throw new Error(`File not found: ${input}`);
        }
        imageBuffer = fs.readFileSync(input);
      } else if (Buffer.isBuffer(input)) {
        imageBuffer = input;
      } else {
        throw new Error("Input must be a file path or Buffer");
      }

      // 构建处理管道
      let pipeline = sharp(imageBuffer);

      // 1. 灰度化
      if (grayscale) {
        pipeline = pipeline.greyscale();
      }

      // 2. 对比度增强（归一化）
      if (normalize) {
        pipeline = pipeline.normalize();
      }

      // 3. 锐化
      if (sharpen) {
        pipeline = pipeline.sharpen({ sigma: this.sharpenSigma });
      }

      // 4. 二值化（可选）
      // Tesseract 对二值化图像识别效果通常更好
      if (binarize && this.threshold > 0) {
        pipeline = pipeline.threshold(this.threshold);
      }

      // 输出为 PNG 格式（无损）
      const result = await pipeline.png().toBuffer();

      this.log(
        `Preprocessed image: grayscale=${grayscale}, normalize=${normalize}, sharpen=${sharpen}, binarize=${binarize}`
      );

      return result;
    } catch (error) {
      this.log(`Error during preprocessing: ${error.message}`);
      throw error;
    }
  }

  /**
   * 保存预处理后的图像到临时文件
   * @param {Buffer|string} input - 输入图像
   * @param {Object} [options] - 预处理选项
   * @returns {Promise<string>} 临时文件路径
   */
  async preprocessToFile(input, options = {}) {
    const buffer = await this.preprocess(input, options);
    const tempPath = path.join(
      require("os").tmpdir(),
      `ocr_preprocessed_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2)}.png`
    );
    fs.writeFileSync(tempPath, buffer);
    this.log(`Saved preprocessed image to: ${tempPath}`);
    return tempPath;
  }

  /**
   * 清理临时文件
   * @param {string} filePath - 临时文件路径
   */
  cleanupTempFile(filePath) {
    try {
      if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        this.log(`Cleaned up temp file: ${filePath}`);
      }
    } catch (error) {
      this.log(`Warning: Failed to cleanup temp file: ${error.message}`);
    }
  }

  /**
   * 获取图像元信息
   * @param {Buffer|string} input - 输入图像
   * @returns {Promise<Object>} 图像元信息
   */
  async getImageInfo(input) {
    const sharp = getSharp();

    let imageBuffer;
    if (typeof input === "string") {
      imageBuffer = fs.readFileSync(input);
    } else {
      imageBuffer = input;
    }

    const metadata = await sharp(imageBuffer).metadata();
    return {
      width: metadata.width,
      height: metadata.height,
      format: metadata.format,
      channels: metadata.channels,
      hasAlpha: metadata.hasAlpha,
    };
  }

  /**
   * 分析图像特征，自动判断最佳预处理策略
   * @param {Buffer|string} input - 输入图像（Buffer 或文件路径）
   * @returns {Promise<Object>} 预处理建议
   */
  async analyzeImage(input) {
    const sharp = getSharp();

    try {
      let imageBuffer;
      if (typeof input === "string") {
        if (!fs.existsSync(input)) {
          throw new Error(`File not found: ${input}`);
        }
        imageBuffer = fs.readFileSync(input);
      } else if (Buffer.isBuffer(input)) {
        imageBuffer = input;
      } else {
        throw new Error("Input must be a file path or Buffer");
      }

      // 获取元数据和统计信息
      const image = sharp(imageBuffer);
      const metadata = await image.metadata();
      const stats = await image.stats();

      // 计算图像特征
      const features = this._extractFeatures(metadata, stats);

      // 根据特征推断预处理策略
      const strategy = this._inferStrategy(features);

      this.log(
        `Image analysis: ${features.imageType}, quality=${features.qualityLevel}, ` +
          `suggest preprocess=${strategy.shouldPreprocess}, binarize=${strategy.shouldBinarize}`
      );

      return {
        features,
        strategy,
      };
    } catch (error) {
      this.log(`Error during image analysis: ${error.message}`);
      // 分析失败时返回默认策略
      return {
        features: null,
        strategy: {
          shouldPreprocess: true,
          shouldBinarize: true,
          reason: "Analysis failed, using default strategy",
        },
      };
    }
  }

  /**
   * 提取图像特征
   * @private
   */
  _extractFeatures(metadata, stats) {
    const { width, height, density, channels, format } = metadata;

    // 1. 分辨率评估
    const totalPixels = width * height;
    const isHighRes = totalPixels > 4000000; // > 4MP
    const isLowRes = totalPixels < 500000; // < 0.5MP
    const dpi = density || 72;
    const isHighDpi = dpi >= 200;

    // 2. 色彩复杂度（基于各通道标准差）
    // 标准差低 = 色彩单一（可能是文档/手写）
    // 标准差高 = 色彩丰富（可能是照片/截图）
    const channelStats = stats.channels || [];
    const avgStdDev =
      channelStats.length > 0
        ? channelStats.reduce((sum, ch) => sum + (ch.stdev || 0), 0) /
          channelStats.length
        : 50;

    const isLowColorComplexity = avgStdDev < 40;
    const isHighColorComplexity = avgStdDev > 80;

    // 3. 亮度分析
    const avgMean =
      channelStats.length > 0
        ? channelStats.reduce((sum, ch) => sum + (ch.mean || 128), 0) /
          channelStats.length
        : 128;

    const isDark = avgMean < 80;
    const isBright = avgMean > 200;
    const isLowContrast = avgStdDev < 30;

    // 4. 图像类型推断
    let imageType = "unknown";
    if (isLowColorComplexity && !isHighColorComplexity) {
      imageType = "document"; // 文档/手写
    } else if (width < 1500 && height < 1500 && !isLowRes) {
      imageType = "screenshot"; // 截图
    } else if (isHighRes && isHighDpi) {
      imageType = "scan"; // 高质量扫描
    } else if (isHighColorComplexity) {
      imageType = "photo"; // 照片
    } else {
      imageType = "mixed"; // 混合类型
    }

    // 5. 质量等级
    let qualityLevel = "medium";
    if (isHighRes && isHighDpi && !isLowContrast) {
      qualityLevel = "high";
    } else if (isLowRes || isLowContrast) {
      qualityLevel = "low";
    }

    return {
      width,
      height,
      totalPixels,
      dpi,
      format,
      channels,
      avgStdDev: Math.round(avgStdDev * 10) / 10,
      avgMean: Math.round(avgMean * 10) / 10,
      isHighRes,
      isLowRes,
      isHighDpi,
      isLowColorComplexity,
      isHighColorComplexity,
      isDark,
      isBright,
      isLowContrast,
      imageType,
      qualityLevel,
    };
  }

  /**
   * 根据特征推断预处理策略
   * @private
   */
  _inferStrategy(features) {
    const {
      imageType,
      qualityLevel,
      isLowContrast,
      isDark,
      isBright,
      isLowColorComplexity,
    } = features;

    let shouldPreprocess = true;
    let shouldBinarize = true;
    let reason = "";

    // 策略规则
    if (qualityLevel === "high" && imageType === "scan") {
      // 高质量扫描件：不需要预处理
      shouldPreprocess = false;
      shouldBinarize = false;
      reason = "High quality scan detected, skip preprocessing";
    } else if (imageType === "document" || isLowColorComplexity) {
      // 文档/手写：需要预处理和二值化
      shouldPreprocess = true;
      shouldBinarize = true;
      reason = "Document/handwriting detected, full preprocessing";
    } else if (imageType === "screenshot") {
      // 截图：轻度预处理，不二值化（保留颜色信息可能有用）
      shouldPreprocess = true;
      shouldBinarize = false;
      reason = "Screenshot detected, preprocess without binarization";
    } else if (imageType === "photo") {
      // 照片：预处理但不二值化
      shouldPreprocess = true;
      shouldBinarize = false;
      reason = "Photo detected, preprocess without binarization";
    } else if (isLowContrast) {
      // 低对比度：需要预处理增强对比度
      shouldPreprocess = true;
      shouldBinarize = true;
      reason = "Low contrast detected, enhance with preprocessing";
    } else if (isDark || isBright) {
      // 过暗或过亮：需要归一化
      shouldPreprocess = true;
      shouldBinarize = false;
      reason = "Brightness issue detected, normalize only";
    } else {
      // 默认：预处理 + 二值化
      shouldPreprocess = true;
      shouldBinarize = true;
      reason = "Default strategy applied";
    }

    return {
      shouldPreprocess,
      shouldBinarize,
      reason,
    };
  }
}

module.exports = { ImagePreprocessor };
