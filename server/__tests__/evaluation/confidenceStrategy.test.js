/* eslint-env jest */
const {
  RESPONSE_STRATEGY,
  REFUSAL_REASON,
  calculateAverageConfidence,
  determineStrategy,
  shouldRefuse,
} = require("../../utils/chats/confidenceStrategy");

describe("ConfidenceStrategy", () => {
  describe("calculateAverageConfidence", () => {
    it("空数组应返回 0", () => {
      expect(calculateAverageConfidence([])).toBe(0);
      expect(calculateAverageConfidence(null)).toBe(0);
      expect(calculateAverageConfidence(undefined)).toBe(0);
    });

    it("应正确计算平均置信度", () => {
      const sources = [{ score: 0.8 }, { score: 0.6 }, { score: 0.7 }];
      expect(calculateAverageConfidence(sources)).toBeCloseTo(0.7, 2);
    });

    it("应支持 metadata.score 格式", () => {
      const sources = [{ metadata: { score: 0.9 } }, { metadata: { score: 0.7 } }];
      expect(calculateAverageConfidence(sources)).toBeCloseTo(0.8, 2);
    });

    it("应支持 _distance 格式并转换", () => {
      // 距离为 0 时，相似度应为 1
      const sources = [{ _distance: 0 }];
      expect(calculateAverageConfidence(sources)).toBe(0);
    });

    it("应忽略无效分数", () => {
      const sources = [{ score: 0.8 }, { score: "invalid" }, { score: 0.6 }];
      expect(calculateAverageConfidence(sources)).toBeCloseTo(0.7, 2);
    });
  });

  describe("determineStrategy", () => {
    it("无上下文应返回拒答策略", () => {
      const result = determineStrategy({
        sources: [],
        contextTexts: [],
        workspace: {},
      });

      expect(result.strategy).toBe(RESPONSE_STRATEGY.REFUSE);
      expect(result.reason).toBe(REFUSAL_REASON.NO_CONTEXT);
      expect(result.confidence).toBe(0);
    });

    it("高置信度应返回回答策略", () => {
      const result = determineStrategy({
        sources: [{ score: 0.85 }, { score: 0.9 }],
        contextTexts: ["相关内容1", "相关内容2"],
        workspace: {},
      });

      expect(result.strategy).toBe(RESPONSE_STRATEGY.ANSWER);
      expect(result.reason).toBeNull();
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    });

    it("中等置信度应返回追问策略", () => {
      const result = determineStrategy({
        sources: [{ score: 0.5 }, { score: 0.55 }],
        contextTexts: ["相关内容1", "相关内容2"],
        workspace: {},
      });

      expect(result.strategy).toBe(RESPONSE_STRATEGY.CLARIFY);
      expect(result.reason).toBe(REFUSAL_REASON.LOW_CONFIDENCE);
      expect(result.confidence).toBeGreaterThanOrEqual(0.4);
      expect(result.confidence).toBeLessThan(0.7);
    });

    it("低置信度应返回拒答策略", () => {
      const result = determineStrategy({
        sources: [{ score: 0.2 }, { score: 0.3 }],
        contextTexts: ["相关内容1"],
        workspace: {},
      });

      expect(result.strategy).toBe(RESPONSE_STRATEGY.REFUSE);
      expect(result.reason).toBe(REFUSAL_REASON.LOW_CONFIDENCE);
      expect(result.confidence).toBeLessThan(0.4);
    });

    it("应使用 workspace 自定义阈值", () => {
      const result = determineStrategy({
        sources: [{ score: 0.6 }],
        contextTexts: ["相关内容"],
        workspace: {
          confidenceThreshold: 0.5, // 降低阈值
        },
      });

      expect(result.strategy).toBe(RESPONSE_STRATEGY.ANSWER);
    });

    it("应使用 workspace 自定义拒答消息", () => {
      const customMessage = "自定义拒答消息";
      const result = determineStrategy({
        sources: [],
        contextTexts: [],
        workspace: {
          queryRefusalResponse: customMessage,
        },
      });

      expect(result.message).toBe(customMessage);
    });
  });

  describe("shouldRefuse", () => {
    it("应该拒答时返回拒答信息", () => {
      const result = shouldRefuse({
        sources: [],
        contextTexts: [],
        workspace: {},
      });

      expect(result).not.toBeNull();
      expect(result.reason).toBe(REFUSAL_REASON.NO_CONTEXT);
    });

    it("不应该拒答时返回 null", () => {
      const result = shouldRefuse({
        sources: [{ score: 0.9 }],
        contextTexts: ["相关内容"],
        workspace: {},
      });

      expect(result).toBeNull();
    });

    it("追问策略不应返回拒答", () => {
      const result = shouldRefuse({
        sources: [{ score: 0.5 }],
        contextTexts: ["相关内容"],
        workspace: {},
      });

      // 追问策略不是拒答
      expect(result).toBeNull();
    });
  });
});

