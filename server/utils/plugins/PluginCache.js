/**
 * 插件缓存管理
 *
 * @description
 * 提供插件元数据的内存缓存，支持 TTL 过期和手动刷新
 *
 * @module server/utils/plugins/PluginCache
 */

const { PLUGIN_CACHE_TTL } = require("./constants");

/**
 * 插件缓存管理器
 */
class PluginCache {
  constructor() {
    /** @type {Map<string, import('./types').PluginCacheEntry>} */
    this.cache = new Map();
    this.ttl = PLUGIN_CACHE_TTL;
  }

  /**
   * 获取缓存条目
   * @param {string} key - 缓存键（通常是文件路径）
   * @returns {import('./types').ParsedPluginMetadata | null}
   */
  get(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // 检查是否过期
    if (Date.now() - entry.cachedAt > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.metadata;
  }

  /**
   * 设置缓存条目
   * @param {string} key - 缓存键
   * @param {import('./types').ParsedPluginMetadata} metadata - 元数据
   * @param {number} [ttl] - 可选的自定义 TTL
   */
  set(key, metadata, ttl = this.ttl) {
    this.cache.set(key, {
      metadata,
      cachedAt: Date.now(),
      ttl,
    });
  }

  /**
   * 删除缓存条目
   * @param {string} key - 缓存键
   * @returns {boolean}
   */
  delete(key) {
    return this.cache.delete(key);
  }

  /**
   * 检查缓存是否存在且未过期
   * @param {string} key - 缓存键
   * @returns {boolean}
   */
  has(key) {
    return this.get(key) !== null;
  }

  /**
   * 清除所有缓存
   */
  clear() {
    this.cache.clear();
  }

  /**
   * 清除过期的缓存条目
   * @returns {number} 清除的条目数
   */
  prune() {
    let pruned = 0;
    const now = Date.now();

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.cachedAt > entry.ttl) {
        this.cache.delete(key);
        pruned++;
      }
    }

    return pruned;
  }

  /**
   * 获取缓存统计
   * @returns {{total: number, expired: number, validKeys: string[]}}
   */
  getStats() {
    const now = Date.now();
    let expired = 0;
    const validKeys = [];

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.cachedAt > entry.ttl) {
        expired++;
      } else {
        validKeys.push(key);
      }
    }

    return {
      total: this.cache.size,
      expired,
      validKeys,
    };
  }

  /**
   * 根据前缀获取所有匹配的缓存
   * @param {string} prefix - 键前缀
   * @returns {import('./types').ParsedPluginMetadata[]}
   */
  getByPrefix(prefix) {
    const results = [];
    for (const [key] of this.cache.entries()) {
      if (key.startsWith(prefix)) {
        const metadata = this.get(key);
        if (metadata) results.push(metadata);
      }
    }
    return results;
  }

  /**
   * 按插件类型获取所有缓存
   * @param {string} pluginType - 插件类型
   * @returns {import('./types').ParsedPluginMetadata[]}
   */
  getByType(pluginType) {
    const results = [];
    for (const [, entry] of this.cache.entries()) {
      if (entry.metadata.pluginType === pluginType) {
        const metadata = this.get(entry.metadata.originPath);
        if (metadata) results.push(metadata);
      }
    }
    return results;
  }
}

// 单例实例
const pluginCache = new PluginCache();

module.exports = { PluginCache, pluginCache };
