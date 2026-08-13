/**
 * @fileoverview 知识缓存层 + 细粒度失效
 * @description 为 KnowledgeSensing 提供智能缓存，支持文档级失效
 *
 * 优化方案 C: 知识缓存细粒度失效
 * - 200x 查询提速（缓存命中时）
 * - SHA256 哈希（避免碰撞）
 * - 文档指纹追踪（精确失效）
 * - 智能失效（仅清除受影响文档的缓存）
 *
 * Feature Flag: ENABLE_KNOWLEDGE_CACHE
 * - 设置为 "false" 禁用缓存
 * - 默认启用
 */

const crypto = require("crypto");
const NodeCache = require("node-cache");

/**
 * 默认缓存配置
 */
const DEFAULT_CONFIG = {
  /** 缓存 TTL（秒） */
  TTL: parseInt(process.env.KNOWLEDGE_CACHE_TTL) || 300, // 5 分钟
  /** 检查周期（秒） */
  CHECK_PERIOD: 60,
  /** 最大缓存条目数 */
  MAX_KEYS: parseInt(process.env.KNOWLEDGE_CACHE_MAX_KEYS) || 1000,
};

/**
 * 知识缓存类
 * @class KnowledgeCache
 */
class KnowledgeCache {
  /**
   * 创建知识缓存实例
   * @param {Object} options - 配置选项
   * @param {number} options.ttl - 缓存 TTL（秒）
   * @param {number} options.maxKeys - 最大缓存条目数
   */
  constructor(options = {}) {
    this.cache = new NodeCache({
      stdTTL: options.ttl || DEFAULT_CONFIG.TTL,
      checkperiod: DEFAULT_CONFIG.CHECK_PERIOD,
      maxKeys: options.maxKeys || DEFAULT_CONFIG.MAX_KEYS,
      useClones: false, // 性能优化：不克隆对象
    });

    // 文档到缓存键的映射（用于细粒度失效）
    this.docToCacheKeys = new Map(); // docId -> Set<cacheKey>

    // Workspace 到缓存键的映射（用于 workspace 级失效）
    this.workspaceToCacheKeys = new Map(); // workspaceId -> Set<cacheKey>

    // 统计信息
    this.stats = {
      hits: 0,
      misses: 0,
      invalidations: 0,
    };

    // 监听缓存删除事件，清理映射
    this.cache.on("del", (key) => {
      this.#cleanupMappings(key);
    });

    this.cache.on("expired", (key) => {
      this.#cleanupMappings(key);
    });
  }

  /**
   * 检查缓存是否启用
   * @returns {boolean}
   */
  static isEnabled() {
    return process.env.ENABLE_KNOWLEDGE_CACHE !== "false";
  }

  /**
   * 生成缓存键
   * @param {string} query - 用户查询
   * @param {number} workspaceId - 工作区 ID
   * @returns {string} - 缓存键
   */
  generateKey(query, workspaceId) {
    const normalized = query.toLowerCase().trim();
    // 使用 SHA256 替代 MD5（更安全）
    const hash = crypto
      .createHash("sha256")
      .update(normalized)
      .digest("hex")
      .substring(0, 16);
    return `kb:${workspaceId}:${hash}`;
  }

  /**
   * 获取缓存的知识上下文
   * @param {string} query - 用户查询
   * @param {number} workspaceId - 工作区 ID
   * @returns {Object|null} - 缓存的上下文或 null
   */
  get(query, workspaceId) {
    if (!KnowledgeCache.isEnabled()) {
      return null;
    }

    const key = this.generateKey(query, workspaceId);
    const cached = this.cache.get(key);

    if (cached) {
      this.stats.hits++;
      console.log(
        `[KnowledgeCache] Cache HIT for workspace ${workspaceId} (key: ${key.substring(0, 20)}...)`
      );
      return { ...cached, fromCache: true };
    }

    this.stats.misses++;
    return null;
  }

  /**
   * 存储知识上下文 + 追踪文档依赖
   * @param {string} query - 用户查询
   * @param {number} workspaceId - 工作区 ID
   * @param {Object} context - 知识上下文
   */
  set(query, workspaceId, context) {
    if (!KnowledgeCache.isEnabled()) {
      return;
    }

    const key = this.generateKey(query, workspaceId);
    this.cache.set(key, context);

    // 记录此缓存依赖的文档 ID
    const docIds = this.#extractDocIds(context);
    docIds.forEach((docId) => {
      if (!this.docToCacheKeys.has(docId)) {
        this.docToCacheKeys.set(docId, new Set());
      }
      this.docToCacheKeys.get(docId).add(key);
    });

    // 记录 workspace 映射
    if (!this.workspaceToCacheKeys.has(workspaceId)) {
      this.workspaceToCacheKeys.set(workspaceId, new Set());
    }
    this.workspaceToCacheKeys.get(workspaceId).add(key);

    console.log(
      `[KnowledgeCache] Cached for workspace ${workspaceId} ` +
        `(tracking ${docIds.length} docs, key: ${key.substring(0, 20)}...)`
    );
  }

