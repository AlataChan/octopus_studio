/**
 * Zhipu Image Provider - 智谱 AI CogView 图像生成
 *
 * 支持模型：
 * - CogView-3-Plus: 高质量图像生成
 * - CogView-3: 标准图像生成
 *
 * API 文档：https://open.bigmodel.cn/dev/api#cogview
 */

const { BaseImageProvider } = require("./base");

class ZhipuImageProvider extends BaseImageProvider {
  constructor() {
    super();
    this.name = "zhipu";
    this.displayName = "智谱 CogView";
    this.baseUrl =
      process.env.ZHIPU_AI_API_BASE || "https://open.bigmodel.cn/api/paas/v4";
    this.apiKey = process.env.ZHIPU_AI_API_KEY;

    // 能力声明
    this.capabilities = {
      t2i: true, // text-to-image
      i2i: false, // 暂不支持
      inpaint: false,
      outpaint: false,
      removeBackground: false,
      upscale: false,
    };

    // 支持的模型
    this.supportedModels = [
      { id: "cogview-3-plus", name: "CogView-3-Plus (高质量)", default: true },
      { id: "cogview-3", name: "CogView-3 (标准)" },
    ];

    // 尺寸选项
    this.supportedSizes = [
      "1024x1024", // 默认
      "768x1344",
      "864x1152",
      "1344x768",
      "1152x864",
      "1440x720",
      "720x1440",
    ];
  }

  /**
   * 检查 Provider 是否可用
   * @returns {boolean}
   */
  static isAvailable() {
    return !!process.env.ZHIPU_AI_API_KEY;
  }

  /**
   * 健康检查
   * @returns {Promise<boolean>}
   */
  async isAvailable() {
    return !!this.apiKey;
  }

  /**
   * 获取最接近的支持尺寸
   * @param {number} width
   * @param {number} height
   * @returns {string}
   */
  #getClosestSize(width, height) {
    const requestedRatio = width / height;

    let closestSize = this.supportedSizes[0];
    let minDiff = Infinity;

    for (const size of this.supportedSizes) {
      const [w, h] = size.split("x").map(Number);
      const ratio = w / h;
      const diff = Math.abs(ratio - requestedRatio);

      if (diff < minDiff) {
        minDiff = diff;
        closestSize = size;
      }
    }

    return closestSize;
  }

  /**
   * 生成 JWT Token
   * @returns {string}
   */
  #generateToken() {
    // 智谱 API 使用 API Key 直接作为 Bearer Token
    // 如果需要 JWT，可以在这里实现
    return this.apiKey;
  }

  /**
   * 文生图
   * @param {Object} request - 生成请求
   * @param {Object} options - 选项
   * @returns {Promise<Object>}
   */
  async generate(request, options = {}) {
    const { prompt, width = 1024, height = 1024 } = request;

    const model = options.model || "cogview-3-plus";
    const size = this.#getClosestSize(width, height);

    try {
      this.log(`Generating image with ${model}, size: ${size}`);

      const body = {
        model,
        prompt,
        size,
      };

      const response = await fetch(`${this.baseUrl}/images/generations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.#generateToken()}`,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error?.message || `HTTP ${response.status}`);
      }

      const data = await response.json();
      const image = data.data?.[0];

      if (!image) {
        throw new Error("No image returned from API");
      }

      return {
        success: true,
        imageUrl: image.url,
        metadata: {
          model,
          size,
        },
      };
    } catch (error) {
      this.log(`Error generating image: ${error.message}`);
      throw new Error(`Zhipu image generation failed: ${error.message}`);
    }
  }

  /**
   * 日志输出
   * @param {string} text
   * @param  {...any} args
   */
  log(text, ...args) {
    console.log(`\x1b[36m[ZhipuImageProvider]\x1b[0m ${text}`, ...args);
  }
}

module.exports = { ZhipuImageProvider };
