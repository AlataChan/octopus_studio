/**
 * ImageProviderRouter - 图像生成 Provider 统一入口
 *
 * 职责：
 * 1. 统一的图像生成接口
 * 2. Provider 路由与降级
 * 3. 能力检测（t2i/i2i/inpaint/outpaint/removeBackground）
 */

const { v4: uuidv4 } = require("uuid");
const { OpenAIImageProvider } = require("./openai");
const { AiHubMixImageProvider } = require("./aihubmix");
const { SiliconFlowImageProvider } = require("./siliconflow");
const { ZhipuImageProvider } = require("./zhipu");

/**
 * 图像生成能力定义
 * @typedef {Object} ImageProviderCapabilities
 * @property {boolean} t2i - text-to-image
 * @property {boolean} i2i - image-to-image
 * @property {boolean} inpaint - mask edit
 * @property {boolean} outpaint - expand
 * @property {boolean} removeBackground - background removal
 * @property {boolean} upscale - super resolution
 */

/**
 * 生成请求
 * @typedef {Object} GenerateRequest
 * @property {string} prompt - 生成提示词
 * @property {string} [negativePrompt] - 负面提示词
 * @property {number} [width=1024] - 图像宽度
 * @property {number} [height=1024] - 图像高度
 * @property {number} [seed] - 随机种子
 * @property {number} [steps] - 采样步数
 * @property {number} [guidanceScale] - 引导比例
 * @property {Buffer|string} [inputImage] - i2i 输入图像
 * @property {number} [strength] - i2i 强度 (0-1)
 */

/**
 * 生成响应
 * @typedef {Object} GenerateResponse
 * @property {boolean} success - 是否成功
 * @property {string} [imageUrl] - 云端 URL
 * @property {Buffer} [imageBuffer] - 本地 Buffer
 * @property {number} [seed] - 实际使用的 seed
 * @property {string} [revisedPrompt] - 修改后的 prompt（如 DALL-E）
 * @property {Object} [metadata] - 额外元数据
 * @property {string} [error] - 错误信息
 */

/**
 * Provider 注册表
 */
const PROVIDERS = {
  openai: OpenAIImageProvider,
  aihubmix: AiHubMixImageProvider,
  siliconflow: SiliconFlowImageProvider,
  zhipu: ZhipuImageProvider,
};

/**
 * Provider 优先级（用于自动选择）
 */
const PROVIDER_PRIORITY = ["aihubmix", "siliconflow", "openai", "zhipu"];

/**
 * 检查 Provider 是否可用
 * @param {string} providerName - Provider 名称
 * @returns {boolean}
 */
function isImageProviderAvailable(providerName) {
  const ProviderClass = PROVIDERS[providerName?.toLowerCase()];
  if (!ProviderClass) return false;
  return ProviderClass.isAvailable();
}

/**
 * 获取 Provider 实例
 * @param {string} providerName - Provider 名称
 * @returns {Object|null}
 */
function getImageProvider(providerName) {
  const ProviderClass = PROVIDERS[providerName?.toLowerCase()];
  if (!ProviderClass || !ProviderClass.isAvailable()) return null;
  return new ProviderClass();
}

/**
 * 根据能力选择最佳 Provider
 * @param {string} capability - 所需能力（t2i/i2i/inpaint/outpaint/removeBackground）
 * @param {string} [preferredProvider] - 用户偏好的 Provider
 * @returns {string|null} Provider 名称
 */
function selectProviderByCapability(
  capability = "t2i",
  preferredProvider = null
) {
  // 优先使用用户偏好
  if (preferredProvider) {
    const provider = getImageProvider(preferredProvider);
    if (provider && provider.capabilities[capability]) {
      return preferredProvider;
    }
  }

  // 按优先级查找支持该能力的 Provider
  for (const providerName of PROVIDER_PRIORITY) {
    const provider = getImageProvider(providerName);
    if (provider && provider.capabilities[capability]) {
      return providerName;
    }
  }

  return null;
}

/**
 * 统一的图像生成入口
 * @param {GenerateRequest} request - 生成请求
 * @param {Object} [options] - 选项
 * @param {string} [options.provider] - 指定 Provider
 * @param {string} [options.model] - 指定模型
 * @returns {Promise<GenerateResponse>}
 */
