/**
 * Blackboard - 共享上下文管理器
 *
 * @description
 * Blackboard 是多 Agent 协作的核心数据共享机制。
 * 它允许不同的 Subflow（Agent）读写共享数据，实现协作。
 *
 * 主要功能：
 * 1. 数据存储与读取（get/set/has/delete）
 * 2. 历史记录追踪（getHistory）
 * 3. 输入/输出映射（mapInputs/mapOutputs）
 * 4. 元数据支持（每个数据项可附加元数据）
 *
 * 使用场景：
 * - 研究助手将调研结果存入 blackboard
 * - 写作助手从 blackboard 读取调研结果
 * - 审核助手读取写作结果并提供反馈
 */

class Blackboard {
  /**
   * 创建 Blackboard 实例
   * @param {Object} initialData - 初始数据
   */
  constructor(initialData = {}) {
    this.data = { ...initialData };
    this.history = []; // 记录所有操作历史
    this.metadata = {}; // 存储每个 key 的元数据
  }

  /**
   * 设置数据
   * @param {string} key - 数据键
   * @param {*} value - 数据值
   * @param {Object} metadata - 元数据（可选）
   * @param {string} metadata.role - 设置此数据的角色
   * @param {string} metadata.roleDescription - 角色描述
   * @param {string} metadata.flowId - 来源 Flow ID
   * @param {string} metadata.timestamp - 时间戳
   */
  set(key, value, metadata = {}) {
    const previousValue = this.data[key];
    this.data[key] = value;
    this.metadata[key] = {
      ...metadata,
      updatedAt: new Date().toISOString(),
    };

    // 记录历史
    this.history.push({
      action: "set",
      key,
      value,
      previousValue,
      metadata: this.metadata[key],
      timestamp: new Date().toISOString(),
    });

    return this;
  }

  /**
   * 获取数据
   * @param {string} key - 数据键
   * @param {*} defaultValue - 默认值（如果 key 不存在）
   * @returns {*} 数据值
   */
  get(key, defaultValue = null) {
    return this.has(key) ? this.data[key] : defaultValue;
  }

  /**
   * 检查 key 是否存在
   * @param {string} key - 数据键
   * @returns {boolean}
   */
  has(key) {
    return (
      key in this.data &&
      this.data[key] !== undefined &&
      this.data[key] !== null
    );
  }

  /**
   * 删除数据
   * @param {string} key - 数据键
   * @returns {boolean} 是否成功删除
   */
  delete(key) {
    if (!this.has(key)) return false;

    const value = this.data[key];
    delete this.data[key];
    delete this.metadata[key];

    // 记录历史
    this.history.push({
      action: "delete",
      key,
      value,
      timestamp: new Date().toISOString(),
    });

    return true;
  }

  /**
   * 获取所有数据
   * @returns {Object} 所有数据的副本
   */
  getAll() {
    return { ...this.data };
  }

  /**
   * 获取操作历史
   * @param {number} limit - 限制返回的历史记录数量（可选）
   * @returns {Array} 历史记录数组
   */
  getHistory(limit = null) {
    if (limit && limit > 0) {
      return this.history.slice(-limit);
    }
    return [...this.history];
  }

  /**
   * 清空所有数据
   */
  clear() {
    this.data = {};
    this.metadata = {};
    this.history.push({
      action: "clear",
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * 获取 key 的元数据
   * @param {string} key - 数据键
   * @returns {Object|null} 元数据对象
   */
  getMetadata(key) {
    return this.metadata[key] || null;
  }

  /**
   * 输入映射 - 从 blackboard 映射数据到目标对象
   *
   * @param {Object} mapping - 映射配置 { targetKey: blackboardKey }
   * @returns {Object} 映射后的数据对象
   *
   * @example
   * // blackboard 中有: { user_query: "What is AI?", context: [...] }
   * const inputs = blackboard.mapInputs({
   *   query: "user_query",
   *   background: "context"
   * });
   * // 返回: { query: "What is AI?", background: [...] }
   */
  mapInputs(mapping) {
    const result = {};
    for (const [targetKey, blackboardKey] of Object.entries(mapping)) {
      const value = this.get(blackboardKey);
      if (value !== null && value !== undefined) {
        result[targetKey] = value;
      }
    }
    return result;
  }

  /**
   * 输出映射 - 将结果存储到 blackboard
   *
   * @param {string} outputKey - 存储的 key
   * @param {*} result - 要存储的结果
   * @param {Object} metadata - 元数据（可选）
   * @returns {Blackboard} this（支持链式调用）
   *
   * @example
   * blackboard.mapOutputs("researcher_output", researchResult, {
   *   role: "researcher",
   *   flowId: "research-flow-123"
   * });
   */
  mapOutputs(outputKey, result, metadata = {}) {
    return this.set(outputKey, result, metadata);
  }

  // ========================================
  // Phase A: 异步持久化与恢复
  // ========================================

  /**
   * 序列化 Blackboard 数据（用于持久化）
   * @returns {Object} 可 JSON 序列化的数据对象
   */
  serialize() {
    return {
      data: { ...this.data },
      metadata: { ...this.metadata },
      historyLength: this.history.length,
      // 只保存最近 50 条历史（避免数据过大）
      recentHistory: this.history.slice(-50),
      serializedAt: new Date().toISOString(),
    };
  }

  /**
   * 从序列化数据恢复 Blackboard
   * @param {Object} serialized - 序列化的数据
   * @returns {Blackboard} this（支持链式调用）
   */
  deserialize(serialized) {
    if (serialized?.data) {
      this.data = { ...serialized.data };
    }
    if (serialized?.metadata) {
      this.metadata = { ...serialized.metadata };
    }
    // 恢复历史（可选）
    if (serialized?.recentHistory && Array.isArray(serialized.recentHistory)) {
      this.history = [...serialized.recentHistory];
    }

    // 记录一条恢复历史
    this.history.push({
      action: "restore",
      timestamp: new Date().toISOString(),
      restoredKeys: Object.keys(this.data),
      originalHistoryLength: serialized?.historyLength || 0,
    });

    return this;
  }

  /**
   * 获取所有 key 列表
   * @returns {string[]} key 数组
   */
  keys() {
    return Object.keys(this.data);
  }

  /**
   * 获取数据条目数量
   * @returns {number}
   */
  size() {
    return Object.keys(this.data).length;
  }

  /**
   * 检查是否为空
   * @returns {boolean}
   */
  isEmpty() {
    return this.size() === 0;
  }

  /**
   * 获取摘要信息（用于日志和调试）
   * @returns {Object}
   */
  getSummary() {
    return {
      keyCount: this.size(),
      keys: this.keys(),
      historyCount: this.history.length,
      lastUpdated:
        this.history.length > 0
          ? this.history[this.history.length - 1].timestamp
          : null,
    };
  }
}

module.exports = Blackboard;
