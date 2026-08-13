/**
 * 种子脚本：创建编排型助手模板
 * 用于 M3 Task 3.6 - 创建两个编排型助手模板
 *
 * 使用方法：
 * node server/scripts/seed-orchestration-assistants.js
 */

const path = require("path");

// Set required environment variables for standalone execution
process.env.NODE_ENV = process.env.NODE_ENV || "development";
process.env.STORAGE_DIR = process.env.STORAGE_DIR || path.resolve(__dirname, "../../storage");

const { AgentFlows } = require("../utils/agentFlows");
const { AssistantTemplate } = require("../models/assistantTemplate");
const { generateComplexAssistantMCPConfig } = require("../utils/MCP/templates");

/**
 * 创建市场调研助手的 Agent Flow
 */
async function createMarketResearchFlow() {
  const flowConfig = {
    name: "市场调研助手流程",
    description: "多 Agent 协作完成市场调研任务：研究员收集信息 → 撰写员整理报告 → 审核员优化内容",
    steps: [
      {
        type: "start",
        config: {
          message: "开始市场调研流程",
        },
      },
      {
        type: "subflow",
        config: {
          flowId: "researcher-flow", // 需要预先创建或使用简化版本
          roleName: "researcher",
          roleDescription: "负责收集和整理市场信息、竞品分析、行业趋势",
          inputMapping: {
            query: "user_query",
          },
          outputKey: "research_data",
          timeout: 300,
          onError: "fail",
        },
      },
      {
        type: "subflow",
        config: {
          flowId: "writer-flow",
          roleName: "writer",
          roleDescription: "负责根据研究数据撰写结构化的市场调研报告",
          inputMapping: {
            research_data: "research_data",
          },
          outputKey: "draft_report",
          timeout: 300,
          onError: "fail",
        },
      },
      {
        type: "subflow",
        config: {
          flowId: "reviewer-flow",
          roleName: "reviewer",
          roleDescription: "负责审核报告质量、优化表达、确保准确性",
          inputMapping: {
            draft_report: "draft_report",
            research_data: "research_data",
          },
          outputKey: "final_report",
          timeout: 300,
          onError: "fail",
        },
      },
    ],
  };

  const result = AgentFlows.saveFlow(
    flowConfig.name,
    flowConfig,
    "market-research-orchestration"
  );

  if (result.success) {
    console.log("✅ 市场调研助手 Flow 创建成功:", result.uuid);
    return result.uuid;
  } else {
    console.error("❌ 市场调研助手 Flow 创建失败:", result.error);
    return null;
  }
}

/**
 * 创建长文写作助手的 Agent Flow
 */
async function createLongFormWritingFlow() {
  const flowConfig = {
    name: "长文写作助手流程",
    description: "多 Agent 协作完成长文写作任务：大纲师规划结构 → 撰写员创作内容 → 编辑员润色优化",
    steps: [
      {
        type: "start",
        config: {
          message: "开始长文写作流程",
        },
      },
      {
        type: "subflow",
        config: {
          flowId: "outliner-flow",
          roleName: "outliner",
          roleDescription: "负责分析主题、规划文章结构、制定大纲",
          inputMapping: {
            topic: "user_query",
          },
          outputKey: "outline",
          timeout: 300,
          onError: "fail",
        },
      },
      {
        type: "subflow",
        config: {
          flowId: "content-writer-flow",
          roleName: "writer",
          roleDescription: "负责根据大纲创作内容、展开论述、丰富细节",
          inputMapping: {
            outline: "outline",
            topic: "user_query",
          },
          outputKey: "draft_content",
          timeout: 600,
          onError: "fail",
        },
      },
      {
        type: "subflow",
        config: {
          flowId: "editor-flow",
          roleName: "editor",
          roleDescription: "负责润色文字、优化表达、检查逻辑和语法",
          inputMapping: {
            draft_content: "draft_content",
            outline: "outline",
          },
          outputKey: "final_content",
          timeout: 300,
          onError: "fail",
        },
      },
    ],
  };

  const result = AgentFlows.saveFlow(
    flowConfig.name,
    flowConfig,
    "long-form-writing-orchestration"
  );

  if (result.success) {
    console.log("✅ 长文写作助手 Flow 创建成功:", result.uuid);
    return result.uuid;
  } else {
    console.error("❌ 长文写作助手 Flow 创建失败:", result.error);
    return null;
  }
}

/**
 * 创建市场调研助手模板
 */
