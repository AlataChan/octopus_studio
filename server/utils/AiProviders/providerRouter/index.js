/**
 * ProviderRouter - LLM Provider 智能路由
 *
 * 策略：
 * 1. 默认使用 DeepSeek（便宜、国内可用）
 * 2. 如果用户开启"提升智能"，切换到 Claude
 * 3. 如果检测到海外部署，自动使用 Claude
 * 4. 支持降级链
 */

const DEPLOYMENT_REGIONS = {
  CN: "CN", // 中国大陆
  GLOBAL: "GLOBAL", // 海外
  AUTO: "AUTO", // 自动检测
};

const DEFAULT_PROVIDERS = {
  DEFAULT: "deepseek",
  PREMIUM: "anthropic",
};

/**
 * 检测部署地理位置
 * @returns {string} 地理区域
 */
function detectRegion() {
  const configuredRegion = process.env.DEPLOYMENT_REGION?.toUpperCase();

  // 如果明确配置了区域，直接返回
  if (configuredRegion === DEPLOYMENT_REGIONS.CN) {
    return DEPLOYMENT_REGIONS.CN;
  }
  if (configuredRegion === DEPLOYMENT_REGIONS.GLOBAL) {
    return DEPLOYMENT_REGIONS.GLOBAL;
  }

  // AUTO 模式：基于环境变量和 API Key 可用性判断
  // 如果配置了 Anthropic API Key 且能访问，可能是海外
  // 如果只有 DeepSeek，假定是国内
  const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
  const hasDeepSeek = !!process.env.DEEPSEEK_API_KEY;

  // 简单启发式：如果两者都有，检查 TZ 时区
  if (hasAnthropic && hasDeepSeek) {
    const tz =
      process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone;
    const cnTimezones = [
      "Asia/Shanghai",
      "Asia/Chongqing",
      "Asia/Hong_Kong",
      "Asia/Macau",
    ];
    if (
      cnTimezones.some((zone) => tz?.includes(zone) || tz?.includes("China"))
    ) {
      return DEPLOYMENT_REGIONS.CN;
    }
    return DEPLOYMENT_REGIONS.GLOBAL;
  }

  // 只有 DeepSeek，假定国内
  if (hasDeepSeek && !hasAnthropic) {
    return DEPLOYMENT_REGIONS.CN;
  }

  // 只有 Anthropic，假定海外
  if (hasAnthropic && !hasDeepSeek) {
    return DEPLOYMENT_REGIONS.GLOBAL;
  }

  // 默认国内
  return DEPLOYMENT_REGIONS.CN;
}

/**
 * 检查 Provider 是否可用
 * @param {string} providerName - Provider 名称
 * @returns {boolean} 是否可用
 */
function isProviderAvailable(providerName) {
  const apiKeys = {
    deepseek: process.env.DEEPSEEK_API_KEY,
    anthropic: process.env.ANTHROPIC_API_KEY,
    openai: process.env.OPEN_AI_KEY,
    "azure-openai": process.env.AZURE_OPENAI_ENDPOINT,
    ollama: process.env.OLLAMA_BASE_PATH,
  };
  return !!apiKeys[providerName?.toLowerCase()];
}

/**
 * 选择最佳 Provider
 * @param {Object} options - 选项
 * @param {boolean} options.enhancedIntelligence - 是否开启提升智能
 * @param {string} options.preferredProvider - 用户偏好的 Provider
 * @returns {string} 选中的 Provider 名称
 */
function selectProvider(options = {}) {
  const { enhancedIntelligence = false, preferredProvider = null } = options;

  // 1. 如果用户指定了 Provider，优先使用
  if (preferredProvider && isProviderAvailable(preferredProvider)) {
    return preferredProvider;
  }

  // 2. 如果开启了"提升智能"，使用 Premium Provider
  if (enhancedIntelligence) {
    const premium =
      process.env.PREMIUM_LLM_PROVIDER || DEFAULT_PROVIDERS.PREMIUM;
    if (isProviderAvailable(premium)) {
      return premium;
    }
    // 降级：Premium 不可用，尝试默认
    console.log(
      `[ProviderRouter] Premium provider ${premium} not available, falling back`
    );
  }

  // 3. 检测地理位置
  const region = detectRegion();

  // 4. 海外自动使用 Claude
  if (region === DEPLOYMENT_REGIONS.GLOBAL) {
    const premium =
      process.env.PREMIUM_LLM_PROVIDER || DEFAULT_PROVIDERS.PREMIUM;
    if (isProviderAvailable(premium)) {
      return premium;
    }
  }

  // 5. 默认使用 DeepSeek
  const defaultProvider =
    process.env.DEFAULT_LLM_PROVIDER || DEFAULT_PROVIDERS.DEFAULT;
  if (isProviderAvailable(defaultProvider)) {
    return defaultProvider;
  }

  // 6. 降级链
  const fallbackChain = (
    process.env.FALLBACK_CHAIN || "deepseek,ollama,openai"
  ).split(",");
  for (const provider of fallbackChain) {
    if (isProviderAvailable(provider.trim())) {
      console.log(`[ProviderRouter] Using fallback provider: ${provider}`);
      return provider.trim();
    }
  }

  // 无可用 Provider
  throw new Error(
    "No available LLM provider found. Please configure at least one API key."
  );
}

/**
 * 获取当前路由状态
 * @returns {Object} 路由状态信息
 */
function getRouterStatus() {
  return {
    region: detectRegion(),
    defaultProvider:
      process.env.DEFAULT_LLM_PROVIDER || DEFAULT_PROVIDERS.DEFAULT,
    premiumProvider:
      process.env.PREMIUM_LLM_PROVIDER || DEFAULT_PROVIDERS.PREMIUM,
    availableProviders: {
      deepseek: isProviderAvailable("deepseek"),
      anthropic: isProviderAvailable("anthropic"),
      openai: isProviderAvailable("openai"),
      ollama: isProviderAvailable("ollama"),
    },
  };
}

module.exports = {
  DEPLOYMENT_REGIONS,
  DEFAULT_PROVIDERS,
  detectRegion,
  isProviderAvailable,
  selectProvider,
  getRouterStatus,
};
