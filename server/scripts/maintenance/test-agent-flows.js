/**
 * Agent Flow 测试脚本
 * 验证所有 agent flow 的结构正确性和执行逻辑
 * 
 * 运行方式: node server/scripts/maintenance/test-agent-flows.js
 */

const fs = require("fs");
const path = require("path");

const FLOWS_DIR = path.join(__dirname, "../../storage/plugins/agent-flows");
const VALID_STEP_TYPES = ["start", "llmInstruction", "webScraping", "apiCall", "subflow", "finish"];

const results = { total: 0, passed: 0, failed: 0, errors: [] };

/**
 * 验证 URL 格式
 */
function isValidUrl(str) {
  if (!str || typeof str !== "string") return false;
  const trimmed = str.trim();
  if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) return false;
  try {
    const url = new URL(trimmed);
    return url.hostname && (url.hostname.includes(".") || url.hostname === "localhost");
  } catch { return false; }
}

/**
 * 验证单个 flow 文件
 */
function validateFlow(filePath) {
  const errors = [];
  let flow;
  
  try {
    flow = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (e) {
    return { valid: false, errors: ["JSON 解析失败: " + e.message] };
  }
  
  if (!flow.name) errors.push("缺少 name 字段");
  if (!flow.description) errors.push("缺少 description 字段");
  if (!Array.isArray(flow.steps)) {
    errors.push("steps 必须是数组");
    return { valid: false, errors };
  }
  
  const stepTypes = flow.steps.map((s) => s.type);
  stepTypes.forEach((type, i) => {
    if (!VALID_STEP_TYPES.includes(type)) errors.push("步骤 " + (i + 1) + ": 无效类型 \"" + type + "\"");
  });
  
  if (stepTypes[0] !== "start") errors.push("第一步必须是 start");
  if (stepTypes[stepTypes.length - 1] !== "finish") errors.push("最后一步必须是 finish");
  
  // 收集变量
  const definedVars = new Set();
  const startStep = flow.steps.find((s) => s.type === "start");
  if (startStep && startStep.config && startStep.config.variables) {
    startStep.config.variables.forEach((v) => definedVars.add(v.name));
  }
  
  // 检查变量引用和 directOutput
  const varPattern = /\{\{(\w+)\}\}/g;
  let hasDirectOutput = false;
  
  flow.steps.forEach((step, i) => {
    const configStr = JSON.stringify(step.config || {});
    let match;
    while ((match = varPattern.exec(configStr)) !== null) {
      if (!definedVars.has(match[1])) {
        errors.push("步骤 " + (i + 1) + ": 引用未定义变量 \"{{" + match[1] + "}}\"");
      }
    }
    if (step.config && step.config.resultVariable) definedVars.add(step.config.resultVariable);
    if (step.config && step.config.directOutput === true) hasDirectOutput = true;
  });
  
  const llmSteps = flow.steps.filter((s) => s.type === "llmInstruction");
  if (llmSteps.length > 0 && !hasDirectOutput) {
    errors.push("至少需要一个 llmInstruction 设置 directOutput: true");
  }
  
  return {
    valid: errors.length === 0,
    errors,
    flow: { name: flow.name, stepCount: flow.steps.length, stepTypes: stepTypes.join(" -> ") },
  };
}

/**
 * 测试 URL 验证
 */
function testUrlValidation() {
  console.log("\n📋 测试 URL 验证函数...\n");
  const cases = [
    ["https://example.com", true], ["http://example.com", true],
    ["https://google.com/search?q=test", true], ["http://localhost:3000", true],
    ["", false], [null, false], [undefined, false],
    ["无人机市场分析", false], ["how to build a drone", false],
    ["example.com", false], ["ftp://example.com", false],
  ];
  
  let passed = 0;
  cases.forEach(function(c) {
    const result = isValidUrl(c[0]);
    if (result === c[1]) {
      passed++;
      console.log("  ✅ \"" + c[0] + "\" -> " + result);
    } else {
      console.log("  ❌ \"" + c[0] + "\" -> 期望 " + c[1] + ", 实际 " + result);
    }
  });
  console.log("\n  URL 验证: " + passed + "/" + cases.length + " 通过\n");
  return passed === cases.length;
}

/**
 * 测试变量替换
 */
function testVariableReplacement() {
  console.log("📋 测试变量替换...\n");
  const { FlowExecutor } = require("../../utils/agentFlows/executor");
  const executor = new FlowExecutor();
  
  executor.variables = { topic: "AI 技术", data: "测试数据" };
  const result = executor.replaceVariables("主题: {{topic}}, 数据: {{data}}");
  
  if (result === "主题: AI 技术, 数据: 测试数据") {
    console.log("  ✅ 字符串变量替换正常");
  } else {
    console.log("  ❌ 字符串替换失败: \"" + result + "\"");
    results.failed++;
  }
  
  executor.variables = { url: "https://example.com" };
  const obj = executor.replaceVariables({ url: "{{url}}", mode: "text" });
  if (obj.url === "https://example.com") {
    console.log("  ✅ 对象变量替换正常\n");
  } else {
    console.log("  ❌ 对象替换失败: " + JSON.stringify(obj) + "\n");
    results.failed++;
  }
}

/**
 * 验证所有 flow 文件
 */
function validateAllFlows() {
  console.log("📋 验证 Agent Flow 文件...\n");
  
  if (!fs.existsSync(FLOWS_DIR)) {
    console.log("❌ 目录不存在: " + FLOWS_DIR + "\n   请先运行 fix-agent-flows.js\n");
    return;
  }
  
  const files = fs.readdirSync(FLOWS_DIR).filter((f) => f.endsWith(".json"));
  console.log("  找到 " + files.length + " 个 flow 文件\n");
  
  files.forEach(function(file) {
    results.total++;
    const validation = validateFlow(path.join(FLOWS_DIR, file));
    
    if (validation.valid) {
      results.passed++;
      console.log("  ✅ " + validation.flow.name + "\n     " + validation.flow.stepTypes + "\n");
    } else {
      results.failed++;
      results.errors.push({ file, errors: validation.errors });
      console.log("  ❌ " + (validation.flow ? validation.flow.name : file));
      validation.errors.forEach(function(e) { console.log("     - " + e); });
      console.log("");
    }
  });
}

/**
 * 主函数
 */
function main() {
  console.log("=".repeat(60));
  console.log("🧪 Agent Flow 测试套件");
  console.log("=".repeat(60));
  
  testUrlValidation();
  testVariableReplacement();
  validateAllFlows();
  
  console.log("=".repeat(60));
  console.log("📊 测试总结");
  console.log("=".repeat(60));
  console.log("  Flow 验证: " + results.passed + "/" + results.total + " 通过");
  
  if (results.failed > 0) {
    console.log("\n  ❌ " + results.failed + " 个问题:");
    results.errors.forEach(function(e) {
      console.log("     - " + e.file + ": " + e.errors.join("; "));
    });
  }
  
  console.log("\n" + "=".repeat(60));
  process.exit(results.failed > 0 ? 1 : 0);
}

main();
