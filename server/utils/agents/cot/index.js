/**
 * Chain-of-Thought (CoT) 提示词增强模块
 *
 * 该模块为 Agent 提供任务分解和规划能力，通过结构化的思维链引导 LLM：
 * 1. 分析任务复杂度
 * 2. 分解为可执行的子步骤
 * 3. 规划工具调用顺序
 * 4. 执行并汇总结果
 *
 * @module server/utils/agents/cot
 */

const COT_ENHANCEMENT_PROMPT = `
## 任务分解与执行能力

当你收到一个任务时，请遵循以下思维框架：

### 第一步：任务分析
- 判断任务是否可以直接回答（简单问题）还是需要分步执行（复杂任务）
- 如果是复杂任务，识别任务的核心目标和约束条件

### 第二步：规划执行步骤
对于复杂任务，请先在心中规划（不要输出），然后按步骤执行：
1. 确定需要哪些信息或资源
2. 选择合适的工具来获取信息
3. 按逻辑顺序执行各步骤
4. 综合所有结果给出最终回答

### 第三步：工具使用原则
- 优先使用可用的工具来获取准确信息
- 如果有多个工具可选，选择最直接有效的
- 如果一个工具的输出是另一个工具的输入，请按正确顺序调用
- 每次工具调用后，评估结果是否满足需求

### 📝 文档生成工具选择规则（重要）
根据用户请求的**输出格式**选择正确的工具：

| 用户需求关键词 | 应使用工具 | 输出格式 |
|--------------|-----------|---------|
| PPT、演示文稿、幻灯片、汇报材料、presentation、slides | **ppt-outline-flow** | .pptx |
| Word、公文、通知、报告、文档、docx | generate-official-document | .docx |
| Excel、表格、数据报表 | generate-excel-report | .xlsx |
| PDF | generate-pdf-document | .pdf |

⚠️ **严格区分**：
- 用户说"PPT"/"演示文稿"/"幻灯片" → **必须**使用 ppt-outline-flow，禁止使用 generate-official-document
- 用户说"Word"/"公文"/"文档" → 使用 generate-official-document，禁止使用 ppt-outline-flow

### 🎯 PPT 生成工作流程（重要）
PPT 生成分两步，**不要跳步或重复**：

| 步骤 | 用户输入 | 应调用工具 | 调用方式 |
|-----|---------|-----------|---------|
| 1️⃣ | "帮我做PPT"、"生成演示文稿" | **ppt-outline-flow** | 传入 query 等参数 |
| 2️⃣ | "确认"、"可以"、"开始生成" | **ppt-generate-flow** | **无需参数**，直接调用 |

⚠️ **关键规则**：
- 用户确认大纲后 → **必须**调用 ppt-generate-flow，**禁止**再次调用 ppt-outline-flow
- ppt-generate-flow **不需要传 outline 参数**，会自动从上下文获取！直接调用即可。

### ⏰ 时间感知规则（重要）
你的训练数据有时间截止，可能不知道当前的准确日期。当任务涉及以下场景时，**必须先调用 datetime-info 工具获取当前时间**：
- 撰写通知、公告、文件、合同等正式文档（确定正确的年份）
- 讨论"即将到来的"、"下一个"节假日或事件
- 任何涉及"下周/下月/明年/今年"等相对时间表述
- 生成日程、会议安排、截止日期、时间表
- 判断某个日期是过去还是未来
- 计算日期差、倒计时、周年纪念等

### 📊 数据文件分析规则（重要）
当用户提到上传了 CSV 或 Excel 文件，或消息中包含 "workspace-" 开头的文件路径时：

**这些文件存储在临时分析层（S3/MinIO），不是知识库文档，请勿使用 RAG 搜索！必须使用 DuckDB 工具分析。**

**如果你具有 duckdb 工具**（可能显示为 duckdb-agent#duckdb-list-files 或 duckdb-list-files），请**立即调用工具**：
1. **必须先调用** duckdb-list-files 工具，参数 workspace_id 从文件路径 "workspace-{id}/..." 中提取
2. 然后调用 duckdb-get-file-schema 获取列结构（需要 workspace_id 和 file_key）
3. 最后调用 duckdb-query 执行 SQL 分析（需要 workspace_id 和 sql）

⚠️ **重要**：收到数据分析请求时，必须调用工具，不要尝试直接回答或搜索知识库！

**如果你没有 duckdb 工具**，请引导用户：
"抱歉，数据文件分析不在我的专业范围内。建议您切换到**数据分析师**或**市场调研助手**来处理这个数据文件。"

### 第四步：结果汇总
- 综合所有步骤的结果
- 用清晰、结构化的方式呈现最终答案
- 如果任务无法完成，说明原因和可能的替代方案
`;

