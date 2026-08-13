/**
 * 知识图谱 Feature Flag 配置模块
 * @module utils/graphBuilder/featureFlags
 * @description 控制知识图谱各项增强功能的开关和配置
 *
 * 配置优先级（从高到低）:
 * 1. 数据库设置 (system_settings 表) - 可通过 UI 修改
 * 2. 环境变量 (.env 文件)
 * 3. 代码默认值
 *
 * 环境变量配置示例:
 * KG_GUIDED_RETRIEVAL_ENABLED=true
 * KG_ENTITY_EXTRACTION_ENABLED=false
 * KG_SIMILARITY_EDGES_ENABLED=true
 * KG_PATH_FINDER_ENABLED=false
 * KG_COMMUNITY_DETECTION_ENABLED=false
 * KG_BUILD_WRITES_PER_SEC=50
 * KG_BUILD_BATCH_SIZE=100
 * KG_SEARCH_TIMEOUT_MS=500
 * KG_FALLBACK_ON_TIMEOUT=true
 */

// 缓存从数据库读取的设置
let dbSettingsCache = null;
let dbSettingsCacheTime = 0;
const DB_SETTINGS_CACHE_TTL = 60000; // 1分钟缓存

/**
 * 从数据库获取知识图谱设置（带缓存）
 * @returns {Promise<Object>} 数据库设置
 */
async function getDbSettings() {
  const now = Date.now();
  if (dbSettingsCache && now - dbSettingsCacheTime < DB_SETTINGS_CACHE_TTL) {
    return dbSettingsCache;
  }

  try {
    // 延迟加载避免循环依赖
    const prisma = require("../prisma");
    const settings = await prisma.system_settings.findMany({
      where: {
        label: {
          startsWith: "kg_",
        },
      },
    });

    dbSettingsCache = {};
    for (const setting of settings) {
      dbSettingsCache[setting.label] = setting.value;
    }
    dbSettingsCacheTime = now;
    return dbSettingsCache;
  } catch (error) {
    console.error(
      "[KG FeatureFlags] Failed to load DB settings:",
      error.message
    );
    return {};
  }
}

/**
 * 清除数据库设置缓存（设置更新后调用）
 */
function clearDbSettingsCache() {
  dbSettingsCache = null;
  dbSettingsCacheTime = 0;
}

/**
 * 获取布尔类型设置值
 * @param {Object} dbSettings - 数据库设置
 * @param {string} dbKey - 数据库设置键
 * @param {string} envKey - 环境变量键
 * @param {boolean} defaultValue - 默认值
 * @returns {boolean}
 */
function getBoolSetting(dbSettings, dbKey, envKey, defaultValue = false) {
  // 优先使用数据库设置
  if (dbSettings && dbSettings[dbKey] !== undefined) {
    return dbSettings[dbKey] === "true";
  }
  // 其次使用环境变量
  if (process.env[envKey] !== undefined) {
    return process.env[envKey] === "true";
  }
  return defaultValue;
}

/**
 * 获取数值类型设置值
 * @param {Object} dbSettings - 数据库设置
 * @param {string} dbKey - 数据库设置键
 * @param {string} envKey - 环境变量键
 * @param {number} defaultValue - 默认值
 * @returns {number}
 */
function getIntSetting(dbSettings, dbKey, envKey, defaultValue) {
  // 优先使用数据库设置
  if (dbSettings && dbSettings[dbKey] !== undefined) {
    const val = parseInt(dbSettings[dbKey], 10);
    if (!isNaN(val)) return val;
  }
  // 其次使用环境变量
  if (process.env[envKey] !== undefined) {
    const val = parseInt(process.env[envKey], 10);
    if (!isNaN(val)) return val;
  }
  return defaultValue;
}

/**
 * 异步获取最新的 Feature Flags（包含数据库配置）
 * @returns {Promise<Object>} Feature flags
 */
async function getFeatureFlags() {
  const dbSettings = await getDbSettings();
  return {
    GUIDED_RETRIEVAL_ENABLED: getBoolSetting(
      dbSettings,
      "kg_guided_retrieval_enabled",
      "KG_GUIDED_RETRIEVAL_ENABLED",
      false
    ),
    ENTITY_EXTRACTION_ENABLED: getBoolSetting(
      dbSettings,
      "kg_entity_extraction_enabled",
      "KG_ENTITY_EXTRACTION_ENABLED",
      false
    ),
    SIMILARITY_EDGES_ENABLED: getBoolSetting(
      dbSettings,
      "kg_similarity_edges_enabled",
      "KG_SIMILARITY_EDGES_ENABLED",
      false
    ),
    PATH_FINDER_ENABLED: getBoolSetting(
      dbSettings,
      "kg_path_finder_enabled",
      "KG_PATH_FINDER_ENABLED",
      false
    ),
    COMMUNITY_DETECTION_ENABLED:
      process.env.KG_COMMUNITY_DETECTION_ENABLED === "true", // 暂不支持 UI 配置
  };
}

