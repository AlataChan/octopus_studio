/**
 * @fileoverview 列出工作区可分析的文件
 */

const S3Client = require("../../../../storage/S3Client");

module.exports.DuckDbListFiles = {
  name: "duckdb-list-files",
  plugin: function () {
    return {
      name: "duckdb-list-files",
      setup(aibitat) {
        aibitat.function({
          super: aibitat,
          name: this.name,
          description:
            "List all analysis files (CSV/Excel) uploaded to the current workspace via the data analysis button (📊). Returns file keys (format: workspace-{id}/{timestamp}-{filename}) that can be used for querying with duckdb-query. Use this tool when user mentions: data files, uploaded files with file paths starting with 'workspace-', or CSV/Excel analysis.",
          examples: [
            {
              prompt: "What files can I analyze?",
              call: JSON.stringify({ workspace_id: 1 }),
            },
            {
              prompt: "Show me the available data files",
              call: JSON.stringify({ workspace_id: 1 }),
            },
            {
              prompt:
                "分析我刚上传的数据文件（文件路径: workspace-1/xxx.xlsx）",
              call: JSON.stringify({ workspace_id: 1 }),
            },
          ],
          parameters: {
            $schema: "http://json-schema.org/draft-07/schema#",
            type: "object",
            properties: {
              workspace_id: {
                type: "number",
                description: "The workspace ID to list files for.",
              },
            },
            additionalProperties: false,
            required: ["workspace_id"],
          },
          handler: async function ({ workspace_id }) {
            this.super.handlerProps.log(`Using duckdb-list-files tool.`);

            try {
              if (!S3Client.isEnabled()) {
                return "临时分析层未启用，请联系管理员配置 S3/MinIO。";
              }

              const files = await S3Client.listWorkspaceFiles(workspace_id);

              if (files.length === 0) {
                return "当前工作区没有可分析的文件。请先上传 CSV 或 Excel 文件。";
              }

              const fileList = files
                .map((f) => {
                  const fileName = f.key.split("/").pop();
                  const sizeKB = Math.round(f.size / 1024);
                  // 返回完整的 file_key 路径，供 duckdb-query 和 duckdb-get-file-schema 使用
                  return `- file_key: "${f.key}" (文件名: ${fileName}, ${sizeKB} KB, 上传于 ${f.lastModified.toLocaleDateString()})`;
                })
                .join("\n");

              return `当前工作区有以下可分析文件：\n${fileList}\n\n**重要**: 使用 duckdb-query 或 duckdb-get-file-schema 时，请使用完整的 file_key（如 "workspace-${workspace_id}/xxx.xlsx"），不要只用文件名。`;
            } catch (e) {
              console.error("[duckdb-list-files]", e);
              return `获取文件列表失败: ${e.message}`;
            }
          },
        });
      },
    };
  },
};