/**
 * CoT 增强类型枚举
 * @readonly
 * @enum {string}
 */
const COT_MODES = {
  /** 标准模式：注入基础的任务分解提示 */
  STANDARD: "standard",
  /** 详细模式：包含更多思维过程的引导 */
  DETAILED: "detailed",
  /** 禁用模式：不注入 CoT 提示 */
  DISABLED: "disabled",
};

/**
 * 获取 CoT 增强提示词
 * @param {string} mode - CoT 模式
 * @param {Object} options - 可选配置
 * @param {string[]} options.availableTools - 可用工具列表
 * @param {string[]} options.availableFlows - 可用 Flow 列表
 * @returns {string} CoT 增强提示词
 */
function getCotEnhancement(mode = COT_MODES.STANDARD, options = {}) {
  if (mode === COT_MODES.DISABLED) {
    return "";
  }

  let enhancement = COT_ENHANCEMENT_PROMPT;

  // 防御性编程：确保 options 是对象
  const safeOptions = options || {};

  // 如果提供了可用工具列表，添加工具感知能力
  if (safeOptions.availableTools && safeOptions.availableTools.length > 0) {
    enhancement += `\n\n### 当前可用工具\n你可以使用以下工具来完成任务：\n`;
    enhancement += safeOptions.availableTools
      .map((tool) => `- ${tool}`)
      .join("\n");
  }

  // 如果提供了可用 Flow 列表，添加 Flow 感知能力
  if (safeOptions.availableFlows && safeOptions.availableFlows.length > 0) {
    enhancement += `\n\n### 当前可用工作流\n以下是预定义的工作流，可用于处理复杂任务：\n`;
    enhancement += safeOptions.availableFlows
      .map((flow) => `- ${flow}`)
      .join("\n");
  }

  return enhancement;
}

/**
 * 将 CoT 增强注入到系统提示词
 * @param {string} basePrompt - 原始系统提示词
 * @param {string} mode - CoT 模式
 * @param {Object} options - 可选配置
 * @returns {string} 增强后的系统提示词
 */
function enhanceSystemPrompt(
  basePrompt,
  mode = COT_MODES.STANDARD,
  options = {}
) {
  const cotEnhancement = getCotEnhancement(mode, options);

  if (!cotEnhancement) {
    return basePrompt;
  }

  // 将 CoT 增强附加到基础提示词之后
  return `${basePrompt}\n\n${cotEnhancement}`;
}

/**
 * 判断是否应该启用 CoT（基于任务复杂度）
 * @param {string} userPrompt - 用户输入
 * @returns {boolean} 是否启用 CoT
 */
function shouldEnableCot(userPrompt) {
  if (!userPrompt || typeof userPrompt !== "string") {
    return false;
  }

  // 简单启发式判断：长度超过 50 字符，或包含复杂任务关键词
  const complexKeywords = [
    "分析",
    "调研",
    "比较",
    "总结",
    "规划",
    "设计",
    "研究",
    "报告",
    "评估",
    "优化",
    "制定",
    "整理",
    "analyze",
    "research",
    "compare",
    "summarize",
    "plan",
    "design",
    "evaluate",
    "optimize",
    "create",
    "develop",
  ];

  const isLongPrompt = userPrompt.length > 50;
  const hasComplexKeyword = complexKeywords.some((kw) =>
    userPrompt.toLowerCase().includes(kw.toLowerCase())
  );

  return isLongPrompt || hasComplexKeyword;
}

module.exports = {
  COT_ENHANCEMENT_PROMPT,
  COT_MODES,
  getCotEnhancement,
  enhanceSystemPrompt,
  shouldEnableCot,
};