/**
 * 异步获取降级配置（包含数据库配置）
 * @returns {Promise<Object>} Degradation config
 */
async function getDegradationConfig() {
  const dbSettings = await getDbSettings();
  return {
    SEARCH_TIMEOUT_MS: getIntSetting(
      dbSettings,
      "kg_search_timeout_ms",
      "KG_SEARCH_TIMEOUT_MS",
      500
    ),
    AUTO_DISABLE_LATENCY_THRESHOLD_MS:
      parseInt(process.env.KG_AUTO_DISABLE_LATENCY_MS) || 800,
    CIRCUIT_BREAKER_THRESHOLD: getIntSetting(
      dbSettings,
      "kg_circuit_breaker_threshold",
      "KG_CIRCUIT_BREAKER_THRESHOLD",
      5
    ),
    CIRCUIT_BREAKER_RECOVERY_SEC:
      parseInt(process.env.KG_CIRCUIT_BREAKER_RECOVERY_SEC) || 60,
    FALLBACK_ON_TIMEOUT: process.env.KG_FALLBACK_ON_TIMEOUT !== "false",
  };
}

/**
 * Feature Flag 配置（静态，用于快速同步读取）
 * 注意：这是启动时的快照，不包含数据库设置
 * 推荐使用 getFeatureFlags() 或 isFeatureEnabledAsync() 获取最新值
 */
const KG_FEATURE_FLAGS = {
  // 图谱引导检索 - 控制是否启用图谱引导的二阶段检索
  GUIDED_RETRIEVAL_ENABLED: process.env.KG_GUIDED_RETRIEVAL_ENABLED === "true",

  // 实体抽取 - 控制是否在文档入库时执行实体抽取
  ENTITY_EXTRACTION_ENABLED:
    process.env.KG_ENTITY_EXTRACTION_ENABLED === "true",

  // 相似度边计算 - 控制是否计算结构性相似边
  SIMILARITY_EDGES_ENABLED: process.env.KG_SIMILARITY_EDGES_ENABLED === "true",

  // 多跳路径查找 - 控制是否启用路径查找功能
  PATH_FINDER_ENABLED: process.env.KG_PATH_FINDER_ENABLED === "true",

  // 社区检测 - 控制是否启用社区检测
  COMMUNITY_DETECTION_ENABLED:
    process.env.KG_COMMUNITY_DETECTION_ENABLED === "true",
};

/**
 * 性能限流配置
 * 用于控制图谱构建和查询的资源使用
 */
const KG_THROTTLE_CONFIG = {
  // 构建任务每秒写入操作数上限
  BUILD_WRITES_PER_SEC: parseInt(process.env.KG_BUILD_WRITES_PER_SEC) || 50,

  // 批量操作的批次大小
  BUILD_BATCH_SIZE: parseInt(process.env.KG_BUILD_BATCH_SIZE) || 100,

  // 批次间休眠时间（毫秒）
  SLEEP_BETWEEN_BATCHES_MS:
    parseInt(process.env.KG_SLEEP_BETWEEN_BATCHES_MS) || 100,
};

/**
 * 图谱搜索超时与降级配置
 */
const KG_DEGRADATION_CONFIG = {
  // 图谱搜索超时阈值（毫秒）
  SEARCH_TIMEOUT_MS: parseInt(process.env.KG_SEARCH_TIMEOUT_MS) || 500,

  // P95 延迟超过此值时自动禁用（毫秒）
  AUTO_DISABLE_LATENCY_THRESHOLD_MS:
    parseInt(process.env.KG_AUTO_DISABLE_LATENCY_MS) || 800,

  // 连续失败次数超过此值时熔断
  CIRCUIT_BREAKER_THRESHOLD:
    parseInt(process.env.KG_CIRCUIT_BREAKER_THRESHOLD) || 5,

  // 熔断恢复等待时间（秒）
  CIRCUIT_BREAKER_RECOVERY_SEC:
    parseInt(process.env.KG_CIRCUIT_BREAKER_RECOVERY_SEC) || 60,

  // 是否在超时时回退到普通检索
  FALLBACK_ON_TIMEOUT: process.env.KG_FALLBACK_ON_TIMEOUT !== "false",
};

/**
 * 图谱引导检索触发条件配置
 */
