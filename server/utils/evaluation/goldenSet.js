/**
 * Golden Set Manager - 评测数据集管理
 *
 * 管理四类场景的评测数据集，支持：
 * - 加载/保存 JSON 格式数据集
 * - 数据验证（JSON Schema）
 * - 数据集采样与分组
 *
 * @module evaluation/goldenSet
 */

const fs = require("fs");
const path = require("path");

/**
 * Golden Set 数据项 Schema
 * @typedef {Object} GoldenSetItem
 * @property {string} id - 唯一标识
 * @property {string} input - 用户输入
 * @property {string|Object} expectedOutput - 期望输出
 * @property {string} category - 分类（如 FAQ、合同审核、季度报告等）
 * @property {string[]} tags - 标签（如 difficulty:hard, domain:finance）
 * @property {string} difficulty - 难度：easy | medium | hard
 * @property {Object} metadata - 扩展元数据
 */

/**
 * Golden Set Manager 类
 */
class GoldenSetManager {
  /**
   * @param {string} scenario - 场景类型
   */
  constructor(scenario) {
    this.scenario = scenario;
    this.items = [];
    this.dataDir = path.join(__dirname, "data", scenario);
  }

  /**
   * 从 JSON 文件加载数据集
   * @param {string} filePath - 文件路径（相对于 data 目录或绝对路径）
   * @returns {GoldenSetItem[]} 数据集
   */
  load(filePath) {
    const fullPath = path.isAbsolute(filePath)
      ? filePath
      : path.join(this.dataDir, filePath);

    if (!fs.existsSync(fullPath)) {
      throw new Error(`Golden Set file not found: ${fullPath}`);
    }

    const content = fs.readFileSync(fullPath, "utf-8");
    const data = JSON.parse(content);

    // 验证数据格式
    this.items = this._validate(data.items || data);
    return this.items;
  }

  /**
   * 保存数据集到 JSON 文件
   * @param {string} filePath - 文件路径
   * @param {GoldenSetItem[]} items - 数据集
   */
  save(filePath, items = this.items) {
    const fullPath = path.isAbsolute(filePath)
      ? filePath
      : path.join(this.dataDir, filePath);

    // 确保目录存在
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const data = {
      scenario: this.scenario,
      version: "1.0",
      createdAt: new Date().toISOString(),
      itemCount: items.length,
      items,
    };

    fs.writeFileSync(fullPath, JSON.stringify(data, null, 2), "utf-8");
  }

  /**
   * 验证数据格式
   * @private
   * @param {Array} items - 待验证的数据
   * @returns {GoldenSetItem[]} 验证后的数据
   */
  _validate(items) {
    if (!Array.isArray(items)) {
      throw new Error("Golden Set must be an array of items");
    }

    return items.map((item, index) => {
      if (!item.id) item.id = `${this.scenario}-${index + 1}`;
      if (!item.input)
        throw new Error(`Item ${index} missing required field: input`);
      if (!item.expectedOutput)
        throw new Error(`Item ${index} missing required field: expectedOutput`);

      return {
        id: item.id,
        input: item.input,
        expectedOutput: item.expectedOutput,
        category: item.category || "default",
        tags: item.tags || [],
        difficulty: item.difficulty || "medium",
        metadata: item.metadata || {},
      };
    });
  }

  /**
   * 按分类筛选
   * @param {string} category - 分类名
   * @returns {GoldenSetItem[]} 筛选结果
   */
  filterByCategory(category) {
    return this.items.filter((item) => item.category === category);
  }

  /**
   * 按难度筛选
   * @param {string} difficulty - 难度：easy | medium | hard
   * @returns {GoldenSetItem[]} 筛选结果
   */
  filterByDifficulty(difficulty) {
    return this.items.filter((item) => item.difficulty === difficulty);
  }

  /**
   * 随机采样
   * @param {number} count - 采样数量
   * @returns {GoldenSetItem[]} 采样结果
   */
  sample(count) {
    const shuffled = [...this.items].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, Math.min(count, shuffled.length));
  }

  /**
   * 获取统计信息
   * @returns {Object} 统计信息
   */
  getStats() {
    const categories = {};
    const difficulties = { easy: 0, medium: 0, hard: 0 };

    this.items.forEach((item) => {
      categories[item.category] = (categories[item.category] || 0) + 1;
      if (difficulties[item.difficulty] !== undefined) {
        difficulties[item.difficulty]++;
      }
    });

    return {
      total: this.items.length,
      categories,
      difficulties,
    };
  }
}

module.exports = GoldenSetManager;
