/**
 * 测试上下文窗口分配算法
 * 
 * 用法:
 * node server/scripts/maintenance/testContextAllocation.js
 */

const {
  getModelContextWindow,
  calculateContextAllocation,
  DEFAULT_ALLOCATION_STRATEGY,
} = require("../../utils/chats/contextAllocation");

// 颜色输出
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  red: "\x1b[31m",
};

function log(message, color = "reset") {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function section(title) {
  console.log("\n" + "=".repeat(60));
  log(title, "blue");
  console.log("=".repeat(60) + "\n");
}

// 测试 1: 测试模型上下文窗口识别
function test1_modelContextWindow() {
  section("测试 1: 模型上下文窗口识别");
  
  const testCases = [
    { model: "gpt-4", expected: 8192 },
    { model: "gpt-4-0613", expected: 8192 },
    { model: "gpt-4-turbo", expected: 128000 },
    { model: "claude-3-sonnet", expected: 200000 },
    { model: "gemini-1.5-pro", expected: 1000000 },
    { model: "qwen-7b", expected: 8192 },
    { model: "unknown-model", expected: 4096 },
  ];
  
  let passed = 0;
  let failed = 0;
  
  testCases.forEach(({ model, expected }) => {
    const actual = getModelContextWindow(model);
    if (actual === expected) {
      log(`✅ ${model}: ${actual} tokens`, "green");
      passed++;
    } else {
      log(`❌ ${model}: expected ${expected}, got ${actual}`, "red");
      failed++;
    }
  });
  
  log(`\n总计: ${passed} 通过, ${failed} 失败`, failed === 0 ? "green" : "red");
  return failed === 0;
}

// 测试 2: 测试基础分配
function test2_basicAllocation() {
  section("测试 2: 基础分配");
  
  const result = calculateContextAllocation({
    modelName: "gpt-4",
    hasGraphContext: true,
    hasVectorContext: true,
  });
  
  log(`模型: ${result.metadata.modelName}`, "blue");
  log(`上下文窗口: ${result.contextWindow} tokens`, "blue");
  log(`总预算: ${result.totalBudget} tokens (70% of context window)`, "blue");
  log("", "blue");
  log("分配结果:", "yellow");
  log(`  对话历史: ${result.allocation.conversationHistory} tokens (${((result.allocation.conversationHistory / result.totalBudget) * 100).toFixed(1)}%)`, "yellow");
  log(`  向量检索: ${result.allocation.vectorRAG} tokens (${((result.allocation.vectorRAG / result.totalBudget) * 100).toFixed(1)}%)`, "yellow");
  log(`  图谱上下文: ${result.allocation.graphContext} tokens (${((result.allocation.graphContext / result.totalBudget) * 100).toFixed(1)}%)`, "yellow");
  
  // 验证总和
  const total = result.allocation.conversationHistory + result.allocation.vectorRAG + result.allocation.graphContext;
  const isValid = total <= result.totalBudget;
  
  log(`\n总计: ${total} tokens`, isValid ? "green" : "red");
  log(isValid ? "✅ 分配有效" : "❌ 分配超出预算", isValid ? "green" : "red");
  
  return isValid;
}

// 测试 3: 测试动态调整 (图谱为空)
function test3_graphEmpty() {
  section("测试 3: 动态调整 (图谱为空)");
  
  const result = calculateContextAllocation({
    modelName: "gpt-4",
    hasGraphContext: false,  // 图谱为空
    hasVectorContext: true,
  });
  
  log(`图谱上下文: ${result.allocation.graphContext} tokens`, "yellow");
  log(`向量检索: ${result.allocation.vectorRAG} tokens`, "yellow");
  
  const isValid = result.allocation.graphContext === 0 && result.allocation.vectorRAG > 0;
  log(isValid ? "✅ 图谱预算已重新分配给向量检索" : "❌ 动态调整失败", isValid ? "green" : "red");
  
  return isValid;
}

// 测试 4: 测试动态调整 (向量为空)
function test4_vectorEmpty() {
  section("测试 4: 动态调整 (向量为空)");
  
  const result = calculateContextAllocation({
    modelName: "gpt-4",
    hasGraphContext: true,
    hasVectorContext: false,  // 向量为空
  });
  
  log(`图谱上下文: ${result.allocation.graphContext} tokens`, "yellow");
  log(`向量检索: ${result.allocation.vectorRAG} tokens`, "yellow");
  
  const isValid = result.allocation.vectorRAG === 0 && result.allocation.graphContext > 0;
  log(isValid ? "✅ 向量预算已重新分配给图谱上下文" : "❌ 动态调整失败", isValid ? "green" : "red");
  
  return isValid;
}

// 测试 5: 测试大模型 (Claude)
function test5_largeModel() {
  section("测试 5: 大模型 (Claude 3 Sonnet)");
  
  const result = calculateContextAllocation({
    modelName: "claude-3-sonnet",
    hasGraphContext: true,
    hasVectorContext: true,
  });
  
  log(`模型: ${result.metadata.modelName}`, "blue");
  log(`上下文窗口: ${result.contextWindow} tokens`, "blue");
  log(`总预算: ${result.totalBudget} tokens`, "blue");
  log("", "blue");
  log("分配结果:", "yellow");
  log(`  对话历史: ${result.allocation.conversationHistory} tokens`, "yellow");
  log(`  向量检索: ${result.allocation.vectorRAG} tokens`, "yellow");
  log(`  图谱上下文: ${result.allocation.graphContext} tokens`, "yellow");
  
  const isValid = result.totalBudget > 100000;  // Claude 应该有很大的预算
  log(isValid ? "✅ 大模型预算充足" : "❌ 大模型预算不足", isValid ? "green" : "red");
  
  return isValid;
}

// 主函数
async function main() {
  console.log("\n");
  log("========== 上下文窗口分配算法测试 ==========", "blue");
  console.log("\n");
  
  const results = [];
  
  results.push(test1_modelContextWindow());
  results.push(test2_basicAllocation());
  results.push(test3_graphEmpty());
  results.push(test4_vectorEmpty());
  results.push(test5_largeModel());
  
  // 总结
  section("测试总结");
  
  const passed = results.filter(r => r).length;
  const failed = results.length - passed;
  
  log(`总计: ${passed} / ${results.length} 通过`, failed === 0 ? "green" : "red");
  
  if (failed === 0) {
    log("\n✅ 所有测试通过!", "green");
  } else {
    log(`\n❌ ${failed} 个测试失败`, "red");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("❌ 错误:", e);
  process.exit(1);
});

