/**
 * 图谱搜索缓存 (LRU Cache)
 * 用于缓存图谱搜索结果,提升性能
 */

class LRUCache {
  constructor(maxSize = 100) {
    this.maxSize = maxSize;
    this.cache = new Map();
  }

  /**
   * 生成缓存键
   * @param {number} workspaceId - Workspace ID
   * @param {string} keyword - 搜索关键词
   * @param {number} limit - 限制数量
   * @returns {string} 缓存键
   */
  _generateKey(workspaceId, keyword, limit) {
    return `${workspaceId}:${keyword}:${limit}`;
  }

  /**
   * 获取缓存
   * @param {number} workspaceId - Workspace ID
   * @param {string} keyword - 搜索关键词
   * @param {number} limit - 限制数量
   * @returns {Object|null} 缓存的子图数据
   */
  get(workspaceId, keyword, limit) {
    const key = this._generateKey(workspaceId, keyword, limit);

    if (!this.cache.has(key)) {
      return null;
    }

    // LRU: 将访问的项移到最后
    const value = this.cache.get(key);
    this.cache.delete(key);
    this.cache.set(key, value);

    console.log(`[GraphCache] Cache hit: ${key}`);
    return value;
  }

  /**
   * 设置缓存
   * @param {number} workspaceId - Workspace ID
   * @param {string} keyword - 搜索关键词
   * @param {number} limit - 限制数量
   * @param {Object} value - 子图数据
   */
  set(workspaceId, keyword, limit, value) {
    const key = this._generateKey(workspaceId, keyword, limit);

    // 如果已存在,先删除
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }

    // 如果缓存已满,删除最旧的项 (Map 的第一个项)
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
      console.log(`[GraphCache] Evicted: ${firstKey}`);
    }

    this.cache.set(key, value);
    console.log(`[GraphCache] Cached: ${key}`);
  }

  /**
   * 清空指定 workspace 的缓存
   * @param {number} workspaceId - Workspace ID
   */
  clearWorkspace(workspaceId) {
    const keysToDelete = [];

    for (const key of this.cache.keys()) {
      if (key.startsWith(`${workspaceId}:`)) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach((key) => this.cache.delete(key));
    console.log(
      `[GraphCache] Cleared ${keysToDelete.length} entries for workspace ${workspaceId}`
    );
  }

  /**
   * 清空所有缓存
   */
  clear() {
    this.cache.clear();
    console.log("[GraphCache] Cleared all cache");
  }

  /**
   * 获取缓存统计信息
   * @returns {Object} 统计信息
   */
  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      keys: Array.from(this.cache.keys()),
    };
  }
}

// 全局单例
const graphCache = new LRUCache(100); // 缓存最多 100 个搜索结果

module.exports = { graphCache, LRUCache };
