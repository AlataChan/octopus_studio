/**
 * @fileoverview 获取文件的表结构
 */

const { getDuckDbConnector } = require("./DuckDbConnector");
const S3Client = require("../../../../storage/S3Client");

module.exports.DuckDbGetFileSchema = {
  name: "duckdb-get-file-schema",
  plugin: function () {
    return {
      name: "duckdb-get-file-schema",
      setup(aibitat) {
        aibitat.function({
          super: aibitat,
          name: this.name,
          description:
            "Get the schema (column names and types) of a CSV or Excel file. Use this before writing queries to understand the data structure.",
          examples: [
            {
              prompt: "What columns are in the sales.csv file?",
              call: JSON.stringify({
                workspace_id: 1,
                file_key: "workspace-1/1234567890-abc.csv",
              }),
            },
            {
              prompt: "Show me the structure of the data file",
              call: JSON.stringify({
                workspace_id: 1,
                file_key: "workspace-1/1234567890-def.xlsx",
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
                  "The S3 key of the file to inspect (from duckdb-list-files).",
              },
            },
            additionalProperties: false,
            required: ["workspace_id", "file_key"],
          },
          handler: async function ({ workspace_id, file_key }) {
            this.super.handlerProps.log(`Using duckdb-get-file-schema tool.`);

            try {
              if (!S3Client.isEnabled()) {
                return "临时分析层未启用。";
              }

              // 验证文件属于此工作区
              if (!file_key.startsWith(`workspace-${workspace_id}/`)) {
                return "无权访问此文件。";
              }

              this.super.introspect(`正在分析文件结构: ${file_key}`);

              const connector = getDuckDbConnector();
              await connector.init();
              const filePath = connector.getFilePath(file_key);
              const result = await connector.getFileSchema(filePath);

              if (result.error) {
                return `获取文件结构失败: ${result.error}`;
              }

              const schemaText = result.columns
                .map((col) => `- ${col.name}: ${col.type}`)
                .join("\n");

              return `文件 ${file_key.split("/").pop()} 的结构：\n${schemaText}\n\n共 ${result.columns.length} 列。使用 duckdb-query 工具查询数据。`;
            } catch (e) {
              console.error("[duckdb-get-file-schema]", e);
              return `获取文件结构失败: ${e.message}`;
            }
          },
        });
      },
    };
  },
};
