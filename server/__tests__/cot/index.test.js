/**
 * CoT (Chain-of-Thought) 模块单元测试
 */

const {
  COT_ENHANCEMENT_PROMPT,
  COT_MODES,
  getCotEnhancement,
  enhanceSystemPrompt,
  shouldEnableCot,
} = require('../../utils/agents/cot');

describe('CoT Module', () => {
  describe('COT_MODES', () => {
    it('should have correct mode values', () => {
      expect(COT_MODES.STANDARD).toBe('standard');
      expect(COT_MODES.DETAILED).toBe('detailed');
      expect(COT_MODES.DISABLED).toBe('disabled');
    });
  });

  describe('getCotEnhancement', () => {
    it('should return enhancement prompt for standard mode', () => {
      const enhancement = getCotEnhancement(COT_MODES.STANDARD);
      expect(enhancement).toContain('任务分解与执行能力');
      expect(enhancement).toContain('第一步：任务分析');
    });

    it('should return empty string for disabled mode', () => {
      const enhancement = getCotEnhancement(COT_MODES.DISABLED);
      expect(enhancement).toBe('');
    });

    it('should include available tools when provided', () => {
      const tools = ['web-scraping', 'rag-memory', 'save-file'];
      const enhancement = getCotEnhancement(COT_MODES.STANDARD, { availableTools: tools });

      expect(enhancement).toContain('当前可用工具');
      expect(enhancement).toContain('web-scraping');
      expect(enhancement).toContain('rag-memory');
      expect(enhancement).toContain('save-file');
    });

    it('should include available flows when provided', () => {
      const flows = ['研究报告流程 (@@flow_123)', '数据分析流程 (@@flow_456)'];
      const enhancement = getCotEnhancement(COT_MODES.STANDARD, { availableFlows: flows });

      expect(enhancement).toContain('当前可用工作流');
      expect(enhancement).toContain('研究报告流程');
      expect(enhancement).toContain('数据分析流程');
    });

    it('should include both tools and flows when provided', () => {
      const tools = ['web-scraping'];
      const flows = ['测试流程 (@@flow_test)'];
      const enhancement = getCotEnhancement(COT_MODES.STANDARD, {
        availableTools: tools,
        availableFlows: flows
      });

      expect(enhancement).toContain('当前可用工具');
      expect(enhancement).toContain('当前可用工作流');
    });

    it('should not include tools section when empty array provided', () => {
      const enhancement = getCotEnhancement(COT_MODES.STANDARD, { availableTools: [] });
      expect(enhancement).not.toContain('当前可用工具');
    });
  });

  describe('enhanceSystemPrompt', () => {
    const basePrompt = 'You are a helpful AI assistant.';

    it('should append CoT enhancement to base prompt', () => {
      const enhanced = enhanceSystemPrompt(basePrompt, COT_MODES.STANDARD);

      expect(enhanced).toContain(basePrompt);
      expect(enhanced).toContain('任务分解与执行能力');
      expect(enhanced.indexOf(basePrompt)).toBe(0);
    });

    it('should return base prompt unchanged when disabled', () => {
      const enhanced = enhanceSystemPrompt(basePrompt, COT_MODES.DISABLED);
      expect(enhanced).toBe(basePrompt);
    });

    it('should pass options to getCotEnhancement', () => {
      const tools = ['test-tool'];
      const enhanced = enhanceSystemPrompt(basePrompt, COT_MODES.STANDARD, { availableTools: tools });

      expect(enhanced).toContain('test-tool');
    });
  });

  describe('shouldEnableCot', () => {
    it('should return false for null or undefined input', () => {
      expect(shouldEnableCot(null)).toBe(false);
      expect(shouldEnableCot(undefined)).toBe(false);
    });

    it('should return false for non-string input', () => {
      expect(shouldEnableCot(123)).toBe(false);
      expect(shouldEnableCot({})).toBe(false);
    });

    it('should return false for short simple prompts', () => {
      expect(shouldEnableCot('你好')).toBe(false);
      expect(shouldEnableCot('Hello')).toBe(false);
      expect(shouldEnableCot('今天天气怎么样')).toBe(false);
    });

    it('should return true for long prompts (>50 chars)', () => {
      // 使用更长的字符串确保超过 50 字符
      const longPrompt = 'This is a very long prompt that is definitely more than fifty characters long and should trigger CoT mode';
      expect(longPrompt.length).toBeGreaterThan(50);
      expect(shouldEnableCot(longPrompt)).toBe(true);
    });

    it('should return true for prompts with complex keywords', () => {
      expect(shouldEnableCot('请帮我分析这个问题')).toBe(true);
      expect(shouldEnableCot('帮我调研一下市场')).toBe(true);
      expect(shouldEnableCot('比较这两个方案')).toBe(true);
      expect(shouldEnableCot('总结这篇文章')).toBe(true);
      expect(shouldEnableCot('规划我的项目')).toBe(true);
    });

    it('should return true for English prompts with complex keywords', () => {
      expect(shouldEnableCot('analyze this data')).toBe(true);
      expect(shouldEnableCot('research the market')).toBe(true);
      expect(shouldEnableCot('compare these options')).toBe(true);
      expect(shouldEnableCot('summarize the article')).toBe(true);
    });

    it('should be case-insensitive for keywords', () => {
      expect(shouldEnableCot('ANALYZE this')).toBe(true);
      expect(shouldEnableCot('Research This')).toBe(true);
    });
  });

  describe('COT_ENHANCEMENT_PROMPT', () => {
    it('should contain all four steps', () => {
      expect(COT_ENHANCEMENT_PROMPT).toContain('第一步');
      expect(COT_ENHANCEMENT_PROMPT).toContain('第二步');
      expect(COT_ENHANCEMENT_PROMPT).toContain('第三步');
      expect(COT_ENHANCEMENT_PROMPT).toContain('第四步');
    });
  });
});

