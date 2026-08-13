/**
 * 工具描述规范化模块
 *
 * Phase 3: Context Engineering - 工具描述规范化
 *
 * 目的：
 * 1. 统一工具描述格式，减少 LLM 理解成本
 * 2. 实现渐进式披露（Progressive Disclosure）
 * 3. 根据上下文动态调整工具描述详细程度
 *
 * 工具分层：
 * - Layer 1: SYSTEM_TOOLS - 系统级工具（始终可用）
 * - Layer 2: OUTPUT_TOOLS - 输出级工具（文档生成等）
 * - Layer 3: CONTEXT_TOOLS - 上下文工具（记忆、摘要等）
 * - Layer 4: BUSINESS_TOOLS - 业务工具（数据库、API 等）
 *
 * @module toolDescriptionStandards
 */

/**
 * 工具描述模板
 * 使用结构化格式确保一致性
 */
const DESCRIPTION_TEMPLATE = {
  /**
   * 简短描述模板（用于工具列表展示）
   * 格式：[动词] [对象] [可选：限定条件]
   * 示例：获取当前日期和时间
   */
  short: "{verb} {object}",

  /**
   * 标准描述模板（用于 LLM function calling）
   * 格式：[功能说明]。[使用场景]。[注意事项]
   */
  standard: "{what}。{when}。{note}",

  /**
   * 详细描述模板（用于帮助文档）
   */
  detailed: `## {name}

### 功能
{what}

### 使用场景
{when}

### 参数
{parameters}

### 返回值
{returns}

### 示例
{examples}

### 注意事项
{notes}`,
};

/**
 * 工具分层定义
 */
const TOOL_LAYERS = {
  SYSTEM: 1, // 系统级：始终注入
  OUTPUT: 2, // 输出级：文档生成
  CONTEXT: 3, // 上下文级：记忆管理
  BUSINESS: 4, // 业务级：按需注入
};

/**
 * 上下文工具列表
 * Layer 3: 上下文操作工具
 */
const CONTEXT_TOOLS = [
  "memory", // RAG 记忆检索
  "summarize-conversation", // 对话摘要
  "chat-history", // 对话历史
  "knowledge-graph", // 知识图谱
];

/**
 * 工具元数据注册表
 * 包含每个工具的标准化描述和分层信息
 */
