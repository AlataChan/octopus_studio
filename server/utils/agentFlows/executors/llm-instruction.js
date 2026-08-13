/**
 * Execute an LLM instruction flow step
 * 注意：网络错误的重试已在 Provider 层（如 DeepSeek）实现，此处不再重复重试
 * @param {Object} config Flow step configuration
 * @param {{introspect: Function, logger: Function}} context Execution context with introspect function
 * @returns {Promise<string>} Processed result
 */
async function executeLLMInstruction(config, context) {
  const { instruction, resultVariable } = config;
  const { introspect, logger, aibitat } = context;

  logger(
    `\x1b[43m[AgentFlowToolExecutor]\x1b[0m - executing LLM Instruction block`
  );
  introspect(`Processing data with LLM instruction...`);

  // Ensure the input is a string since we are sending it to the LLM direct as a message
  let input = instruction;
  if (typeof input === "object") input = JSON.stringify(input);
  if (typeof input !== "string") input = String(input);

  const provider = aibitat.getProviderForConfig(aibitat.defaultProvider);

  try {
    logger(
      `Sending request to LLM (${aibitat.defaultProvider.provider}::${aibitat.defaultProvider.model})`
    );
    introspect(`Sending request to LLM...`);

    const completion = await provider.complete([
      {
        role: "user",
        content: input,
      },
    ]);

    introspect(`Successfully received LLM response`);
    if (resultVariable) config.resultVariable = resultVariable;

    // provider.complete() 返回 { textResponse, cost }，而不是 { result }
    const responseText = completion.textResponse || completion.result || "";
    logger(`LLM response received (${responseText.length} chars)`);
    return responseText;
  } catch (error) {
    logger(`LLM request failed: ${error.message}`, error);
    introspect(`LLM request failed: ${error.message}`);
    throw new Error(`LLM processing failed: ${error.message}`);
  }
}

module.exports = executeLLMInstruction;
