/**
 * Evaluation Runner - 评测执行器
 *
 * 批量运行 Golden Set 评测，支持：
 * - 并行/串行执行
 * - 进度回调
 * - 结果导出
 *
 * @module evaluation/runner
 */

const GoldenSetManager = require("./goldenSet");
const MetricsCalculator = require("./metrics");

/**
 * 评测执行器类
 */
class EvaluationRunner {
  /**
   * @param {Object} options - 配置选项
   * @param {string} options.scenario - 场景类型
   * @param {string} options.goldenSetPath - Golden Set 文件路径
   * @param {MetricsCalculator} options.metricsCalculator - 指标计算器
   */
  constructor(options = {}) {
    this.scenario = options.scenario;
    this.goldenSetPath = options.goldenSetPath;
    this.goldenSetManager = new GoldenSetManager(options.scenario);
    this.metricsCalculator =
      options.metricsCalculator || new MetricsCalculator(options.scenario);
    this.evaluator = null; // 待注入的评测函数
    this.onProgress = null; // 进度回调
  }

  /**
   * 设置评测函数
   * @param {Function} evaluator - 评测函数 (input) => Promise<{ output, metadata }>
   */
  setEvaluator(evaluator) {
    if (typeof evaluator !== "function") {
      throw new Error("Evaluator must be a function");
    }
    this.evaluator = evaluator;
  }

  /**
   * 设置进度回调
   * @param {Function} callback - 回调函数 ({ current, total, item, result }) => void
   */
  setProgressCallback(callback) {
    this.onProgress = callback;
  }

  /**
   * 加载 Golden Set
   * @param {string} filePath - 文件路径（可选，覆盖构造时传入的路径）
   */
  loadGoldenSet(filePath) {
    const path = filePath || this.goldenSetPath;
    if (!path) {
      throw new Error("Golden Set path not specified");
    }
    return this.goldenSetManager.load(path);
  }

  /**
   * 运行评测
   * @param {Object} options - 运行选项
   * @param {number} options.concurrency - 并发数（默认 1，串行）
   * @param {number} options.sampleSize - 采样数量（可选，默认全部）
   * @param {string} options.category - 按分类筛选（可选）
   * @param {string} options.difficulty - 按难度筛选（可选）
   * @returns {Promise<Object>} 评测结果
   */
  async run(options = {}) {
    if (!this.evaluator) {
      throw new Error("Evaluator not set. Call setEvaluator() first.");
    }

    const { concurrency = 1, sampleSize, category, difficulty } = options;

    // 获取评测数据
    let items = this.goldenSetManager.items;
    if (category) items = this.goldenSetManager.filterByCategory(category);
    if (difficulty)
      items = this.goldenSetManager.filterByDifficulty(difficulty);
    if (sampleSize) items = this.goldenSetManager.sample(sampleSize);

    if (items.length === 0) {
      throw new Error("No items to evaluate. Load Golden Set first.");
    }

    // 重置指标计算器
    this.metricsCalculator.reset();

    // 执行评测
    const startTime = Date.now();
    const results = await this._executeEvaluation(items, concurrency);
    const endTime = Date.now();

    // 计算指标
    const metrics = this.metricsCalculator.calculate();

    return {
      ...metrics,
      totalDuration: endTime - startTime,
      results,
    };
  }

  /**
   * 执行评测（内部方法）
   * @private
   */
  async _executeEvaluation(items, concurrency) {
    const results = [];
    const total = items.length;

    if (concurrency === 1) {
      // 串行执行
      for (let i = 0; i < items.length; i++) {
        const result = await this._evaluateItem(items[i]);
        results.push(result);
        this._reportProgress(i + 1, total, items[i], result);
      }
    } else {
      // 并行执行（分批）
      for (let i = 0; i < items.length; i += concurrency) {
        const batch = items.slice(i, i + concurrency);
        const batchResults = await Promise.all(
          batch.map((item) => this._evaluateItem(item))
        );
        results.push(...batchResults);

        // 报告进度
        const completed = Math.min(i + concurrency, total);
        this._reportProgress(
          completed,
          total,
          batch[batch.length - 1],
          batchResults[batchResults.length - 1]
        );
      }
    }

    return results;
  }

  /**
   * 评测单个项目
   * @private
   */
  async _evaluateItem(item) {
    const startTime = Date.now();

    try {
      const { output, metadata = {} } = await this.evaluator(item.input, item);
      const latency = Date.now() - startTime;

      // 判断是否正确（简单字符串匹配或委托给 metadata.isCorrect）
      const isCorrect =
        metadata.isCorrect !== undefined
          ? metadata.isCorrect
          : this._compareOutput(output, item.expectedOutput);

      const result = {
        itemId: item.id,
        input: item.input,
        expected: item.expectedOutput,
        actual: output,
        isCorrect,
        latency,
        tokenUsage: metadata.tokenUsage || 0,
        metadata,
      };

      // 添加到指标计算器
      this.metricsCalculator.addResult(result);

      return result;
    } catch (error) {
      const result = {
        itemId: item.id,
        input: item.input,
        expected: item.expectedOutput,
        actual: null,
        isCorrect: false,
        latency: Date.now() - startTime,
        error: error.message,
        metadata: {},
      };

      this.metricsCalculator.addResult(result);
      return result;
    }
  }

  /**
   * 比较输出
   * @private
   */
  _compareOutput(actual, expected) {
    if (typeof expected === "string" && typeof actual === "string") {
      return actual.toLowerCase().includes(expected.toLowerCase());
    }
    return JSON.stringify(actual) === JSON.stringify(expected);
  }

  /**
   * 报告进度
   * @private
   */
  _reportProgress(current, total, item, result) {
    if (typeof this.onProgress === "function") {
      this.onProgress({ current, total, item, result });
    }
  }
}

module.exports = EvaluationRunner;
