/**
 * @fileoverview Smart Data Router 插件
 * 智能路由数据查询到合适的 Agent（sql-agent 或 duckdb-agent）
 *
 * 三档路由策略：
 * 1. 只有业务表 → sql-agent
 * 2. 只有临时文件 → duckdb-agent
 * 3. 混合数据源 → 建议用户拆分查询
 */

const S3Client = require("../../../storage/S3Client");

/**
 * 分析查询意图，判断数据源类型
 * @param {string} query - 用户查询
 * @returns {{needsDatabase: boolean, needsFiles: boolean, keywords: string[]}}
 */
function analyzeQueryIntent(query) {
  const lowerQuery = query.toLowerCase();

  // 数据库相关关键词
  const dbKeywords = [
    "数据库",
    "database",
    "表",
    "table",
    "mysql",
    "postgres",
    "postgresql",
    "订单",
    "用户",
    "客户",
    "产品",
    "销售",
    "库存",
    "交易",
    "order",
    "user",
    "customer",
    "product",
    "sale",
    "inventory",
    "transaction",
  ];

  // 文件分析相关关键词
  const fileKeywords = [
    "excel",
    "csv",
    "文件",
    "file",
    "上传",
    "upload",
    "导入",
    "import",
    "表格",
    "spreadsheet",
    "数据集",
    "dataset",
    "临时",
    "temporary",
  ];

  const foundDbKeywords = dbKeywords.filter((kw) => lowerQuery.includes(kw));
  const foundFileKeywords = fileKeywords.filter((kw) =>
    lowerQuery.includes(kw)
  );

  return {
    needsDatabase: foundDbKeywords.length > 0,
    needsFiles: foundFileKeywords.length > 0,
    keywords: [...foundDbKeywords, ...foundFileKeywords],
  };
}

/**
 * Smart Data Router 插件
 */
const smartDataRouter = {
  name: "smart-data-router",
  startupConfig: {
    params: {},
  },
  plugin: [
    {
      name: "smart-data-router",
      plugin: function () {
        return {
          name: "smart-data-router",
          setup(aibitat) {
            aibitat.function({
              super: aibitat,
              name: this.name,
              description: `Analyze a data query and recommend the best tool to use. 
Call this FIRST when user asks about data analysis to determine whether to use sql-agent (for database queries) or duckdb-agent (for Excel/CSV file analysis).
Returns a recommendation with the appropriate tool to use.`,
              examples: [
                {
                  prompt: "分析一下上个月的销售数据",
                  call: JSON.stringify({
                    query: "分析一下上个月的销售数据",
                    workspace_id: 1,
                  }),
                },
                {
                  prompt: "帮我查看刚上传的 Excel 文件",
                  call: JSON.stringify({
                    query: "帮我查看刚上传的 Excel 文件",
                    workspace_id: 1,
                  }),
                },
              ],
              parameters: {
                $schema: "http://json-schema.org/draft-07/schema#",
                type: "object",
                properties: {
                  query: {
                    type: "string",
                    description: "The user's data analysis query.",
                  },
                  workspace_id: {
                    type: "number",
                    description:
                      "The workspace ID for checking available data sources.",
                  },
                },
                additionalProperties: false,
                required: ["query", "workspace_id"],
              },
              handler: async function ({ query, workspace_id }) {
                this.super.handlerProps.log(`Using smart-data-router tool.`);

                try {
                  // 1. 分析查询意图
                  const intent = analyzeQueryIntent(query);

                  // 2. 检查可用数据源
                  const hasFileStorage = S3Client.isEnabled();
                  let availableFiles = [];

                  if (hasFileStorage) {
                    try {
                      availableFiles =
                        await S3Client.listWorkspaceFiles(workspace_id);
                    } catch (e) {
                      console.error(
                        "[smart-data-router] Failed to list files:",
                        e
                      );
                    }
                  }

                  // 3. 检查是否有数据库连接（通过 sql-agent 的配置）
                  let hasDatabaseConnections = false;
                  try {
                    const {
                      listSQLConnections,
                    } = require("./sql-agent/SQLConnectors/index.js");
                    const connections = await listSQLConnections();
                    hasDatabaseConnections =
                      connections && connections.length > 0;
                  } catch (e) {
                    // sql-agent 可能未配置
                  }

                  // 4. 路由决策
                  const hasFiles = availableFiles.length > 0;

                  // 情况 1：明确需要文件分析
                  if (intent.needsFiles && !intent.needsDatabase) {
                    if (!hasFileStorage) {
                      return "临时分析层未启用。请联系管理员配置 S3/MinIO 存储。";
                    }
                    if (!hasFiles) {
                      return "当前工作区没有可分析的文件。请先上传 CSV 或 Excel 文件，然后使用 duckdb-agent 进行分析。";
                    }

                    const fileList = availableFiles
                      .slice(0, 5)
                      .map((f) => f.key.split("/").pop())
                      .join(", ");
                    return `推荐使用 **duckdb-agent** 分析文件数据。\n\n可用文件: ${fileList}\n\n请使用 duckdb-list-files 查看完整列表，然后用 duckdb-query 执行查询。`;
                  }

                  // 情况 2：明确需要数据库查询
                  if (intent.needsDatabase && !intent.needsFiles) {
                    if (!hasDatabaseConnections) {
                      return "未配置数据库连接。请联系管理员在系统设置中添加数据库连接。";
                    }
                    return `推荐使用 **sql-agent** 查询业务数据库。\n\n请使用 sql-list-database 查看可用数据库，然后用 sql-query 执行查询。`;
                  }

                  // 情况 3：混合需求或不明确
                  if (intent.needsDatabase && intent.needsFiles) {
                    return (
                      `您的查询可能涉及多种数据源：\n\n` +
                      `- 业务数据库（使用 sql-agent）\n` +
                      `- 临时文件（使用 duckdb-agent）\n\n` +
                      `建议将查询拆分为两部分，分别处理不同数据源。`
                    );
                  }

                  // 情况 4：无法判断，提供选项
                  let options = [];
                  if (hasDatabaseConnections) {
                    options.push("- 查询业务数据库：使用 sql-agent");
                  }
                  if (hasFiles) {
                    options.push("- 分析上传的文件：使用 duckdb-agent");
                  }

                  if (options.length === 0) {
                    return "当前工作区没有可用的数据源。请先配置数据库连接或上传数据文件。";
                  }

                  return `请明确您要分析的数据来源：\n\n${options.join("\n")}\n\n请告诉我您想分析哪种数据。`;
                } catch (e) {
                  console.error("[smart-data-router]", e);
                  return `路由分析失败: ${e.message}`;
                }
              },
            });
          },
        };
      },
    },
  ],
};

module.exports = { smartDataRouter };