async function createMarketResearchAssistant(flowId) {
  const internalRoles = [
    {
      role: "researcher",
      description: "负责收集和整理市场信息、竞品分析、行业趋势",
    },
    {
      role: "writer",
      description: "负责根据研究数据撰写结构化的市场调研报告",
    },
    {
      role: "reviewer",
      description: "负责审核报告质量、优化表达、确保准确性",
    },
  ];

  // 生成复杂助手推荐的 MCP 配置（自动包含 sequential-thinking 认知基础设施）
  const defaultMCPServers = generateComplexAssistantMCPConfig(["playwright"]);

  const templateData = {
    name: "市场调研助手",
    description:
      "专业的市场调研助手，采用多 Agent 协作模式完成深度市场分析。由研究员、撰写员、审核员三个角色协同工作，确保调研报告的全面性和准确性。适用于竞品分析、行业趋势研究、市场机会评估等场景。",
    icon: "📊",
    category: "营销",
    industry: "通用",
    tags: ["市场调研", "竞品分析", "行业分析", "多Agent协作"],
    systemPrompt:
      "你是一个专业的市场调研助手，擅长收集和分析市场信息。你会协调多个专业角色（研究员、撰写员、审核员）共同完成调研任务，确保输出高质量的市场分析报告。",
    agentFlowId: flowId,
    internalRoles: JSON.stringify(internalRoles), // 存储为 JSON 字符串
    defaultMCPServers, // 默认启用认知基础设施 + 浏览器
    recommendedModel: "推理型模型（如 GPT-4、Claude、Qwen-Plus）",
    isGlobal: true,
  };

  const result = await AssistantTemplate.create(templateData);

  if (result.template) {
    console.log("✅ 市场调研助手模板创建成功:", result.template.id);
    return result.template;
  } else {
    console.error("❌ 市场调研助手模板创建失败:", result.message);
    return null;
  }
}

/**
 * 创建长文写作助手模板
 */
async function createLongFormWritingAssistant(flowId) {
  const internalRoles = [
    {
      role: "outliner",
      description: "负责分析主题、规划文章结构、制定大纲",
    },
    {
      role: "writer",
      description: "负责根据大纲创作内容、展开论述、丰富细节",
    },
    {
      role: "editor",
      description: "负责润色文字、优化表达、检查逻辑和语法",
    },
  ];

  // 生成复杂助手推荐的 MCP 配置（自动包含 sequential-thinking 认知基础设施）
  const defaultMCPServers = generateComplexAssistantMCPConfig(["memory"]);

  const templateData = {
    name: "长文写作助手",
    description:
      "专业的长文写作助手，采用多 Agent 协作模式完成高质量长文创作。由大纲师、撰写员、编辑员三个角色协同工作，从结构规划到内容创作再到润色优化，确保文章的逻辑性和可读性。适用于技术文档、深度文章、研究报告等场景。",
    icon: "✍️",
    category: "内容创作",
    industry: "通用",
    tags: ["长文写作", "内容创作", "文章润色", "多Agent协作"],
    systemPrompt:
      "你是一个专业的长文写作助手，擅长创作结构清晰、内容丰富的长篇文章。你会协调多个专业角色（大纲师、撰写员、编辑员）共同完成写作任务，确保输出高质量的文章内容。",
    agentFlowId: flowId,
    internalRoles: JSON.stringify(internalRoles), // 存储为 JSON 字符串
    defaultMCPServers, // 默认启用认知基础设施 + 记忆
    recommendedModel: "生成型模型（如 GPT-4、Claude、Qwen-Max）",
    isGlobal: true,
  };

  const result = await AssistantTemplate.create(templateData);

  if (result.template) {
    console.log("✅ 长文写作助手模板创建成功:", result.template.id);
    return result.template;
  } else {
    console.error("❌ 长文写作助手模板创建失败:", result.message);
    return null;
  }
}

/**
 * 主函数：执行种子脚本
 */
async function main() {
  console.log("🚀 开始创建编排型助手模板...\n");

  // 1. 创建市场调研助手
  console.log("📊 创建市场调研助手...");
  const marketResearchFlowId = await createMarketResearchFlow();
  if (marketResearchFlowId) {
    const marketResearchAssistant = await createMarketResearchAssistant(
      marketResearchFlowId
    );
    if (marketResearchAssistant) {
      console.log("   内部角色:");
      console.log("   - researcher: 负责收集和整理市场信息、竞品分析、行业趋势");
      console.log("   - writer: 负责根据研究数据撰写结构化的市场调研报告");
      console.log("   - reviewer: 负责审核报告质量、优化表达、确保准确性");
    }
  }
  console.log("");

  // 2. 创建长文写作助手
  console.log("✍️  创建长文写作助手...");
  const longFormWritingFlowId = await createLongFormWritingFlow();
  if (longFormWritingFlowId) {
    const longFormWritingAssistant = await createLongFormWritingAssistant(
      longFormWritingFlowId
    );
    if (longFormWritingAssistant) {
      console.log("   内部角色:");
      console.log("   - outliner: 负责分析主题、规划文章结构、制定大纲");
      console.log("   - writer: 负责根据大纲创作内容、展开论述、丰富细节");
      console.log("   - editor: 负责润色文字、优化表达、检查逻辑和语法");
    }
  }
  console.log("");

  console.log("🎉 编排型助手模板创建完成！");
  console.log("\n📝 下一步:");
  console.log("1. 在助手库页面查看新创建的助手");
  console.log("2. 点击助手卡片查看详情，验证内部角色列表显示");
  console.log("3. 雇佣助手到 Workspace 进行测试");
  console.log("4. 在聊天中使用助手，验证角色标签显示");
}

// 执行主函数
main()
  .then(() => {
    console.log("\n✅ 脚本执行完成");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ 脚本执行失败:", error);
    process.exit(1);
  });