const TOOL_METADATA = {
  // Layer 1: 系统工具
  "datetime-info": {
    layer: TOOL_LAYERS.SYSTEM,
    category: "system",
    shortDesc: "获取当前日期和时间",
    standardDesc:
      "获取当前的日期、时间和时区信息。当需要知道现在的时间或日期时使用。返回格式化的日期时间字符串。",
    verb: "获取",
    object: "当前日期和时间",
    costLevel: "low", // token 消耗等级
    sideEffects: false,
  },

  // Layer 2: 输出工具
  "generate-excel-report": {
    layer: TOOL_LAYERS.OUTPUT,
    category: "output",
    shortDesc: "生成 Excel 电子表格",
    standardDesc:
      "将数据导出为 Excel 格式的电子表格。当用户需要表格数据或数据分析结果时使用。支持多工作表和基础格式。",
    verb: "生成",
    object: "Excel 电子表格",
    costLevel: "medium",
    sideEffects: true,
  },
  "generate-presentation": {
    layer: TOOL_LAYERS.OUTPUT,
    category: "output",
    shortDesc: "生成 PowerPoint 演示文稿",
    standardDesc:
      "创建 PowerPoint 演示文稿。当用户需要制作汇报或展示材料时使用。支持文字、图表和基础布局。",
    verb: "生成",
    object: "PowerPoint 演示文稿",
    costLevel: "medium",
    sideEffects: true,
  },
  "generate-pdf-document": {
    layer: TOOL_LAYERS.OUTPUT,
    category: "output",
    shortDesc: "生成 PDF 文档",
    standardDesc:
      "创建 PDF 格式文档。当用户需要正式文档或报告时使用。支持文字排版和基础样式。",
    verb: "生成",
    object: "PDF 文档",
    costLevel: "medium",
    sideEffects: true,
  },
  "generate-official-document": {
    layer: TOOL_LAYERS.OUTPUT,
    category: "output",
    shortDesc: "生成 Word 公文",
    standardDesc:
      "创建 Word 格式的正式公文。当用户需要公文、报告或正式文档时使用。支持标准公文格式。",
    verb: "生成",
    object: "Word 公文",
    costLevel: "medium",
    sideEffects: true,
  },
  "save-file-to-browser": {
    layer: TOOL_LAYERS.OUTPUT,
    category: "output",
    shortDesc: "保存文件到浏览器",
    standardDesc:
      "将生成的文件保存到用户浏览器。当需要让用户下载文件时使用。支持多种文件格式。",
    verb: "保存",
    object: "文件到浏览器",
    costLevel: "low",
    sideEffects: true,
  },
  "create-chart": {
    layer: TOOL_LAYERS.OUTPUT,
    category: "output",
    shortDesc: "创建数据图表",
    standardDesc:
      "根据数据创建可视化图表。当用户需要数据可视化时使用。支持折线图、柱状图、饼图等。",
    verb: "创建",
    object: "数据图表",
    costLevel: "medium",
    sideEffects: false,
  },

  // Layer 3: 上下文工具
  memory: {
    layer: TOOL_LAYERS.CONTEXT,
    category: "context",
    shortDesc: "检索和存储记忆",
    standardDesc:
      "从长期记忆中检索相关信息或存储新的重要信息。当需要回忆之前的对话内容或保存重要结论时使用。",
    verb: "检索/存储",
    object: "长期记忆",
    costLevel: "medium",
    sideEffects: true,
  },
  "summarize-conversation": {
    layer: TOOL_LAYERS.CONTEXT,
    category: "context",
    shortDesc: "总结对话内容",
    standardDesc:
      "生成当前对话的结构化摘要。当对话变长需要压缩上下文时使用。返回会话意图、关键决策等。",
    verb: "总结",
    object: "对话内容",
    costLevel: "high",
    sideEffects: true,
  },
  "chat-history": {
    layer: TOOL_LAYERS.CONTEXT,
    category: "context",
    shortDesc: "查看对话历史",
    standardDesc:
      "获取指定范围的对话历史记录。当需要回顾之前的对话内容时使用。可以指定消息数量。",
    verb: "查看",
    object: "对话历史",
    costLevel: "low",
    sideEffects: false,
  },
  "knowledge-graph": {
    layer: TOOL_LAYERS.CONTEXT,
    category: "context",
    shortDesc: "查询知识图谱",
    standardDesc:
      "在知识图谱中搜索相关概念和关系。当需要理解实体之间的关联时使用。返回节点和边信息。",
    verb: "查询",
    object: "知识图谱",
    costLevel: "medium",
    sideEffects: false,
  },

  // Layer 4: 业务工具
  "web-browsing": {
    layer: TOOL_LAYERS.BUSINESS,
    category: "research",
    shortDesc: "浏览网页内容",
    standardDesc:
      "访问并读取指定 URL 的网页内容。当需要获取网络信息时使用。注意：部分网站可能无法访问。",
    verb: "浏览",
    object: "网页内容",
    costLevel: "high",
    sideEffects: false,
  },
  "web-scraping": {
    layer: TOOL_LAYERS.BUSINESS,
    category: "research",
    shortDesc: "抓取网页数据",
    standardDesc:
      "从网页中提取结构化数据。当需要批量获取网页信息时使用。支持 CSS 选择器和 XPath。",
    verb: "抓取",
    object: "网页数据",
    costLevel: "high",
    sideEffects: false,
  },
  "sql-agent": {
    layer: TOOL_LAYERS.BUSINESS,
    category: "data",
    shortDesc: "执行 SQL 查询",
    standardDesc:
      "在数据库中执行 SQL 查询语句。当需要查询或分析数据库数据时使用。支持 SELECT 查询。",
    verb: "执行",
    object: "SQL 查询",
    costLevel: "medium",
    sideEffects: false, // 只读模式
  },
  "duckdb-agent": {
    layer: TOOL_LAYERS.BUSINESS,
    category: "data",
    shortDesc: "DuckDB 数据分析",
    standardDesc:
      "使用 DuckDB 进行数据分析。当需要对本地数据进行 SQL 分析时使用。支持 CSV、Parquet 等格式。",
    verb: "分析",
    object: "本地数据",
    costLevel: "medium",
    sideEffects: false,
  },
};

