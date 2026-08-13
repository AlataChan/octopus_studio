/**
 * @fileoverview MCP 服务配置模板系统
 * @description 提供预配置的 MCP 服务模板，简化 MCP 服务的部署和配置
 */

/**
 * MCP 服务分类
 * @enum {string}
 */
const MCP_CATEGORIES = {
  COGNITIVE: "cognitive", // 认知/思维增强类 - 提升 AI 的推理和规划能力
  SYSTEM: "system",
  WEB: "web",
  CORE: "core",
  DATA: "data",
  INTEGRATION: "integration",
  AUTOMATION: "automation",
};

/**
 * MCP 服务配置难度
 * @enum {string}
 */
const MCP_DIFFICULTY = {
  EASY: "easy",
  MEDIUM: "medium",
  HARD: "hard",
};

/**
 * 预配置的 MCP 服务模板
 */
const MCP_TEMPLATES = {
  /**
   * Sequential Thinking - 结构化思考 MCP 服务
   * @description 通过结构化思维过程提供动态、反思性的问题解决能力
   * @see https://github.com/modelcontextprotocol/servers/tree/main/src/sequentialthinking
   * @priority 认知基础设施 - 推荐作为复杂任务助手的默认配置
   */
  "sequential-thinking": {
    name: "sequential-thinking",
    displayName: "结构化思考",
    description:
      "通过分步思考帮助 AI 更好地分析复杂问题、制定计划、自我修正和验证假设。是复杂任务执行的认知基础设施。",
    icon: "🧠",
    category: MCP_CATEGORIES.COGNITIVE,
    difficulty: MCP_DIFFICULTY.EASY,
    config: {
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-sequential-thinking"],
      env: {},
    },
    anythingllm: {
      autoStart: false,
      securityNote: "纯思考工具，无外部访问，安全性高",
      // 标记为认知基础设施，供系统识别
      isCognitiveInfrastructure: true,
    },
    setup: {
      needsConfig: false,
      steps: ["无需配置，开箱即用", "建议为复杂任务型助手默认启用"],
    },
    useCases: [
      "复杂问题分解",
      "多步骤任务规划",
      "方案评估与决策",
      "自我修正与验证",
      "不确定性处理",
    ],
    // 核心能力说明
    capabilities: {
      dynamicPlanning: "可动态调整思考步骤数量",
      revision: "可质疑和修正之前的想法",
      branching: "可分支探索不同方案",
      hypothesis: "可生成和验证解决方案假设",
      uncertainty: "可表达不确定性",
    },
    // 工具定义
    tools: [
      {
        name: "sequentialthinking",
        description: "分步思考工具，支持修正、分支、假设验证",
        parameters: [
          "thought - 当前思考步骤",
          "nextThoughtNeeded - 是否需要继续思考",
          "thoughtNumber - 当前步骤编号",
          "totalThoughts - 预计总步骤数（可动态调整）",
          "isRevision - 是否为修正之前的想法",
          "branchFromThought - 分支起点（可选）",
        ],
      },
    ],
    // 推荐搭配的其他 MCP
    recommendedWith: ["memory", "playwright"],
  },

  /**
   * 文件系统 MCP 服务
   * @description 提供文件读写、目录遍历等基础文件操作能力
   */
  filesystem: {
    name: "filesystem",
    displayName: "文件系统",
    description: "提供文件读写、目录遍历等基础文件操作能力",
    icon: "📁",
    category: MCP_CATEGORIES.SYSTEM,
    difficulty: MCP_DIFFICULTY.EASY,
    config: {
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
      env: {},
    },
    anythingllm: {
      autoStart: false,
      securityNote: "⚠️ 默认只能访问 /tmp 目录，禁止访问系统根目录",
    },
    setup: {
      needsConfig: false,
      steps: ["确保 Node.js 环境可用", "配置完成后即可使用"],
    },
    securityPolicy: {
      allowedPaths: ["/tmp", "/workspace/data"],
      deniedPaths: ["/", "/etc", "/usr", "/var", "/root", "/home"],
      readOnly: false,
    },
  },

  /**
   * HTTP 请求 MCP 服务
   * @description 轻量级 HTTP 请求工具，适合 API 测试和简单网页抓取
   */
  fetch: {
    name: "fetch",
    displayName: "HTTP 请求",
    description: "轻量级 HTTP 请求工具，适合 API 测试和简单网页抓取",
    icon: "🌐",
    category: MCP_CATEGORIES.WEB,
    difficulty: MCP_DIFFICULTY.EASY,
    config: {
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-fetch"],
      env: {},
    },
    anythingllm: {
      autoStart: false,
      securityNote: "无需 API Key，开箱即用",
    },
    setup: {
      needsConfig: false,
      steps: ["无需配置，开箱即用"],
    },
    useCases: ["API 测试", "简单网页抓取", "HTTP 请求调试"],
  },

  /**
   * 持久化记忆 MCP 服务
   * @description 跨会话的持久化记忆存储
   */
  memory: {
    name: "memory",
    displayName: "持久化记忆",
    description: "跨会话的持久化记忆存储",
    icon: "🧠",
    category: MCP_CATEGORIES.CORE,
    difficulty: MCP_DIFFICULTY.EASY,
    config: {
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-memory"],
      env: {},
    },
    anythingllm: {
      autoStart: false,
      securityNote: "数据存储在本地，建议定期清理旧数据",
    },
    setup: {
      needsConfig: false,
      steps: ["无需配置，开箱即用"],
    },
  },

  /**
   * Playwright 浏览器自动化 MCP 服务（基础版）
   * @description 只读为主的网页浏览能力，适合信息获取场景
   * @see https://github.com/microsoft/playwright-mcp
   */
  playwright: {
    name: "playwright",
    displayName: "浏览器（基础）",
    description:
      "网页浏览与信息获取能力。支持访问网页、阅读内容、截图等只读操作。适合大多数信息查询场景。",
    icon: "🌐",
    category: MCP_CATEGORIES.AUTOMATION,
    difficulty: MCP_DIFFICULTY.EASY,
    config: {
      command: "npx",
      args: ["-y", "@playwright/mcp@latest", "--headless"],
      env: {},
    },
    anythingllm: {
      autoStart: false,
      securityNote:
        "⚠️ 可访问任意网站，建议通过 --blocked-origins 限制敏感域名",
    },
    setup: {
      needsConfig: false,
      steps: [
        "首次使用会自动下载 Chromium 浏览器（约 150MB）",
        "默认使用 headless 无头模式，适合服务器环境",
        "可选：通过 --blocked-origins 限制访问的网站",
      ],
    },
    useCases: ["网页信息抓取", "内容阅读", "网站截图", "竞品监控", "价格追踪"],
    // 核心工具列表（Core automation，约 20 个工具）
    tools: [
      { name: "browser_navigate", description: "访问指定网址" },
      { name: "browser_snapshot", description: "获取页面可访问性快照（推荐）" },
      { name: "browser_take_screenshot", description: "截取页面截图" },
      { name: "browser_click", description: "点击页面元素" },
      { name: "browser_type", description: "输入文字" },
      { name: "browser_hover", description: "鼠标悬停" },
      { name: "browser_scroll", description: "页面滚动" },
      { name: "browser_select_option", description: "下拉选择" },
      { name: "browser_fill_form", description: "批量填写表单" },
      { name: "browser_navigate_back", description: "返回上一页" },
      { name: "browser_tabs", description: "标签页管理" },
      { name: "browser_close", description: "关闭浏览器" },
      { name: "browser_wait_for", description: "等待元素或文本" },
      { name: "browser_console_messages", description: "获取控制台消息" },
      { name: "browser_network_requests", description: "查看网络请求" },
    ],
  },

  /**
   * Playwright 浏览器自动化 MCP 服务（完整版）
   * @description 完整浏览器自动化能力，包含视觉交互、PDF生成、测试等高级功能
   * @see https://github.com/microsoft/playwright-mcp
   */
  "playwright-full": {
    name: "playwright-full",
    displayName: "浏览器（完整）",
    description:
      "完整的浏览器自动化能力。在基础版之上，增加基于坐标的视觉交互、PDF 生成、自动化测试断言等高级功能。适合复杂自动化场景。",
    icon: "🎭",
    category: MCP_CATEGORIES.AUTOMATION,
    difficulty: MCP_DIFFICULTY.MEDIUM,
    config: {
      command: "npx",
      args: [
        "-y",
        "@playwright/mcp@latest",
        "--headless",
        "--caps",
        "vision,pdf,testing",
      ],
      env: {},
    },
    anythingllm: {
      autoStart: false,
      securityNote: "⚠️ 功能强大，可执行复杂自动化操作。建议仅在需要时启用。",
    },
    setup: {
      needsConfig: false,
      steps: [
        "首次使用会自动下载 Chromium 浏览器（约 150MB）",
        "启用 vision 需要支持图像的 LLM（如 GPT-4o、Claude 3）",
        "可选：通过 --blocked-origins 限制访问的网站",
      ],
    },
    useCases: [
      "复杂表单自动填写",
      "端到端自动化测试",
      "PDF 报告生成",
      "基于视觉的 UI 交互",
      "RPA 流程自动化",
    ],
    // 完整工具列表（Core + vision + pdf + testing，约 30+ 工具）
    additionalTools: [
      { name: "browser_mouse_click_xy", description: "基于坐标点击（需视觉）" },
      { name: "browser_mouse_move_xy", description: "基于坐标移动鼠标" },
      { name: "browser_mouse_drag_xy", description: "基于坐标拖拽" },
      { name: "browser_pdf_save", description: "保存为 PDF" },
      { name: "browser_generate_locator", description: "生成测试定位器" },
      { name: "browser_verify_element_visible", description: "验证元素可见" },
      { name: "browser_verify_text_visible", description: "验证文本可见" },
      { name: "browser_verify_value", description: "验证元素值" },
    ],
  },
};

