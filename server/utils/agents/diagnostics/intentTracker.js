/**
 * @fileoverview 意图追踪器
 * 提取用户原始意图并检测执行过程中的方向偏移
 * @module diagnostics/intentTracker
 * @see docs/ai-employee-autonomy-levels.md Phase L3.2
 */

/**
 * 意图类型枚举
 * @readonly
 * @enum {string}
 */
const IntentCategory = {
  /** 信息查询 */
  QUERY: "query",
  /** 数据分析 */
  ANALYSIS: "analysis",
  /** 内容生成 */
  GENERATION: "generation",
  /** 任务执行 */
  EXECUTION: "execution",
  /** 对话交流 */
  CONVERSATION: "conversation",
  /** 未知 */
  UNKNOWN: "unknown",
};

/**
 * 意图追踪器类
 * 用于提取用户意图并追踪执行过程是否偏离目标
 */
class IntentTracker {
  /**
   * @param {string} originalPrompt - 原始用户输入
   */
  constructor(originalPrompt) {
    /** @type {string} */
    this.originalPrompt = originalPrompt;

    /** @type {Object} */
    this.originalIntent = this.#extractIntent(originalPrompt);

    /** @type {Array<Object>} */
    this.executionHistory = [];

    /** @type {number} */
    this.driftScore = 0;

    /** @type {Array<string>} */
    this.driftReasons = [];
  }

  /**
   * 提取用户意图
   * @private
   * @param {string} prompt - 用户输入
   * @returns {Object} 提取的意图对象
   */
  #extractIntent(prompt) {
    const lowerPrompt = prompt.toLowerCase();

    // 检测意图类别
    const category = this.#detectCategory(lowerPrompt);

    // 提取关键词
    const keywords = this.#extractKeywords(prompt);

    // 提取时间范围（如果有）
    const timeRange = this.#extractTimeRange(prompt);

    // 提取目标实体
    const entities = this.#extractEntities(prompt);

    // 估计预期输出类型
    const expectedOutput = this.#inferExpectedOutput(category, prompt);

