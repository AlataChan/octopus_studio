/**
 * CoT 集成测试
 * 验证 CoT 增强与 Agent 系统的集成
 */

const { COT_MODES, enhanceSystemPrompt, shouldEnableCot } = require('../../utils/agents/cot');

describe('CoT Integration Tests', () => {
  describe('System Prompt Enhancement', () => {
    const basePrompt = `You are a helpful AI assistant for the workspace "Test Workspace".
You have access to various tools and can help users with their tasks.`;

    it('should enhance system prompt with CoT capabilities', () => {
      const enhanced = enhanceSystemPrompt(basePrompt, COT_MODES.STANDARD);

      // 验证基础提示词保留
      expect(enhanced).toContain('helpful AI assistant');
      expect(enhanced).toContain('Test Workspace');

      // 验证 CoT 增强内容
      expect(enhanced).toContain('任务分解与执行能力');
      expect(enhanced).toContain('第一步：任务分析');
      expect(enhanced).toContain('第二步：规划执行步骤');
      expect(enhanced).toContain('第三步：工具使用原则');
      expect(enhanced).toContain('第四步：结果汇总');
    });

    it('should include tool awareness in enhanced prompt', () => {
      const tools = ['web-scraping', 'rag-memory', 'save-file-to-browser'];
      const enhanced = enhanceSystemPrompt(basePrompt, COT_MODES.STANDARD, { availableTools: tools });

      expect(enhanced).toContain('当前可用工具');
      expect(enhanced).toContain('web-scraping');
      expect(enhanced).toContain('rag-memory');
      expect(enhanced).toContain('save-file-to-browser');
    });

    it('should include flow awareness in enhanced prompt', () => {
      const flows = [
        '市场调研流程 (@@flow_abc123)',
        '内容生成流程 (@@flow_def456)',
      ];
      const enhanced = enhanceSystemPrompt(basePrompt, COT_MODES.STANDARD, { availableFlows: flows });

      expect(enhanced).toContain('当前可用工作流');
      expect(enhanced).toContain('市场调研流程');
      expect(enhanced).toContain('内容生成流程');
    });

    it('should include both tools and flows when provided', () => {
      const tools = ['web-scraping'];
      const flows = ['测试流程 (@@flow_test)'];
      const enhanced = enhanceSystemPrompt(basePrompt, COT_MODES.STANDARD, {
        availableTools: tools,
        availableFlows: flows
      });

      expect(enhanced).toContain('当前可用工具');
      expect(enhanced).toContain('当前可用工作流');
    });
  });

  describe('Complex Task Detection', () => {
    it('should detect research tasks', () => {
      expect(shouldEnableCot('帮我调研一下竞品的市场策略')).toBe(true);
      expect(shouldEnableCot('research the market trends')).toBe(true);
    });

    it('should detect analysis tasks', () => {
      expect(shouldEnableCot('分析这份数据报告')).toBe(true);
      expect(shouldEnableCot('analyze the sales data')).toBe(true);
    });

    it('should detect comparison tasks', () => {
      expect(shouldEnableCot('比较这两个方案的优缺点')).toBe(true);
      expect(shouldEnableCot('compare these two approaches')).toBe(true);
    });

    it('should detect planning tasks', () => {
      expect(shouldEnableCot('规划下个季度的营销活动')).toBe(true);
      expect(shouldEnableCot('plan the project timeline')).toBe(true);
    });

    it('should detect summary tasks', () => {
      expect(shouldEnableCot('总结这篇文章的要点')).toBe(true);
      expect(shouldEnableCot('summarize the meeting notes')).toBe(true);
    });

    it('should not trigger for simple greetings', () => {
      expect(shouldEnableCot('你好')).toBe(false);
      expect(shouldEnableCot('Hello')).toBe(false);
      expect(shouldEnableCot('Hi there')).toBe(false);
    });

    it('should not trigger for simple questions', () => {
      expect(shouldEnableCot('今天天气怎么样')).toBe(false);
      expect(shouldEnableCot('What time is it')).toBe(false);
    });
  });

  describe('CoT Mode Behavior', () => {
    const basePrompt = 'You are a helpful assistant.';

    it('should apply standard mode by default', () => {
      const enhanced = enhanceSystemPrompt(basePrompt);
      expect(enhanced).toContain('任务分解与执行能力');
    });

    it('should not modify prompt when disabled', () => {
      const enhanced = enhanceSystemPrompt(basePrompt, COT_MODES.DISABLED);
      expect(enhanced).toBe(basePrompt);
    });

    it('should apply detailed mode with more instructions', () => {
      const enhanced = enhanceSystemPrompt(basePrompt, COT_MODES.DETAILED);
      expect(enhanced).toContain('任务分解与执行能力');
      // Detailed mode should have the same base content as standard
      // (can be extended in future)
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty base prompt', () => {
      const enhanced = enhanceSystemPrompt('', COT_MODES.STANDARD);
      expect(enhanced).toContain('任务分解与执行能力');
    });

    it('should handle null options gracefully', () => {
      const enhanced = enhanceSystemPrompt('Test', COT_MODES.STANDARD, null);
      expect(enhanced).toContain('Test');
    });

    it('should handle undefined options gracefully', () => {
      const enhanced = enhanceSystemPrompt('Test', COT_MODES.STANDARD, undefined);
      expect(enhanced).toContain('Test');
    });

    it('should handle empty arrays for tools and flows', () => {
      const enhanced = enhanceSystemPrompt('Test', COT_MODES.STANDARD, {
        availableTools: [],
        availableFlows: [],
      });
      expect(enhanced).not.toContain('当前可用工具');
      expect(enhanced).not.toContain('当前可用工作流');
    });
  });
});

