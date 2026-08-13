/**
 * Doris Data Platform Tool
 *
 * @description
 * 连接 doris-sga 数据中台，提供自然语言数据查询能力。
 * 支持 Text-to-SQL、表管理、数据查询等功能。
 *
 * @requires DORIS_API_URL 环境变量配置 doris-sga API 地址
 */

const dorisDataPlatform = {
  name: "doris-data-platform",
  startupConfig: {
    params: {},
  },
  plugin: function () {
    return {
      name: this.name,
      setup(aibitat) {
        aibitat.function({
          super: aibitat,
          name: this.name,
          description:
            "使用自然语言查询企业数据中台。可以用中文提问数据相关问题，系统会自动转换为 SQL 并返回结果。需要企业部署 doris-sga 数据中台。",
          examples: [
            {
              prompt: "查询2024年销售额最高的前10个产品",
              call: JSON.stringify({
                action: "natural_query",
                query: "2024年销售额最高的前10个产品",
              }),
            },
            {
              prompt: "统计每个部门的员工数量",
              call: JSON.stringify({
                action: "natural_query",
                query: "统计每个部门的员工数量",
              }),
            },
            {
              prompt: "数据中台有哪些表",
              call: JSON.stringify({ action: "list_tables" }),
            },
            {
              prompt: "查看 orders 表的结构",
              call: JSON.stringify({
                action: "table_schema",
                table: "orders",
              }),
            },
          ],
          parameters: {
            $schema: "http://json-schema.org/draft-07/schema#",
            type: "object",
            properties: {
              action: {
                type: "string",
                enum: [
                  "natural_query",
                  "list_tables",
                  "table_schema",
                  "health",
                ],
                description:
                  "操作类型：natural_query(自然语言查询)、list_tables(列出所有表)、table_schema(查看表结构)、health(健康检查)",
              },
              query: {
                type: "string",
                description:
                  "自然语言查询问题，仅在 action=natural_query 时使用",
              },
              table: {
                type: "string",
                description: "表名，仅在 action=table_schema 时使用",
              },
            },
            required: ["action"],
            additionalProperties: false,
          },

          /**
           * 获取 Doris API 基础地址
           */
          getBaseUrl: function () {
            return process.env.DORIS_API_URL || "http://localhost:8018";
          },

          /**
           * 检查 Doris 服务是否可用
           */
          isConfigured: function () {
            const url = this.getBaseUrl();
            return url && url !== "http://localhost:8018";
          },

          handler: async function ({ action, query, table }) {
            const baseUrl = this.getBaseUrl();

            // 检查配置
            if (!process.env.DORIS_API_URL) {
              this.super.introspect(
                `${this.caller}: 数据中台未配置。需要设置 DORIS_API_URL 环境变量。`
              );
              return JSON.stringify({
                success: false,
                error:
                  "数据中台未配置。请联系管理员设置 DORIS_API_URL 环境变量指向 doris-sga 服务地址。",
                hint: "示例: DORIS_API_URL=http://your-doris-server:8018",
              });
            }

            try {
              switch (action) {
                case "health":
                  return await this.healthCheck(baseUrl);
                case "list_tables":
                  return await this.listTables(baseUrl);
                case "table_schema":
                  return await this.getTableSchema(baseUrl, table);
                case "natural_query":
                  return await this.naturalQuery(baseUrl, query);
                default:
                  return JSON.stringify({
                    success: false,
                    error: `未知操作: ${action}`,
                  });
              }
            } catch (error) {
              this.super.handlerProps.log(
                `Doris Data Platform Error: ${error.message}`
              );
              return JSON.stringify({
                success: false,
                error: error.message,
                hint: "请检查 doris-sga 服务是否正常运行",
              });
            }
          },

          /**
           * 健康检查
           */
          healthCheck: async function (baseUrl) {
            this.super.introspect(`${this.caller}: 检查数据中台连接状态...`);
            const response = await fetch(`${baseUrl}/api/health`);
            const data = await response.json();
            return JSON.stringify({
              success: true,
              message: "数据中台连接正常",
              ...data,
            });
          },

          /**
           * 列出所有表
           */
          listTables: async function (baseUrl) {
            this.super.introspect(`${this.caller}: 获取数据中台表列表...`);
            const response = await fetch(`${baseUrl}/api/tables`);
            const data = await response.json();
            this.super.introspect(
              `${this.caller}: 发现 ${data.tables?.length || 0} 个数据表`
            );
            return JSON.stringify(data);
          },

          /**
           * 获取表结构
           */
          getTableSchema: async function (baseUrl, tableName) {
            if (!tableName) {
              return JSON.stringify({
                success: false,
                error: "请指定表名",
              });
            }

            this.super.introspect(
              `${this.caller}: 获取表 ${tableName} 的结构...`
            );
            const response = await fetch(
              `${baseUrl}/api/tables/${tableName}/schema`
            );
            const data = await response.json();
            return JSON.stringify(data);
          },

          /**
           * 自然语言查询 (核心功能)
           */
          naturalQuery: async function (baseUrl, question) {
            if (!question) {
              return JSON.stringify({
                success: false,
                error: "请提供查询问题",
              });
            }

            this.super.introspect(
              `${this.caller}: 正在分析问题并生成 SQL: "${question.length > 50 ? question.slice(0, 50) + "..." : question}"`
            );

            const response = await fetch(`${baseUrl}/api/query/natural`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ query: question }),
            });

            if (!response.ok) {
              const errorText = await response.text();
              throw new Error(`查询失败: ${response.status} - ${errorText}`);
            }

            const data = await response.json();

            if (data.success) {
              this.super.introspect(
                `${this.caller}: 查询成功，返回 ${data.count || 0} 条记录`
              );

              // 格式化输出
              return JSON.stringify({
                success: true,
                question: question,
                generated_sql: data.sql,
                result: data.data,
                record_count: data.count,
                hint: "如需更多分析，请继续提问",
              });
            }

            return JSON.stringify(data);
          },
        });
      },
    };
  },
};

module.exports = {
  dorisDataPlatform,
};
