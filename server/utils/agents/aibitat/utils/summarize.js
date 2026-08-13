const { loadSummarizationChain } = require("langchain/chains");
const { PromptTemplate } = require("@langchain/core/prompts");
const { RecursiveCharacterTextSplitter } = require("@langchain/textsplitters");
const Provider = require("../providers/ai-provider");

/**
 * @typedef {Object} LCSummarizationConfig
 * @property {string} provider The LLM to use for summarization (inherited)
 * @property {string} model The LLM Model to use for summarization (inherited)
 * @property {AbortController['signal']} controllerSignal Abort controller to stop recursive summarization
 * @property {string} content The text content of the text to summarize
 */

/** 单次摘要操作的超时时间（毫秒） */
const SUMMARIZATION_TIMEOUT_MS = 60_000;

/**
 * 静默 tiktoken 未知模型警告的辅助函数
 * LangChain 在使用非 OpenAI 标准模型时会尝试使用 tiktoken 计算 token 数量，
 * 但 tiktoken 不认识这些模型名称，会输出警告。这个警告不影响功能，
 * 因为 LangChain 会回退到近似计算。
 */
function withSilentTiktokenWarning(fn) {
  const originalWarn = console.warn;
  console.warn = (...args) => {
    // 静默 tiktoken 相关的警告
    if (
      args[0] &&
      typeof args[0] === "string" &&
      args[0].includes("Failed to calculate number of tokens")
    ) {
      return;
    }
    originalWarn.apply(console, args);
  };

  return fn().finally(() => {
    console.warn = originalWarn;
  });
}

/**
 * Summarize content using LLM LC-Chain call
 * @param {LCSummarizationConfig} config - The configuration for summarization
 * @returns {Promise<string>} The summarized content.
 */
async function summarizeContent({
  provider = "openai",
  model = null,
  controllerSignal,
  content,
}) {
  const llm = Provider.LangChainChatModel(provider, {
    temperature: 0,
    model: model,
  });

  const textSplitter = new RecursiveCharacterTextSplitter({
    separators: ["\n\n", "\n"],
    chunkSize: 10000,
    chunkOverlap: 500,
  });
  const docs = await textSplitter.createDocuments([content]);

  const mapPrompt = `
      Write a detailed summary of the following text for a research purpose:
      "{text}"
      SUMMARY:
      `;

  const mapPromptTemplate = new PromptTemplate({
    template: mapPrompt,
    inputVariables: ["text"],
  });

  // This convenience function creates a document chain prompted to summarize a set of documents.
  // Note: verbose 模式会将内部日志输出到 stdout，在 Agent 流式响应中可能被错误地发送到前端
  // 因此在所有环境下都关闭 verbose 模式
  const chain = loadSummarizationChain(llm, {
    type: "map_reduce",
    combinePrompt: mapPromptTemplate,
    combineMapPrompt: mapPromptTemplate,
    verbose: false,
  });

  /**
   * 实际执行摘要调用的封装，统一包一层 tiktoken 警告静默逻辑。
   * 不再向 LangChain 传入 AbortSignal，避免在同一个 AbortSignal 上
   * 被内部多次注册监听器而触发 MaxListenersExceededWarning。
   *
   * 取消控制改为在 summarizeContent 外层单独监听 controllerSignal，
   * 保证最多只在同一个 AbortSignal 上挂载一个监听器。
   * @returns {Promise<import("langchain/chains").ChainValues>}
   */
  const runSummarization = () =>
    withSilentTiktokenWarning(() =>
      chain.call({
        // 注意：这里不要传入 controllerSignal，避免 LangChain 在同一个 AbortSignal 上
        // 注册过多监听器导致 MaxListenersExceededWarning。
        input_documents: docs,
      })
    );

  // 如果没有传入 controllerSignal，使用带超时的执行
  if (!controllerSignal) {
    return runWithTimeout(runSummarization);
  }

  // 如果有 controllerSignal，则在外层包装一个 Promise，
  // 手动监听 abort 事件并在触发时中断摘要流程，同时添加超时保护。
  return new Promise((resolve, reject) => {
    // 如果在调用前就已经被取消，直接拒绝
    if (controllerSignal.aborted) {
      reject(new Error("Summarization aborted"));
      return;
    }

    let settled = false;

    /** 超时定时器 */
    const timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
      console.warn(
        `[Summarization] Timeout after ${SUMMARIZATION_TIMEOUT_MS / 1000}s`
      );
      reject(
        new Error(
          `Summarization timeout after ${SUMMARIZATION_TIMEOUT_MS / 1000} seconds`
        )
      );
    }, SUMMARIZATION_TIMEOUT_MS);

    /** @type {() => void} */
    const abortHandler = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      reject(new Error("Summarization aborted"));
    };

    controllerSignal.addEventListener("abort", abortHandler);

    runSummarization()
      .then((res) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        resolve(res.text);
      })
      .catch((err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        reject(err);
      })
      .finally(() => {
        controllerSignal.removeEventListener("abort", abortHandler);
      });
  });
}

/**
 * 带超时保护的执行封装（用于无 controllerSignal 的场景）
 * @param {() => Promise<any>} fn - 要执行的异步函数
 * @returns {Promise<string>}
 */
async function runWithTimeout(fn) {
  return new Promise((resolve, reject) => {
    let settled = false;

    const timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
      console.warn(
        `[Summarization] Timeout after ${SUMMARIZATION_TIMEOUT_MS / 1000}s`
      );
      reject(
        new Error(
          `Summarization timeout after ${SUMMARIZATION_TIMEOUT_MS / 1000} seconds`
        )
      );
    }, SUMMARIZATION_TIMEOUT_MS);

    fn()
      .then((res) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        resolve(res.text);
      })
      .catch((err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        reject(err);
      });
  });
}

module.exports = { summarizeContent };