const KG_GUIDED_RETRIEVAL_CONFIG = {
  // 向量检索返回结果数低于此值时触发图谱增强
  MIN_RESULTS_THRESHOLD: parseInt(process.env.KG_MIN_RESULTS_THRESHOLD) || 3,

  // 最高分数低于此值时触发图谱增强
  MIN_SCORE_THRESHOLD: parseFloat(process.env.KG_MIN_SCORE_THRESHOLD) || 0.6,

  // 覆盖度评分低于此值时触发图谱增强
  MIN_COVERAGE_THRESHOLD:
    parseFloat(process.env.KG_MIN_COVERAGE_THRESHOLD) || 0.5,

  // 图谱扩展时最多使用的关键词数量
  MAX_EXPANDED_KEYWORDS: parseInt(process.env.KG_MAX_EXPANDED_KEYWORDS) || 5,

  // 图谱检索返回的最大节点数
  MAX_GRAPH_NODES: parseInt(process.env.KG_MAX_GRAPH_NODES) || 20,

  // 图谱扩展的最大深度（邻居跳数）
  MAX_EXPANSION_DEPTH: parseInt(process.env.KG_MAX_EXPANSION_DEPTH) || 2,
};

/**
 * 实体抽取配置
 */
const KG_ENTITY_EXTRACTION_CONFIG = {
  // 每次处理的最大字符数
  MAX_CHUNK_SIZE: parseInt(process.env.KG_ENTITY_MAX_CHUNK_SIZE) || 4000,

  // 允许的实体类型
  ENTITY_TYPES: ["concept", "technology", "person", "organization", "product"],

  // 最低置信度阈值
  MIN_CONFIDENCE: parseFloat(process.env.KG_ENTITY_MIN_CONFIDENCE) || 0.7,

  // 每个文档最多抽取的实体数
  MAX_ENTITIES_PER_DOC: parseInt(process.env.KG_MAX_ENTITIES_PER_DOC) || 20,

  // 每个 Workspace 实体节点上限
  MAX_ENTITIES_PER_WORKSPACE:
    parseInt(process.env.KG_MAX_ENTITIES_PER_WORKSPACE) || 5000,

  // 每个实体最大关系数
  MAX_RELATIONS_PER_ENTITY:
    parseInt(process.env.KG_MAX_RELATIONS_PER_ENTITY) || 50,
};

/**
 * 相似边计算配置
 */
const KG_SIMILARITY_CONFIG = {
  // 相似度阈值（低于此值不创建边）
  MIN_SIMILARITY_THRESHOLD: parseFloat(process.env.KG_MIN_SIMILARITY) || 0.7,

  // 每个节点最大相似边数量
  MAX_SIMILAR_EDGES_PER_NODE: parseInt(process.env.KG_MAX_SIMILAR_EDGES) || 5,

  // 是否使用结构性相似（共现/引用/标签）
  USE_STRUCTURAL_SIMILARITY:
    process.env.KG_USE_STRUCTURAL_SIMILARITY !== "false",

  // 是否使用向量相似（需要额外计算）
  USE_VECTOR_SIMILARITY: process.env.KG_USE_VECTOR_SIMILARITY === "true",
};

/**
 * 路径查找配置
 */
const KG_PATH_FINDER_CONFIG = {
  // 最大搜索深度
  MAX_DEPTH: parseInt(process.env.KG_PATH_MAX_DEPTH) || 4,

  // 最大访问节点数
  MAX_NODES_VISITED: parseInt(process.env.KG_PATH_MAX_NODES) || 1000,

  // 路径查找超时（毫秒）
  TIMEOUT_MS: parseInt(process.env.KG_PATH_TIMEOUT_MS) || 3000,
};

/**
 * 熔断器状态（运行时）
 */
const circuitBreakerState = {
  failures: 0,
  lastFailure: null,
  isOpen: false,
  openedAt: null,
};

/**
 * 检查功能是否启用（同步版本，仅读取环境变量）
 * @param {string} featureName - 功能名称
 * @returns {boolean} 是否启用
 */
function isFeatureEnabled(featureName) {
  const key = featureName.toUpperCase().replace(/-/g, "_");
  const flagKey = `${key}_ENABLED`;
  return KG_FEATURE_FLAGS[flagKey] === true;
}

/**
 * 检查功能是否启用（异步版本，包含数据库配置）
 * @param {string} featureName - 功能名称
 * @returns {Promise<boolean>} 是否启用
 */
async function isFeatureEnabledAsync(featureName) {
  const flags = await getFeatureFlags();
  const key = featureName.toUpperCase().replace(/-/g, "_");
  const flagKey = `${key}_ENABLED`;
  return flags[flagKey] === true;
}

/**
 * 检查熔断器状态
 * @returns {boolean} 是否应该继续执行（false 表示熔断中）
 */
