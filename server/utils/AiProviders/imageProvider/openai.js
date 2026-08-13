/**
 * OpenAI Image Provider - DALL-E 图像生成
 *
 * 支持：
 * - DALL-E 3: 1024x1024, 1792x1024, 1024x1792
 * - DALL-E 2: 256x256, 512x512, 1024x1024 (支持 variations)
 *
 * API 文档：https://platform.openai.com/docs/api-reference/images
 */

const { BaseImageProvider } = require("./base");

class OpenAIImageProvider extends BaseImageProvider {
  constructor() {
    super();
    this.name = "openai";
    this.displayName = "OpenAI DALL-E";

    // 初始化 OpenAI 客户端
    const { OpenAI } = require("openai");
    this.client = new OpenAI({
      apiKey: process.env.OPEN_AI_KEY,
    });

    // 能力声明
    this.capabilities = {
      t2i: true, // text-to-image (DALL-E 3)
      i2i: false, // DALL-E 不支持 image-to-image
      inpaint: true, // DALL-E 2 支持 edit（inpaint）
      outpaint: false, // 不直接支持
      removeBackground: false,
      upscale: false,
    };

    // 支持的模型
    this.supportedModels = [
      { id: "dall-e-3", name: "DALL-E 3", default: true },
      { id: "dall-e-2", name: "DALL-E 2" },
    ];

    // 模型尺寸限制
    this.sizeConstraints = {
      "dall-e-3": ["1024x1024", "1792x1024", "1024x1792"],
      "dall-e-2": ["256x256", "512x512", "1024x1024"],
    };
  }

  /**
   * 检查 Provider 是否可用
   * @returns {boolean}
   */
  static isAvailable() {
    return !!process.env.OPEN_AI_KEY;
  }

  /**
   * 健康检查
   * @returns {Promise<boolean>}
   */
  async isAvailable() {
    if (!process.env.OPEN_AI_KEY) return false;
    try {
      // 简单检查 API 密钥是否有效
      await this.client.models.list();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 获取有效的尺寸
   * @param {number} width
   * @param {number} height
   * @param {string} model
   * @returns {string}
   */
  #getValidSize(width, height, model = "dall-e-3") {
    const sizes =
      this.sizeConstraints[model] || this.sizeConstraints["dall-e-3"];

    // 尝试匹配请求的尺寸
    const requestedSize = `${width}x${height}`;
    if (sizes.includes(requestedSize)) {
      return requestedSize;
    }

    // 默认返回第一个可用尺寸（通常是 1024x1024）
    return sizes[0];
  }

  /**
   * 文生图
   * @param {Object} request - 生成请求
   * @param {Object} options - 选项
   * @returns {Promise<Object>}
   */
  async generate(request, options = {}) {
    const {
      prompt,
      width = 1024,
      height = 1024,
      quality = "standard", // standard | hd (仅 DALL-E 3)
      style = "vivid", // vivid | natural (仅 DALL-E 3)
      n = 1,
    } = request;

    const model = options.model || "dall-e-3";
    const size = this.#getValidSize(width, height, model);

    try {
      this.log(`Generating image with ${model}, size: ${size}`);

      const params = {
        model,
        prompt,
        n,
        size,
        response_format: "url", // url | b64_json
      };

      // DALL-E 3 特有参数
      if (model === "dall-e-3") {
        params.quality = quality;
        params.style = style;
      }

      const response = await this.client.images.generate(params);

      const image = response.data[0];
      return {
        success: true,
        imageUrl: image.url,
        revisedPrompt: image.revised_prompt,
        metadata: {
          model,
          size,
          quality: model === "dall-e-3" ? quality : undefined,
          style: model === "dall-e-3" ? style : undefined,
        },
      };
    } catch (error) {
      this.log(`Error generating image: ${error.message}`);
      throw new Error(`OpenAI image generation failed: ${error.message}`);
    }
  }

  /**
   * 图像编辑（Inpaint）- 仅 DALL-E 2 支持
   * @param {Object} request - 编辑请求
   * @param {Object} options - 选项
   * @returns {Promise<Object>}
   */
  async inpaint(request, options = {}) {
    const { inputImage, mask, prompt, n = 1 } = request;

    // DALL-E 编辑 API 仅支持 DALL-E 2
    const model = "dall-e-2";
    const size = "1024x1024";

    try {
      this.log(`Inpainting image with ${model}`);

      // 转换图像格式
      const imageBuffer = await this.#toBuffer(inputImage);
      const maskBuffer = await this.#toBuffer(mask);

      const response = await this.client.images.edit({
        model,
        image: imageBuffer,
        mask: maskBuffer,
        prompt,
        n,
        size,
        response_format: "url",
      });

      const image = response.data[0];
      return {
        success: true,
        imageUrl: image.url,
        metadata: {
          model,
          size,
        },
      };
    } catch (error) {
      this.log(`Error inpainting image: ${error.message}`);
      throw new Error(`OpenAI image edit failed: ${error.message}`);
    }
  }

  /**
   * 转换为 Buffer
   * @param {Buffer|string} input - 输入（Buffer、base64、URL）
   * @returns {Promise<Buffer>}
   */
  async #toBuffer(input) {
    if (Buffer.isBuffer(input)) {
      return input;
    }

    // Base64 字符串
    if (typeof input === "string" && input.startsWith("data:")) {
      const base64Data = input.split(",")[1];
      return Buffer.from(base64Data, "base64");
    }

    // URL
    if (
      typeof input === "string" &&
      (input.startsWith("http://") || input.startsWith("https://"))
    ) {
      const response = await fetch(input);
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    }

    // 假设是 base64 字符串
    return Buffer.from(input, "base64");
  }

  /**
   * 日志输出
   * @param {string} text
   * @param  {...any} args
   */
  log(text, ...args) {
    console.log(`\x1b[36m[OpenAIImageProvider]\x1b[0m ${text}`, ...args);
  }
}

module.exports = { OpenAIImageProvider };