/**
 * 获取所有可用的 MCP 模板
 * @returns {Object} MCP 模板对象
 */
function getAllTemplates() {
  return { ...MCP_TEMPLATES };
}

/**
 * 根据名称获取 MCP 模板
 * @param {string} name - 模板名称
 * @returns {Object|null} MCP 模板或 null
 */
function getTemplate(name) {
  return MCP_TEMPLATES[name] || null;
}

/**
 * 根据分类获取 MCP 模板列表
 * @param {string} category - 分类
 * @returns {Object[]} MCP 模板数组
 */
function getTemplatesByCategory(category) {
  return Object.values(MCP_TEMPLATES).filter((t) => t.category === category);
}

/**
 * 获取简易配置的 MCP 模板（无需额外配置）
 * @returns {Object[]} MCP 模板数组
 */
function getEasyTemplates() {
  return Object.values(MCP_TEMPLATES).filter(
    (t) => t.difficulty === MCP_DIFFICULTY.EASY && !t.setup.needsConfig
  );
}

/**
 * 生成 MCP 服务器配置对象（用于 anythingllm_mcp_servers.json）
 * @param {string[]} templateNames - 要启用的模板名称数组
 * @returns {Object} MCP 服务器配置对象
 */
function generateMCPConfig(templateNames = []) {
  const mcpServers = {};

  for (const name of templateNames) {
    const template = MCP_TEMPLATES[name];
    if (template) {
      mcpServers[name] = {
        command: template.config.command,
        args: template.config.args,
        env: template.config.env,
        anythingllm: template.anythingllm,
      };
    }
  }

  return { mcpServers };
}

