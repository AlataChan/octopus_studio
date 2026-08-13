const { webBrowsing } = require("./web-browsing.js");
const { webScraping } = require("./web-scraping.js");
const { websocket } = require("./websocket.js");
const { docSummarizer } = require("./summarize.js");
const { saveFileInBrowser } = require("./save-file-browser.js");
const { chatHistory } = require("./chat-history.js");
const { memory } = require("./memory.js");
const { rechart } = require("./rechart.js");
const { visualGenerate } = require("./visual-generate.js");
const { sqlAgent } = require("./sql-agent/index.js");
const { isLightweightMode } = require("../../../helpers/lightweightMode");

function safeRequire(modulePath) {
  try {
    return require(modulePath);
  } catch {
    return null;
  }
}

const duckdbAgentModule = isLightweightMode()
  ? null
  : safeRequire("./duckdb-agent/index.js");
const duckdbAgent = duckdbAgentModule?.duckdbAgent || null;
const { smartDataRouter } = require("./smart-data-router.js");
const orchestrator = require("./orchestrator.js");
const { dorisDataPlatform } = require("./doris-data-platform.js");
const { datetimeInfo } = require("./datetime-info.js");
const { knowledgeGraph } = require("./knowledge-graph.js");
const { docxGenerator } = require("./docx-generator.js");
const { xlsxGenerator } = require("./xlsx-generator.js");
const { pptxGenerator } = require("./pptx-generator.js");
const { pdfGenerator } = require("./pdf-generator.js");
const { doneTool } = require("./done.js");
const { mcpHub } = require("./mcp-hub.js");
const { moltAgent } = require("./molt-agent.js");
const { researchSubagent } = require("./research-subagent.js");
const {
  codeRead,
  codeWrite,
  codeEdit,
  codeGrep,
  codePatch,
  codeShell,
} = require("./code-execution.js");
// Phase PPT: PPT 增强 Flow
const { pptOutlineFlow } = require("./ppt-outline-flow.js");
const { pptGenerateFlow } = require("./ppt-generate-flow.js");
// Phase J: 结构化输出
const { structuredOutput } = require("./structured-output.js");
// Phase K: 对话摘要
const { conversationSummary } = require("./conversation-summary.js");
// 文档审核相关插件
const readDocumentFile = require("./read-document-file.js");
const documentReview = require("./document-review.js");
const documentReviewExecutor = require("./document-review-executor.js");
const { generateReviewReport } = require("./generate-review-report.js");

/**
 * 工具分层架构
 * Phase 3: Context Engineering - 渐进式披露
 *
 * Layer 1: SYSTEM_TOOLS - 系统级工具（始终注入）
 * Layer 2: OUTPUT_TOOLS - 输出级工具（始终注入）
 * Layer 3: CONTEXT_TOOLS - 上下文工具（按需注入）
 * Layer 4: BUSINESS_TOOLS - 业务工具（按需注入）
 */

/**
 * 系统级工具列表 - 所有 AI 员工默认可用
 * 这些工具解决 LLM 固有限制（如时间感知）
 * Layer 1: 不可屏蔽，始终注入
 */
const SYSTEM_TOOLS = ["datetime-info"];
// NOTE: `done` is intentionally always injectable as a system tool,
// but it only becomes required in auto/long-task mode (see AIbitat requireDoneTool).
SYSTEM_TOOLS.push("done");

/**
 * 输出级工具列表 - 所有 AI 员工默认可用
 * 这些工具提供通用的文档输出能力，是"交付形式"而非"专业技能"
 * Layer 2: 不可屏蔽，始终注入（即使员工绑定了 Flow）
 *
 * 设计理念：
 * - AI 员工的"专业技能"是 Flow（调研、分析、审核）
 * - AI 员工的"输出能力"是通用的（生成 Excel/PPT/PDF/Word）
 * - 就像现实中，市场专员的技能是调研分析，但写文档是基础办公能力
 */
const OUTPUT_TOOLS = [
  "generate-excel-report", // Excel 电子表格
  "generate-presentation", // PPT 渲染（兼容旧入口；优先用 ppt-outline-flow）
  "ppt-outline-flow", // PPT 生成入口（双 Flow 大纲确认）
  "ppt-generate-flow", // PPT 内容生成（大纲确认后第二步）
  "generate-pdf-document", // PDF 文档
  "generate-official-document", // Word 公文
  "save-file-to-browser", // 文件下载
  "create-chart", // 图表生成
];