    return {
      category,
      keywords,
      timeRange,
      entities,
      expectedOutput,
      goal: this.#summarizeGoal(category, keywords, entities),
      confidence: this.#calculateConfidence(category, keywords),
    };
  }

  /**
   * 检测意图类别
   * @private
   */
  #detectCategory(lowerPrompt) {
    // 查询类关键词
    const queryPatterns = [
      /查[找询看]/,
      /搜索/,
      /是什么/,
      /什么是/,
      /有哪些/,
      /find/i,
      /search/i,
      /what is/i,
      /show me/i,
      /list/i,
    ];

    // 分析类关键词
    const analysisPatterns = [
      /分析/,
      /统计/,
      /对比/,
      /比较/,
      /趋势/,
      /analyz/i,
      /compar/i,
      /trend/i,
      /statistic/i,
    ];

    // 生成类关键词
    const generationPatterns = [
      /写/,
      /生成/,
      /创[建作]/,
      /编写/,
      /撰写/,
      /write/i,
      /generat/i,
      /creat/i,
      /compose/i,
    ];

    // 执行类关键词
    const executionPatterns = [
      /执行/,
      /运行/,
      /操作/,
      /发送/,
      /删除/,
      /更新/,
      /execut/i,
      /run/i,
      /send/i,
      /delet/i,
      /updat/i,
    ];

    if (queryPatterns.some((p) => p.test(lowerPrompt)))
      return IntentCategory.QUERY;
    if (analysisPatterns.some((p) => p.test(lowerPrompt)))
      return IntentCategory.ANALYSIS;
    if (generationPatterns.some((p) => p.test(lowerPrompt)))
      return IntentCategory.GENERATION;
    if (executionPatterns.some((p) => p.test(lowerPrompt)))
      return IntentCategory.EXECUTION;

    return IntentCategory.CONVERSATION;
  }

  /**
   * 提取关键词
   * @private
   */
  #extractKeywords(prompt) {
    // 移除常见停用词后提取关键词
    const stopWords = new Set([
      "的",
      "了",
      "是",
      "在",
      "我",
      "你",
      "他",
      "她",
      "它",
      "这",
      "那",
      "the",
      "a",
      "an",
      "is",
      "are",
      "was",
      "were",
      "be",
      "been",
      "to",
      "of",
      "and",
      "or",
      "for",
      "with",
      "on",
      "at",
      "by",
      "请",
      "帮",
      "帮我",
      "能",
      "可以",
      "想",
      "要",
    ]);

    // 简单分词
    const words = prompt
      .split(/[\s,，。！？!?;；:：、\n]+/)
      .filter((w) => w.length > 1);

    return words.filter((w) => !stopWords.has(w.toLowerCase())).slice(0, 10);
  }

  /**
   * 提取时间范围
   * @private
   */
  #extractTimeRange(prompt) {
    const patterns = [
      {
        regex: /最近(\d+)(天|周|月|年)/,
        unit: ["day", "week", "month", "year"],
      },
      {
        regex: /过去(\d+)(天|周|月|年)/,
        unit: ["day", "week", "month", "year"],
      },
      { regex: /last (\d+) (day|week|month|year)s?/i, unit: null },
      { regex: /今[天日]/, value: { days: 1 } },
      { regex: /本周/, value: { days: 7 } },
      { regex: /本月/, value: { days: 30 } },
    ];

    for (const pattern of patterns) {
      const match = prompt.match(pattern.regex);
      if (match) {
        if (pattern.value) return pattern.value;
        // 解析数量和单位
        const amount = parseInt(match[1]);
        const unitIdx = [
          "天",
          "周",
          "月",
          "年",
          "day",
          "week",
          "month",
          "year",
        ].indexOf(match[2]);
        const unitMap = {
          0: 1,
          1: 7,
          2: 30,
          3: 365,
          4: 1,
          5: 7,
          6: 30,
          7: 365,
        };
        return { days: amount * (unitMap[unitIdx] || 1) };
      }
    }

    return null;
  }

  /**
   * 提取实体
   * @private
   */
  #extractEntities(prompt) {
    const entities = [];

    // URL 模式
    const urlMatch = prompt.match(/https?:\/\/[^\s]+/g);
    if (urlMatch)
      entities.push(...urlMatch.map((u) => ({ type: "url", value: u })));

    // 邮箱模式
    const emailMatch = prompt.match(/[\w.-]+@[\w.-]+\.\w+/g);
    if (emailMatch)
      entities.push(...emailMatch.map((e) => ({ type: "email", value: e })));

    // 数字模式（可能是 ID、数量等）
    const numberMatch = prompt.match(/\b\d{4,}\b/g);
    if (numberMatch)
      entities.push(...numberMatch.map((n) => ({ type: "number", value: n })));

    return entities;
  }

  /**
   * 推断预期输出类型
   * @private
   */
  #inferExpectedOutput(category, prompt) {
    switch (category) {
      case IntentCategory.QUERY:
        return prompt.includes("列表") || /list/i.test(prompt)
          ? "list"
          : "text";
      case IntentCategory.ANALYSIS:
        return prompt.includes("图") || /chart|graph/i.test(prompt)
          ? "chart"
          : "report";
      case IntentCategory.GENERATION:
        return prompt.includes("代码") || /code/i.test(prompt)
          ? "code"
          : "text";
      case IntentCategory.EXECUTION:
        return "confirmation";
      default:
        return "text";
    }
  }

  /**
   * 总结目标
   * @private
   */
  #summarizeGoal(category, keywords, entities) {
    const categoryNames = {
      [IntentCategory.QUERY]: "查询",
      [IntentCategory.ANALYSIS]: "分析",
      [IntentCategory.GENERATION]: "生成",
      [IntentCategory.EXECUTION]: "执行",
      [IntentCategory.CONVERSATION]: "对话",
      [IntentCategory.UNKNOWN]: "处理",
    };

    const keywordStr = keywords.slice(0, 3).join("、");
    return `${categoryNames[category]}关于"${keywordStr}"的请求`;
  }

  /**
   * 计算置信度
   * @private
   */
  #calculateConfidence(category, keywords) {
    let score = 0.5; // 基础分

    // 有明确类别加分
    if (category !== IntentCategory.UNKNOWN) score += 0.2;

    // 有关键词加分
    if (keywords.length > 0) score += Math.min(keywords.length * 0.05, 0.2);

    return Math.min(score, 1.0);
  }

  /**
   * 记录执行步骤
   * @param {Object} step - 步骤信息
   * @param {*} result - 执行结果
   */
  recordStep(step, result) {
    this.executionHistory.push({
      step,
      result,
      timestamp: Date.now(),
    });

    // 更新偏移评分
    this.#updateDriftScore(step, result);
  }

  /**
   * 更新偏移评分
   * @private
   */
  #updateDriftScore(step, result) {
    const { toolName } = step;
    const { category, keywords } = this.originalIntent;

    // 规则 1: 工具与意图类别不匹配
    const toolCategoryMap = {
      "web-scraping": [IntentCategory.QUERY],
      "rag-search": [IntentCategory.QUERY],
      "write-file": [IntentCategory.GENERATION, IntentCategory.EXECUTION],
      "execute-code": [IntentCategory.EXECUTION],
    };

    if (
      toolCategoryMap[toolName] &&
      !toolCategoryMap[toolName].includes(category)
    ) {
      this.driftScore += 0.1;
      this.driftReasons.push(
        `工具 "${toolName}" 与意图类别 "${category}" 不匹配`
      );
    }

    // 规则 2: 步骤过多
    if (this.executionHistory.length > 8) {
      this.driftScore += 0.05;
      this.driftReasons.push("执行步骤数量过多");
    }

    // 规则 3: 重复工具调用
    const toolCounts = {};
    this.executionHistory.forEach((h) => {
      toolCounts[h.step.toolName] = (toolCounts[h.step.toolName] || 0) + 1;
    });
    if (Object.values(toolCounts).some((c) => c >= 4)) {
      this.driftScore += 0.15;
      this.driftReasons.push("存在重复工具调用");
    }
  }

  /**
   * 检查意图对齐
   * @returns {Object} 对齐检查结果
   */
  checkAlignment() {
    const aligned = this.driftScore < 0.3;

    return {
      aligned,
      driftScore: this.driftScore,
      reasons: this.driftReasons,
      stepCount: this.executionHistory.length,
      suggestion: aligned ? null : this.#generateSuggestion(),
    };
  }

  /**
   * 生成纠偏建议
   * @private
   */
  #generateSuggestion() {
    if (this.driftScore >= 0.5) {
      return "执行严重偏离目标，建议中止并重新规划";
    }

    if (this.driftReasons.includes("执行步骤数量过多")) {
      return "步骤过多，建议总结当前结果";
    }

    if (this.driftReasons.some((r) => r.includes("重复"))) {
      return "检测到循环执行，建议尝试其他方法";
    }

    return "执行方向可能有偏差，建议确认后继续";
  }

  /**
   * 获取当前状态摘要
   * @returns {Object} 状态摘要
   */
  getSummary() {
    return {
      originalPrompt: this.originalPrompt,
      originalIntent: this.originalIntent,
      stepsExecuted: this.executionHistory.length,
      driftScore: this.driftScore,
      alignment: this.checkAlignment(),
    };
  }
}

module.exports = {
  IntentTracker,
  IntentCategory,
};