async function generateImage(request, options = {}) {
  const { provider: preferredProvider, model } = options;

  // 选择 Provider
  const providerName = selectProviderByCapability("t2i", preferredProvider);
  if (!providerName) {
    return {
      success: false,
      error:
        "No image generation provider available. Please configure at least one API key.",
    };
  }

  const provider = getImageProvider(providerName);
  if (!provider) {
    return {
      success: false,
      error: `Failed to initialize provider: ${providerName}`,
    };
  }

  try {
    console.log(`[ImageProviderRouter] Using provider: ${providerName}`);
    const result = await provider.generate(request, { model });
    return {
      ...result,
      metadata: {
        ...result.metadata,
        provider: providerName,
      },
    };
  } catch (error) {
    console.error(
      `[ImageProviderRouter] Error from ${providerName}:`,
      error.message
    );

    // 尝试降级到其他 Provider
    for (const fallbackName of PROVIDER_PRIORITY) {
      if (fallbackName === providerName) continue;

      const fallbackProvider = getImageProvider(fallbackName);
      if (!fallbackProvider?.capabilities.t2i) continue;

      try {
        console.log(`[ImageProviderRouter] Falling back to: ${fallbackName}`);
        // NOTE: `model` is provider-specific; never pass it to fallback providers.
        const result = await fallbackProvider.generate(request, {});
        return {
          ...result,
          metadata: {
            ...result.metadata,
            provider: fallbackName,
            fallbackFrom: providerName,
          },
        };
      } catch (fallbackError) {
        console.error(
          `[ImageProviderRouter] Fallback ${fallbackName} failed:`,
          fallbackError.message
        );
        continue;
      }
    }

    return {
      success: false,
      error: `All providers failed. Last error: ${error.message}`,
    };
  }
}

/**
 * 图像修复（Inpaint）
 * @param {Object} request - Inpaint 请求
 * @param {Buffer|string} request.inputImage - 输入图像
 * @param {Buffer|string} request.mask - 蒙版（白色区域为编辑区）
 * @param {string} request.prompt - 提示词
 * @param {string} [request.negativePrompt] - 负面提示词
 * @param {Object} [options] - 选项
 * @returns {Promise<GenerateResponse>}
 */
async function inpaintImage(request, options = {}) {
  const { provider: preferredProvider, model } = options;

  const providerName = selectProviderByCapability("inpaint", preferredProvider);
  if (!providerName) {
    return {
      success: false,
      error: "No inpaint provider available.",
    };
  }

  const provider = getImageProvider(providerName);
  try {
    const result = await provider.inpaint(request, { model });
    return {
      ...result,
      metadata: {
        ...result.metadata,
        provider: providerName,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * 背景移除
 * @param {Object} request - 请求
 * @param {Buffer|string} request.inputImage - 输入图像
 * @param {string} [request.outputFormat='png'] - 输出格式
 * @param {Object} [options] - 选项
 * @returns {Promise<GenerateResponse>}
 */
async function removeBackground(request, options = {}) {
  const { provider: preferredProvider } = options;

  const providerName = selectProviderByCapability(
    "removeBackground",
    preferredProvider
  );
  if (!providerName) {
    return {
      success: false,
      error: "No background removal provider available.",
    };
  }

  const provider = getImageProvider(providerName);
  try {
    const result = await provider.removeBackground(request);
    return {
      ...result,
      metadata: {
        ...result.metadata,
        provider: providerName,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * 获取所有可用 Provider 的状态
 * @returns {Object}
 */
function getImageProviderStatus() {
  const status = {};
  for (const [name, ProviderClass] of Object.entries(PROVIDERS)) {
    const available = ProviderClass.isAvailable();
    let capabilities = null;
    let models = null;

    if (available) {
      const instance = new ProviderClass();
      capabilities = instance.capabilities;
      models = instance.supportedModels || [];
    }

    status[name] = {
      available,
      capabilities,
      models,
    };
  }
  return status;
}

module.exports = {
  // 主要函数
  generateImage,
  inpaintImage,
  removeBackground,

  // Provider 管理
  isImageProviderAvailable,
  getImageProvider,
  selectProviderByCapability,
  getImageProviderStatus,

  // 导出 Provider 类（供直接使用）
  OpenAIImageProvider,
  AiHubMixImageProvider,
  SiliconFlowImageProvider,
  ZhipuImageProvider,
};