/**
 * 上下文工具列表 - 管理对话上下文和记忆
 * Layer 3: 根据对话长度和复杂度按需注入
 *
 * 设计理念：
 * - 这些工具帮助 AI 管理长对话的上下文
 * - 短对话不需要这些工具，避免增加选择负担
 * - 对话超过 5 轮后自动注入
 */
const CONTEXT_TOOLS = [
  "memory", // RAG 记忆检索和存储
  "summarize-conversation", // 对话摘要生成
  "chat-history", // 对话历史查看
  "knowledge-graph", // 知识图谱查询
];

module.exports = {
  // 工具层级标识
  SYSTEM_TOOLS, // Layer 1: 系统级
  OUTPUT_TOOLS, // Layer 2: 输出级
  CONTEXT_TOOLS, // Layer 3: 上下文级

  // 工具导出
  webScraping,
  webBrowsing,
  websocket,
  docSummarizer,
  saveFileInBrowser,
  chatHistory,
  memory,
  rechart,
  visualGenerate,
  sqlAgent,
  smartDataRouter,
  orchestrator,
  dorisDataPlatform,
  datetimeInfo,
  doneTool,
  knowledgeGraph,
  docxGenerator,
  xlsxGenerator,
  pptxGenerator,
  pdfGenerator,
  mcpHub,
  moltAgent,
  researchSubagent,
  codeRead,
  codeWrite,
  codeEdit,
  codeGrep,
  codePatch,
  codeShell,
  // Phase PPT: PPT 增强 Flow
  pptOutlineFlow,
  pptGenerateFlow,
  // Phase J & K
  structuredOutput,
  conversationSummary,
  // 文档审核相关
  readDocumentFile,
  documentReview,
  documentReviewExecutor,
  generateReviewReport,

  // Plugin name aliases so they can be pulled by slug as well.
  [webScraping.name]: webScraping,
  [webBrowsing.name]: webBrowsing,
  [websocket.name]: websocket,
  [docSummarizer.name]: docSummarizer,
  [saveFileInBrowser.name]: saveFileInBrowser,
  [chatHistory.name]: chatHistory,
  [memory.name]: memory,
  [rechart.name]: rechart,
  [visualGenerate.name]: visualGenerate,
  [sqlAgent.name]: sqlAgent,
  [smartDataRouter.name]: smartDataRouter,
  [orchestrator.name]: orchestrator,
  [dorisDataPlatform.name]: dorisDataPlatform,
  [datetimeInfo.name]: datetimeInfo,
  [doneTool.name]: doneTool,
  [knowledgeGraph.name]: knowledgeGraph,
  [docxGenerator.name]: docxGenerator,
  [xlsxGenerator.name]: xlsxGenerator,
  [pptxGenerator.name]: pptxGenerator,
  [pdfGenerator.name]: pdfGenerator,
  [mcpHub.name]: mcpHub,
  [moltAgent.name]: moltAgent,
  [researchSubagent.name]: researchSubagent,
  [codeRead.name]: codeRead,
  [codeWrite.name]: codeWrite,
  [codeEdit.name]: codeEdit,
  [codeGrep.name]: codeGrep,
  [codePatch.name]: codePatch,
  [codeShell.name]: codeShell,
  // Phase PPT: PPT 增强 Flow 别名
  [pptOutlineFlow.name]: pptOutlineFlow,
  [pptGenerateFlow.name]: pptGenerateFlow,
  // Phase J & K 别名
  [structuredOutput.name]: structuredOutput,
  [conversationSummary.name]: conversationSummary,
  // 文档审核相关别名
  [readDocumentFile.name]: readDocumentFile,
  [documentReview.name]: documentReview,
  [documentReviewExecutor.name]: documentReviewExecutor,
  [generateReviewReport.name]: generateReviewReport,
};

if (duckdbAgent) {
  module.exports.duckdbAgent = duckdbAgent;
  module.exports[duckdbAgent.name] = duckdbAgent;
}
