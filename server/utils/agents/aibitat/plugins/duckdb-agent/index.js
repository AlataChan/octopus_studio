/**
 * @fileoverview DuckDB Agent 插件
 * 支持直接查询 S3/MinIO 上的 Excel/CSV 文件
 */

const { DuckDbListFiles } = require("./list-files");
const { DuckDbQuery } = require("./query");
const { DuckDbGetFileSchema } = require("./get-file-schema");

const duckdbAgent = {
  name: "duckdb-agent",
  startupConfig: {
    params: {},
  },
  plugin: [DuckDbListFiles, DuckDbGetFileSchema, DuckDbQuery],
};

module.exports = {
  duckdbAgent,
};
