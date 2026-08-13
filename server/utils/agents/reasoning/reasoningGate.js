/**
 * reasoningGate.js — Cap2 reasoning 事件管线：flag 门控 + 流控截断
 *
 * 设计原则：
 * - REASONING_STREAMS_ENABLED 默认未设置/非 "true" → isReasoningEnabled() === false
 * - flag 关 → createAIbitat 中 controller = null → eventHandler 直接 return → 零影响
 * - reasoning content 绝对不进 textResponse（eventHandler 内 early return）
 */

/**
 * 判断 reasoning stream 功能是否开启
 * @param {object} env - 注入的环境变量对象（默认 process.env）
 * @returns {boolean}
 */
function isReasoningEnabled(env = process.env) {
  return String(env.REASONING_STREAMS_ENABLED || "").toLowerCase() === "true";
}

/**
 * 创建每次 run 独立的流控制器
 * - 超限后发一次 truncate:true，之后 emit:false 静默丢弃
 *
 * @param {{ maxChars?: number, maxChunks?: number }} options
 * @returns {{ accept(content: string): {emit:boolean, content?:string, truncate?:boolean}, truncated: boolean }}
 */
function createReasoningStreamController({ maxChars = 8000, maxChunks = 400 } = {}) {
  let chars = 0;
  let chunks = 0;
  let truncated = false;

  return {
    /**
     * 决定是否发送该 reasoning chunk
     * @param {string|any} content
     * @returns {{ emit: boolean, content?: string, truncate?: boolean }}
     */
    accept(content) {
      if (truncated) return { emit: false };

      const s = String(content ?? "");
      if (chunks >= maxChunks || chars + s.length > maxChars) {
        truncated = true;
        return { emit: true, content: "", truncate: true };
      }
      chunks++;
      chars += s.length;
      return { emit: true, content: s, truncate: false };
    },

    get truncated() {
      return truncated;
    },
  };
}

module.exports = { isReasoningEnabled, createReasoningStreamController };
