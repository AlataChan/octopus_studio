/**
 * @fileoverview DuckDB 查询工具
 * 支持对 CSV/Excel 文件执行 SQL 查询
 */

const { getDuckDbConnector } = require("./DuckDbConnector");
const S3Client = require("../../../../storage/S3Client");

module.exports.DuckDbQuery = {
  name: "duckdb-query",
  plugin: function () {
    return {
      name: "duckdb-query",
      setup(aibitat) {
        aibitat.function({
          super: aibitat,
          name: this.name,
          description:
            "Execute a SQL query on a CSV or Excel file. Use 'file' or 'data' as the table name in your query. Only SELECT queries are allowed.",
          examples: [
            {
              prompt: "Show me the first 10 rows of sales data",
              call: JSON.stringify({
                workspace_id: 1,
                file_key: "workspace-1/1234567890-sales.csv",
                sql_query: "SELECT * FROM file LIMIT 10",
              }),
            },
            {
              prompt: "What's the total revenue by region?",
              call: JSON.stringify({
                workspace_id: 1,
                file_key: "workspace-1/1234567890-sales.csv",
                sql_query:
                  "SELECT region, SUM(revenue) as total_revenue FROM file GROUP BY region ORDER BY total_revenue DESC",
              }),
            },
            {
              prompt: "How many unique customers do we have?",
              call: JSON.stringify({
                workspace_id: 1,
                file_key: "workspace-1/1234567890-customers.xlsx",
                sql_query:
                  "SELECT COUNT(DISTINCT customer_id) as unique_customers FROM data",
              }),
            },
          ],
          parameters: {
            $schema: "http://json-schema.org/draft-07/schema#",
            type: "object",
            properties: {
              workspace_id: {
                type: "number",
                description: "The workspace ID.",
              },
              file_key: {
                type: "string",
                description:
                  "The S3 key of the file to query (from duckdb-list-files).",
              },
              sql_query: {
                type: "string",
                description:
                  "The SQL query to execute. Use 'file' or 'data' as the table name. Only SELECT queries are allowed.",
              },
            },
            additionalProperties: false,
            required: ["workspace_id", "file_key", "sql_query"],
          },
          handler: async function ({ workspace_id, file_key, sql_query }) {
            this.super.handlerProps.log(`Using duckdb-query tool.`);

            try {
              if (!S3Client.isEnabled()) {
                return "临时分析层未启用。";
              }

              // 验证文件属于此工作区
              if (!file_key.startsWith(`workspace-${workspace_id}/`)) {
                return "无权访问此文件。";
              }

              // 安全检查：只允许 SELECT 查询
              const normalizedQuery = sql_query.trim().toUpperCase();
              if (!normalizedQuery.startsWith("SELECT")) {
                return "只允许 SELECT 查询，不能修改数据。";
              }

              // 检查危险关键字
              const dangerousKeywords = [
                "DROP",
                "DELETE",
                "INSERT",
                "UPDATE",
                "ALTER",
                "CREATE",
                "TRUNCATE",
              ];
              for (const keyword of dangerousKeywords) {
                if (normalizedQuery.includes(keyword)) {
                  return `不允许使用 ${keyword} 操作。`;
                }
              }

              this.super.introspect(`正在执行查询: ${sql_query}`);

              const connector = getDuckDbConnector();
              await connector.init();
              const filePath = connector.getFilePath(file_key);
              const result = await connector.queryFile(
                filePath,
                sql_query,
                1000
              );

              if (result.error) {
                this.super.introspect(`查询错误: ${result.error}`);
                return `查询执行失败: ${result.error}`;
              }

              if (result.rows.length === 0) {
                return "查询成功，但没有返回任何数据。";
              }

              // 格式化输出
              const rowCount = result.rows.length;
              const preview = result.rows.slice(0, 20);
              const jsonResult = JSON.stringify(preview, null, 2);

              let response = `查询成功，返回 ${rowCount} 行数据。\n\n`;
              if (rowCount > 20) {
                response += `以下是前 20 行：\n`;
              }
              response += `\`\`\`json\n${jsonResult}\n\`\`\``;

              return response;
            } catch (e) {
              console.error("[duckdb-query]", e);
              return `查询执行失败: ${e.message}`;
            }
          },
        });
      },
    };
  },
};