/**
 * 获取工具的标准化描述
 * @param {string} toolName - 工具名称
 * @param {string} level - 描述级别: 'short' | 'standard' | 'detailed'
 * @returns {string} 标准化描述
 */
function getToolDescription(toolName, level = "standard") {
  const metadata = TOOL_METADATA[toolName];
  if (!metadata) {
    return `Tool: ${toolName}`;
  }

  switch (level) {
    case "short":
      return metadata.shortDesc;
    case "standard":
      return metadata.standardDesc;
    case "detailed":
      return formatDetailedDescription(toolName, metadata);
    default:
      return metadata.standardDesc;
  }
}

/**
 * 格式化详细描述
 * @param {string} toolName - 工具名称
 * @param {Object} metadata - 工具元数据
 * @returns {string} 详细描述
 */
function formatDetailedDescription(toolName, metadata) {
  return `## ${toolName}

### 功能
${metadata.standardDesc}

### 类别
- 层级: Layer ${metadata.layer} (${getCategoryName(metadata.layer)})
- 分类: ${metadata.category}
- Token 消耗: ${metadata.costLevel}
- 副作用: ${metadata.sideEffects ? "是" : "否"}
`;
}

/**
 * 获取分类名称
 * @param {number} layer - 层级
 * @returns {string} 分类名称
 */
function getCategoryName(layer) {
  switch (layer) {
    case TOOL_LAYERS.SYSTEM:
      return "系统级";
    case TOOL_LAYERS.OUTPUT:
      return "输出级";
    case TOOL_LAYERS.CONTEXT:
      return "上下文级";
    case TOOL_LAYERS.BUSINESS:
      return "业务级";
    default:
      return "未知";
  }
}

/**
 * 获取指定层级的所有工具
 * @param {number} layer - 层级
 * @returns {string[]} 工具名称列表
 */
function getToolsByLayer(layer) {
  return Object.entries(TOOL_METADATA)
    .filter(([_, meta]) => meta.layer === layer)
    .map(([name]) => name);
}

/**
 * 获取工具的 token 消耗等级
 * @param {string} toolName - 工具名称
 * @returns {string} 消耗等级: 'low' | 'medium' | 'high'
 */
function getToolCostLevel(toolName) {
  return TOOL_METADATA[toolName]?.costLevel || "medium";
}

/**
 * 判断工具是否有副作用
 * @param {string} toolName - 工具名称
 * @returns {boolean} 是否有副作用
 */
function hasToolSideEffects(toolName) {
  return TOOL_METADATA[toolName]?.sideEffects ?? true;
}

/**
 * 注册自定义工具元数据
 * @param {string} toolName - 工具名称
 * @param {Object} metadata - 工具元数据
 */
function registerToolMetadata(toolName, metadata) {
  TOOL_METADATA[toolName] = {
    layer: metadata.layer || TOOL_LAYERS.BUSINESS,
    category: metadata.category || "custom",
    shortDesc: metadata.shortDesc || toolName,
    standardDesc: metadata.standardDesc || metadata.shortDesc || toolName,
    verb: metadata.verb || "使用",
    object: metadata.object || toolName,
    costLevel: metadata.costLevel || "medium",
    sideEffects: metadata.sideEffects ?? true,
  };
}