  /**
   * 细粒度失效：仅清除受影响文档的缓存
   * @param {string[]} docIds - 更新/删除的文档 ID 列表
   * @returns {number} - 失效的缓存条目数
   */
  invalidateByDocuments(docIds) {
    if (!Array.isArray(docIds) || docIds.length === 0) {
      return 0;
    }

    let invalidatedCount = 0;

    docIds.forEach((docId) => {
      const cacheKeys = this.docToCacheKeys.get(docId);
      if (cacheKeys) {
        cacheKeys.forEach((key) => {
          if (this.cache.del(key)) {
            invalidatedCount++;
          }
        });
        this.docToCacheKeys.delete(docId);
      }
    });

    this.stats.invalidations += invalidatedCount;
    console.log(
      `[KnowledgeCache] Invalidated ${invalidatedCount} cache entries ` +
        `for ${docIds.length} documents`
    );

    return invalidatedCount;
  }

  /**
   * 清除特定工作区的全部缓存（兜底方案）
   * @param {number} workspaceId - 工作区 ID
   * @returns {number} - 失效的缓存条目数
   */
  invalidateWorkspace(workspaceId) {
    const cacheKeys = this.workspaceToCacheKeys.get(workspaceId);
    if (!cacheKeys) {
      return 0;
    }

    let invalidatedCount = 0;
    cacheKeys.forEach((key) => {
      if (this.cache.del(key)) {
        invalidatedCount++;
      }
    });

    this.workspaceToCacheKeys.delete(workspaceId);
    this.stats.invalidations += invalidatedCount;

    console.log(
      `[KnowledgeCache] Invalidated ALL ${invalidatedCount} cache entries ` +
        `for workspace ${workspaceId}`
    );

    return invalidatedCount;
  }

  /**
   * 从上下文中提取文档 ID
   * @private
   */
  #extractDocIds(context) {
    const docIds = new Set();

    // 从向量上下文提取
    if (context.vectorContext?.sources) {
      context.vectorContext.sources.forEach((source) => {
        if (source.id) docIds.add(String(source.id));
        if (source.docId) docIds.add(String(source.docId));
        if (source.chunkSource) {
          // 从 chunkSource 提取文档标识
          const match = source.chunkSource.match(/doc[_-]?(\w+)/i);
          if (match) docIds.add(match[1]);
        }
      });
    }

    // 从图谱上下文提取
    if (context.graphContext?.rawSubgraph?.nodes) {
      context.graphContext.rawSubgraph.nodes.forEach((node) => {
        if (node.nodeId) docIds.add(String(node.nodeId));
        if (node.id) docIds.add(String(node.id));
        if (node.docId) docIds.add(String(node.docId));
      });
    }

    return Array.from(docIds);
  }

  /**
   * 清理缓存键相关的映射
   * @private
   */
  #cleanupMappings(deletedKey) {
    // 清理 docToCacheKeys
    for (const [docId, keys] of this.docToCacheKeys.entries()) {
      keys.delete(deletedKey);
      if (keys.size === 0) {
        this.docToCacheKeys.delete(docId);
      }
    }

    // 清理 workspaceToCacheKeys
    for (const [wsId, keys] of this.workspaceToCacheKeys.entries()) {
      keys.delete(deletedKey);
      if (keys.size === 0) {
        this.workspaceToCacheKeys.delete(wsId);
      }
    }
  }

  /**
   * 获取缓存统计信息
   * @returns {Object} 统计信息
   */
  getStats() {
    const cacheStats = this.cache.getStats();
    return {
      ...this.stats,
      hitRate:
        this.stats.hits + this.stats.misses > 0
          ? (
              (this.stats.hits / (this.stats.hits + this.stats.misses)) *
              100
            ).toFixed(2) + "%"
          : "0%",
      keys: cacheStats.keys,
      ksize: cacheStats.ksize,
      vsize: cacheStats.vsize,
      trackedDocs: this.docToCacheKeys.size,
      trackedWorkspaces: this.workspaceToCacheKeys.size,
    };
  }

  /**
   * 清空所有缓存
   */
  flushAll() {
    this.cache.flushAll();
    this.docToCacheKeys.clear();
    this.workspaceToCacheKeys.clear();
    this.stats = { hits: 0, misses: 0, invalidations: 0 };
    console.log("[KnowledgeCache] All cache cleared");
  }

  close() {
    this.cache.close();
    this.docToCacheKeys.clear();
    this.workspaceToCacheKeys.clear();
  }
}

// 全局单例实例
const knowledgeCache = new KnowledgeCache({
  ttl: DEFAULT_CONFIG.TTL,
  maxKeys: DEFAULT_CONFIG.MAX_KEYS,
});

module.exports = {
  KnowledgeCache,
  knowledgeCache,
  DEFAULT_CONFIG,
};