function checkCircuitBreaker() {
  if (!circuitBreakerState.isOpen) {
    return true;
  }

  // 检查是否到了恢复时间
  const now = Date.now();
  const recoverTime =
    circuitBreakerState.openedAt +
    KG_DEGRADATION_CONFIG.CIRCUIT_BREAKER_RECOVERY_SEC * 1000;

  if (now >= recoverTime) {
    // 尝试半开状态
    circuitBreakerState.isOpen = false;
    circuitBreakerState.failures = 0;
    console.log("[KG CircuitBreaker] Attempting recovery...");
    return true;
  }

  return false;
}

/**
 * 记录成功，重置熔断器
 */
function recordSuccess() {
  circuitBreakerState.failures = 0;
  circuitBreakerState.isOpen = false;
}

/**
 * 记录失败，可能触发熔断
 */
function recordFailure() {
  circuitBreakerState.failures++;
  circuitBreakerState.lastFailure = Date.now();

  if (
    circuitBreakerState.failures >=
    KG_DEGRADATION_CONFIG.CIRCUIT_BREAKER_THRESHOLD
  ) {
    circuitBreakerState.isOpen = true;
    circuitBreakerState.openedAt = Date.now();
    console.warn(
      `[KG CircuitBreaker] Circuit opened after ${circuitBreakerState.failures} failures`
    );
  }
}

/**
 * 获取熔断器状态（用于监控）
 * @returns {Object} 熔断器状态
 */
function getCircuitBreakerStatus() {
  return {
    isOpen: circuitBreakerState.isOpen,
    failures: circuitBreakerState.failures,
    lastFailure: circuitBreakerState.lastFailure,
    openedAt: circuitBreakerState.openedAt,
  };
}

/**
 * 带超时的 Promise 包装
 * @param {Promise} promise - 要执行的 Promise
 * @param {number} timeoutMs - 超时时间（毫秒）
 * @param {string} operationName - 操作名称（用于日志）
 * @returns {Promise} 带超时的 Promise
 */
async function withTimeout(promise, timeoutMs, operationName = "operation") {
  let timeoutId;

  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`[KG] ${operationName} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutId);
    return result;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

/**
 * 批量操作的节流执行器
 * @param {Array} items - 要处理的项目数组
 * @param {Function} processor - 处理函数
 * @param {Object} options - 配置选项
 * @returns {Promise<Array>} 处理结果
 */
async function throttledBatchProcess(items, processor, options = {}) {
  const batchSize = options.batchSize || KG_THROTTLE_CONFIG.BUILD_BATCH_SIZE;
  const sleepMs =
    options.sleepMs || KG_THROTTLE_CONFIG.SLEEP_BETWEEN_BATCHES_MS;
  const results = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(processor));
    results.push(...batchResults);

    // 批次间休眠，避免数据库压力过大
    if (i + batchSize < items.length) {
      await sleep(sleepMs);
    }

    // 可选的进度回调
    if (options.onProgress) {
      options.onProgress({
        processed: Math.min(i + batchSize, items.length),
        total: items.length,
        percentage: Math.floor(
          (Math.min(i + batchSize, items.length) / items.length) * 100
        ),
      });
    }
  }

  return results;
}

/**
 * 休眠函数
 * @param {number} ms - 毫秒数
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 获取所有 Feature Flag 状态（用于调试/监控）
 * @returns {Object} 所有功能标志状态
 */
function getAllFeatureFlags() {
  return {
    flags: KG_FEATURE_FLAGS,
    throttle: KG_THROTTLE_CONFIG,
    degradation: KG_DEGRADATION_CONFIG,
    guidedRetrieval: KG_GUIDED_RETRIEVAL_CONFIG,
    entityExtraction: KG_ENTITY_EXTRACTION_CONFIG,
    similarity: KG_SIMILARITY_CONFIG,
    pathFinder: KG_PATH_FINDER_CONFIG,
    circuitBreaker: getCircuitBreakerStatus(),
  };
}

module.exports = {
  // Feature Flags
  KG_FEATURE_FLAGS,
  isFeatureEnabled,
  isFeatureEnabledAsync,
  getFeatureFlags,
  getDegradationConfig,
  clearDbSettingsCache,

  // 配置
  KG_THROTTLE_CONFIG,
  KG_DEGRADATION_CONFIG,
  KG_GUIDED_RETRIEVAL_CONFIG,
  KG_ENTITY_EXTRACTION_CONFIG,
  KG_SIMILARITY_CONFIG,
  KG_PATH_FINDER_CONFIG,

  // 熔断器
  checkCircuitBreaker,
  recordSuccess,
  recordFailure,
  getCircuitBreakerStatus,

  // 工具函数
  withTimeout,
  throttledBatchProcess,
  sleep,

  // 调试
  getAllFeatureFlags,
};