/**
 * 获取认知基础设施 MCP 列表
 * @description 返回标记为 isCognitiveInfrastructure 的 MCP 模板，推荐作为复杂助手的默认配置
 * @returns {Object[]} MCP 模板数组
 */
function getCognitiveInfrastructureTemplates() {
  return Object.values(MCP_TEMPLATES).filter(
    (t) => t.anythingllm?.isCognitiveInfrastructure === true
  );
}

/**
 * 生成复杂助手推荐的 MCP 配置
 * @description 为复杂任务型助手生成推荐的 MCP 服务器配置，自动包含认知基础设施
 * @param {string[]} additionalMCPNames - 额外需要启用的 MCP 名称数组
 * @returns {Object} MCP 服务器配置对象 { serverName: { enabled: true } }
 */
function generateComplexAssistantMCPConfig(additionalMCPNames = []) {
  const config = {};

  // 1. 自动添加认知基础设施
  const cognitiveTemplates = getCognitiveInfrastructureTemplates();
  for (const template of cognitiveTemplates) {
    config[template.name] = { enabled: true };
  }

  // 2. 添加额外指定的 MCP
  for (const name of additionalMCPNames) {
    if (MCP_TEMPLATES[name]) {
      config[name] = { enabled: true };
    }
  }

  return config;
}

module.exports = {
  MCP_TEMPLATES,
  MCP_CATEGORIES,
  MCP_DIFFICULTY,
  getAllTemplates,
  getTemplate,
  getTemplatesByCategory,
  getEasyTemplates,
  generateMCPConfig,
  // 新增：认知基础设施相关
  getCognitiveInfrastructureTemplates,
  generateComplexAssistantMCPConfig,
};