/**
 * 根据上下文选择要注入的工具
 * 实现渐进式披露
 *
 * @param {Object} context - 上下文信息
 * @param {string[]} context.availableTools - 可用工具列表
 * @param {number} context.conversationLength - 对话长度
 * @param {string[]} context.recentToolCalls - 最近使用的工具
 * @param {string} context.userIntent - 用户意图
 * @returns {string[]} 推荐注入的工具列表
 */
function selectToolsForContext(context) {
  const {
    availableTools = [],
    conversationLength = 0,
    recentToolCalls = [],
    userIntent = "",
  } = context;

  // 始终包含系统工具
  const selectedTools = new Set(getToolsByLayer(TOOL_LAYERS.SYSTEM));

  // 始终包含输出工具
  getToolsByLayer(TOOL_LAYERS.OUTPUT).forEach((tool) => {
    if (availableTools.includes(tool)) {
      selectedTools.add(tool);
    }
  });

  // 根据对话长度决定是否包含上下文工具
  if (conversationLength > 5) {
    getToolsByLayer(TOOL_LAYERS.CONTEXT).forEach((tool) => {
      if (availableTools.includes(tool)) {
        selectedTools.add(tool);
      }
    });
  }

  // 包含最近使用的工具（保持连续性）
  recentToolCalls.forEach((tool) => {
    if (availableTools.includes(tool)) {
      selectedTools.add(tool);
    }
  });

  // 根据用户意图包含相关业务工具
  const intentKeywords = {
    data: ["sql-agent", "duckdb-agent", "smart-data-router"],
    research: ["web-browsing", "web-scraping"],
    document: ["read-document-file", "document-review"],
  };

  for (const [keyword, tools] of Object.entries(intentKeywords)) {
    if (userIntent.toLowerCase().includes(keyword)) {
      tools.forEach((tool) => {
        if (availableTools.includes(tool)) {
          selectedTools.add(tool);
        }
      });
    }
  }

  // 包含所有其他可用的业务工具
  availableTools.forEach((tool) => {
    if (!selectedTools.has(tool)) {
      selectedTools.add(tool);
    }
  });

  return Array.from(selectedTools);
}

/**
 * 生成工具描述摘要（用于 system prompt）
 * @param {string[]} tools - 工具列表
 * @param {string} format - 格式: 'compact' | 'standard' | 'detailed'
 * @returns {string} 工具描述摘要
 */
function generateToolsSummary(tools, format = "compact") {
  if (format === "compact") {
    // 按分类分组的紧凑格式
    const grouped = {};
    for (const tool of tools) {
      const meta = TOOL_METADATA[tool];
      const category = meta?.category || "other";
      if (!grouped[category]) {
        grouped[category] = [];
      }
      grouped[category].push(meta?.shortDesc || tool);
    }

    const parts = [];
    for (const [category, descriptions] of Object.entries(grouped)) {
      parts.push(`[${category}]: ${descriptions.join(", ")}`);
    }
    return parts.join("\n");
  }

  if (format === "standard") {
    return tools
      .map((tool) => {
        const meta = TOOL_METADATA[tool];
        return `- ${tool}: ${meta?.standardDesc || tool}`;
      })
      .join("\n");
  }

  // detailed
  return tools.map((tool) => getToolDescription(tool, "detailed")).join("\n\n");
}

module.exports = {
  // 常量
  TOOL_LAYERS,
  CONTEXT_TOOLS,
  TOOL_METADATA,
  DESCRIPTION_TEMPLATE,

  // 函数
  getToolDescription,
  getToolsByLayer,
  getToolCostLevel,
  hasToolSideEffects,
  registerToolMetadata,
  selectToolsForContext,
  generateToolsSummary,
};
