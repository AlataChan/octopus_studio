/**
 * SiliconFlow Image Provider - 国产图像生成服务
 *
 * 支持模型：
 * - Stable Diffusion XL
 * - FLUX.1-dev
 * - Kolors
 *
 * API 文档：https://docs.siliconflow.cn/api-reference/images/images-generations
 */

const { BaseImageProvider } = require("./base");

class SiliconFlowImageProvider extends BaseImageProvider {
  constructor() {
    super();
    this.name = "siliconflow";
    this.displayName = "SiliconFlow";
    this.baseUrl =
      process.env.SILICONFLOW_API_BASE || "https://api.siliconflow.cn/v1";
    this.apiKey = process.env.SILICONFLOW_API_KEY;

    // 能力声明
    this.capabilities = {
      t2i: true, // text-to-image
      i2i: true, // image-to-image
      inpaint: false, // 暂不支持
      outpaint: false, // 暂不支持
      removeBackground: false,
      upscale: false,
    };

    // 支持的模型
    this.supportedModels = [
      {
        id: "black-forest-labs/FLUX.1-schnell",
        name: "FLUX.1 Schnell (Fast)",
        default: true,
      },
      { id: "black-forest-labs/FLUX.1-dev", name: "FLUX.1 Dev (Quality)" },
      {
        id: "stabilityai/stable-diffusion-xl-base-1.0",
        name: "Stable Diffusion XL",
      },
      { id: "Kwai-Kolors/Kolors", name: "Kolors (可灵)" },
    ];

    // 尺寸约束
    this.sizeConstraints = {
      minWidth: 256,
      maxWidth: 2048,
      minHeight: 256,
      maxHeight: 2048,
      step: 64, // 必须是 64 的倍数
    };
  }

  /**
   * Best-effort extract an error message from a non-2xx response.
   * @param {Response} response
   * @returns {Promise<string>}
   */
  async #responseErrorMessage(response) {
    let bodyText = "";
    try {
      bodyText = await response.text();
    } catch {
      bodyText = "";
    }

    if (!bodyText) return response.statusText || "";

    try {
      const json = JSON.parse(bodyText);
      const message =
        json?.message ||
        json?.error?.message ||
        json?.error?.msg ||
        json?.msg ||
        json?.detail ||
        json?.error_description;
      return message || bodyText;
    } catch {
      return bodyText;
    }
  }

  /**
   * 检查 Provider 是否可用
   * @returns {boolean}
   */
  static isAvailable() {
    return !!process.env.SILICONFLOW_API_KEY;
  }

  /**
   * 健康检查
   * @returns {Promise<boolean>}
   */
  async isAvailable() {
    if (!this.apiKey) return false;
    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * 规范化尺寸
   * @param {number} width
   * @param {number} height
   * @returns {{width: number, height: number}}
   */
  #normalizeSize(width, height) {
    const { minWidth, maxWidth, minHeight, maxHeight, step } =
      this.sizeConstraints;

    // 确保在范围内
    let w = Math.max(minWidth, Math.min(maxWidth, width || 1024));
    let h = Math.max(minHeight, Math.min(maxHeight, height || 1024));

    // 确保是 step 的倍数
    w = Math.round(w / step) * step;
    h = Math.round(h / step) * step;

    return { width: w, height: h };
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
      negativePrompt,
      width = 1024,
      height = 1024,
      seed,
      steps = 20,
      guidanceScale = 7.5,
      n = 1,
    } = request;

    const model = options.model || this.supportedModels[0].id;
    const size = this.#normalizeSize(width, height);

    try {
      this.log(
        `Generating image with ${model}, size: ${size.width}x${size.height}`
      );

      const body = {
        model,
        prompt,
        image_size: `${size.width}x${size.height}`,
        batch_size: n,
        num_inference_steps: steps,
        guidance_scale: guidanceScale,
      };

      // 可选参数
      if (negativePrompt) body.negative_prompt = negativePrompt;
      if (seed !== undefined) body.seed = seed;

      const response = await fetch(`${this.baseUrl}/images/generations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const message = await this.#responseErrorMessage(response);
        const statusLine = response.statusText
          ? `HTTP ${response.status} ${response.statusText}`
          : `HTTP ${response.status}`;
        throw new Error(message ? `${statusLine}: ${message}` : statusLine);
      }

      const data = await response.json();
      const image = data.images?.[0] || data.data?.[0];

      if (!image) {
        throw new Error("No image returned from API");
      }

      const imageUrl = image.url || image.image_url || image.imageUrl;
      if (!imageUrl) {
        throw new Error("No image URL returned from API");
      }

      return {
        success: true,
        imageUrl,
        seed: data.seed,
        metadata: {
          model,
          width: size.width,
          height: size.height,
          steps,
          guidanceScale,
        },
      };
    } catch (error) {
      this.log(`Error generating image: ${error.message}`);
      throw new Error(`SiliconFlow image generation failed: ${error.message}`);
    }
  }

  /**
   * 图生图
   * @param {Object} request - 生成请求
   * @param {Object} options - 选项
   * @returns {Promise<Object>}
   */
  async imageToImage(request, options = {}) {
    const {
      inputImage,
      prompt,
      negativePrompt,
      strength = 0.7,
      seed,
      steps = 20,
      guidanceScale = 7.5,
    } = request;

    const model = options.model || "stabilityai/stable-diffusion-xl-base-1.0";

    try {
      this.log(`Image-to-image with ${model}`);

      // 将图像转换为 base64
      const imageBase64 = await this.#toBase64(inputImage);

      const body = {
        model,
        prompt,
        image: imageBase64,
        strength,
        num_inference_steps: steps,
        guidance_scale: guidanceScale,
      };

      if (negativePrompt) body.negative_prompt = negativePrompt;
      if (seed !== undefined) body.seed = seed;

      const response = await fetch(`${this.baseUrl}/images/image-to-image`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const message = await this.#responseErrorMessage(response);
        const statusLine = response.statusText
          ? `HTTP ${response.status} ${response.statusText}`
          : `HTTP ${response.status}`;
        throw new Error(message ? `${statusLine}: ${message}` : statusLine);
      }

      const data = await response.json();
      const image = data.images?.[0] || data.data?.[0];

      if (!image) {
        throw new Error("No image returned from API");
      }

      const imageUrl = image.url || image.image_url || image.imageUrl;
      if (!imageUrl) {
        throw new Error("No image URL returned from API");
      }

      return {
        success: true,
        imageUrl,
        seed: data.seed,
        metadata: {
          model,
          strength,
          steps,
          guidanceScale,
        },
      };
    } catch (error) {
      this.log(`Error in image-to-image: ${error.message}`);
      throw new Error(`SiliconFlow i2i failed: ${error.message}`);
    }
  }

  /**
   * 转换为 base64
   * @param {Buffer|string} input
   * @returns {Promise<string>}
   */
  async #toBase64(input) {
    if (Buffer.isBuffer(input)) {
      return input.toString("base64");
    }

    // 已是 base64 data URL
    if (typeof input === "string" && input.startsWith("data:")) {
      return input.split(",")[1];
    }

    // URL - 下载并转换
    if (
      typeof input === "string" &&
      (input.startsWith("http://") || input.startsWith("https://"))
    ) {
      const response = await fetch(input);
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer).toString("base64");
    }

    // 假设已是 base64
    return input;
  }

  /**
   * 日志输出
   * @param {string} text
   * @param  {...any} args
   */
  log(text, ...args) {
    console.log(`\x1b[36m[SiliconFlowImageProvider]\x1b[0m ${text}`, ...args);
  }
}

module.exports = { SiliconFlowImageProvider };
