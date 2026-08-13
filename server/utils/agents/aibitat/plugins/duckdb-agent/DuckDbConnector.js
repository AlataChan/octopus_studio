/**
 * @fileoverview DuckDB 连接器
 * 支持直接读取 S3/MinIO 或本地文件系统上的 CSV/Excel 文件
 */

const duckdb = require("duckdb");
const path = require("path");
const S3Client = require("../../../../storage/S3Client");

/**
 * DuckDB 连接器类
 * 使用内存数据库执行查询
 */
class DuckDbConnector {
  constructor() {
    this.db = null;
    this.conn = null;
    this.storageBackend = null;
  }

  /**
   * 初始化 DuckDB 连接
   */
  async init() {
    if (this.db) return;

    this.db = new duckdb.Database(":memory:");
    this.conn = this.db.connect();
    this.storageBackend = S3Client.getStorageBackend();

    // S3 后端需要配置 httpfs 扩展
    if (this.storageBackend === "s3" && S3Client.isEnabled()) {
      // 安装并加载必要的扩展
      await this.runQuery("INSTALL httpfs;");
      await this.runQuery("LOAD httpfs;");

      const config = S3Client.getConfig();
      if (config) {
        await this.runQuery(
          `SET s3_endpoint='${config.endpoint.replace(/^https?:\/\//, "")}';`
        );
        await this.runQuery(
          `SET s3_access_key_id='${config.credentials.accessKeyId}';`
        );
        await this.runQuery(
          `SET s3_secret_access_key='${config.credentials.secretAccessKey}';`
        );
        await this.runQuery(`SET s3_region='${config.region}';`);
        await this.runQuery(`SET s3_url_style='path';`);

        // 如果是 HTTP（非 HTTPS），需要额外配置
        if (config.endpoint.startsWith("http://")) {
          await this.runQuery(`SET s3_use_ssl=false;`);
        }
      }
    }
    // 本地后端不需要额外配置，DuckDB 可以直接读取本地文件
  }

  /**
   * 获取文件的实际路径（S3 URL 或本地路径）
   * @param {string} fileKey - 文件 key (如 workspace-1/xxx.xlsx)
   * @returns {string} 实际可访问的文件路径
   */
  getFilePath(fileKey) {
    if (this.storageBackend === "s3") {
      const bucket = S3Client.getBucketName();
      return `s3://${bucket}/${fileKey}`;
    } else {
      // 本地文件系统
      const localDir = S3Client.getLocalStorageDir();
      return path.join(localDir, fileKey);
    }
  }

  /**
   * 执行 SQL 查询
   * @param {string} sql - SQL 查询语句
   * @returns {Promise<{rows: Array, columns: Array, error?: string}>}
   */
  async runQuery(sql) {
    await this.init();

    return new Promise((resolve) => {
      this.conn.all(sql, (err, rows) => {
        if (err) {
          resolve({ rows: [], columns: [], error: err.message });
        } else {
          const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
          resolve({ rows, columns, error: null });
        }
      });
    });
  }

  /**
   * 获取文件的表结构
   * @param {string} filePath - 文件路径 (S3 URL 或本地路径)
   * @returns {Promise<{columns: Array<{name: string, type: string}>, error?: string}>}
   */
  async getFileSchema(filePath) {
    await this.init();
    const ext = filePath.toLowerCase().slice(filePath.lastIndexOf("."));
    let sql;

    if (ext === ".csv") {
      sql = `DESCRIBE SELECT * FROM read_csv_auto('${filePath}', header=true) LIMIT 0;`;
    } else if (ext === ".xlsx" || ext === ".xls") {
      // DuckDB 支持 Excel 需要安装 spatial 扩展
      await this.runQuery("INSTALL spatial;");
      await this.runQuery("LOAD spatial;");
      sql = `DESCRIBE SELECT * FROM st_read('${filePath}') LIMIT 0;`;
    } else {
      return { columns: [], error: `不支持的文件格式: ${ext}` };
    }

    const result = await this.runQuery(sql);
    if (result.error) {
      return { columns: [], error: result.error };
    }

    return {
      columns: result.rows.map((row) => ({
        name: row.column_name || row.name,
        type: row.column_type || row.type,
      })),
      error: null,
    };
  }

  /**
   * 查询文件数据
   * @param {string} filePath - 文件路径 (S3 URL 或本地路径)
   * @param {string} sql - 用户 SQL（将文件路径替换为实际的 read_* 函数）
   * @param {number} limit - 返回行数限制
   * @returns {Promise<{rows: Array, columns: Array, error?: string}>}
   */
  async queryFile(filePath, userSql, limit = 1000) {
    await this.init();
    const ext = filePath.toLowerCase().slice(filePath.lastIndexOf("."));
    let tableExpr;

    if (ext === ".csv") {
      tableExpr = `read_csv_auto('${filePath}', header=true)`;
    } else if (ext === ".xlsx" || ext === ".xls") {
      await this.runQuery("INSTALL spatial;");
      await this.runQuery("LOAD spatial;");
      tableExpr = `st_read('${filePath}')`;
    } else {
      return { rows: [], columns: [], error: `不支持的文件格式: ${ext}` };
    }

    // 简单的 SQL 重写：将 FROM file 替换为实际的表达式
    // 用户可以写 SELECT * FROM file WHERE ...
    // 我们替换 "FROM file" 为 "FROM read_csv_auto(...)"
    let finalSql = userSql
      .replace(/FROM\s+file\b/gi, `FROM ${tableExpr}`)
      .replace(/FROM\s+data\b/gi, `FROM ${tableExpr}`);

    // 如果没有 LIMIT，添加默认限制
    if (!/LIMIT\s+\d+/i.test(finalSql)) {
      finalSql = `${finalSql} LIMIT ${limit}`;
    }

    return this.runQuery(finalSql);
  }

  /**
   * 关闭连接
   */
  close() {
    if (this.conn) {
      this.conn.close();
      this.conn = null;
    }
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

// 单例实例
let instance = null;

/**
 * 获取 DuckDB 连接器实例
 * @returns {DuckDbConnector}
 */
function getDuckDbConnector() {
  if (!instance) {
    instance = new DuckDbConnector();
  }
  return instance;
}

module.exports = {
  DuckDbConnector,
  getDuckDbConnector,
};
