const pgSql = require("pg");

class PostgresSQLConnector {
  #connected = false;
  constructor(
    config = {
      connectionString: null,
      schema: null,
    }
  ) {
    this.className = "PostgresSQLConnector";
    this.connectionString = config.connectionString;
    this.schema = config.schema || "public";
    this._client = new pgSql.Client({
      connectionString: this.connectionString,
    });
  }

  async connect() {
    await this._client.connect();
    this.#connected = true;
    return this._client;
  }

  /**
   *
   * @param {string} queryString the SQL query to be run
   * @returns {Promise<import(".").QueryResult>}
   */
  async runQuery(queryString = "", options = {}) {
    return this.runQueryWithOptions(queryString, options);
  }

  /**
   *
   * @param {string} queryString the SQL query to be run
   * @param {{statementTimeoutMs?: number}} options query execution controls
   * @returns {Promise<import(".").QueryResult>}
   */
  async runQueryWithOptions(queryString = "", options = {}) {
    const result = { rows: [], count: 0, error: null };
    let inTransaction = false;
    try {
      if (!this.#connected) await this.connect();
      const statementTimeoutMs = Number(options.statementTimeoutMs);

      if (Number.isFinite(statementTimeoutMs) && statementTimeoutMs > 0) {
        await this._client.query("BEGIN");
        inTransaction = true;
        await this._client.query(
          `SET LOCAL statement_timeout = ${Math.floor(statementTimeoutMs)}`
        );
      }

      const query = await this._client.query(queryString);
      result.rows = query.rows || [];
      result.count = query.rowCount || 0;

      if (inTransaction) {
        await this._client.query("COMMIT");
        inTransaction = false;
      }
    } catch (err) {
      if (inTransaction) {
        await this._client.query("ROLLBACK").catch(() => {});
      }
      console.log(this.className, err);
      result.error = err.message;
    } finally {
      // Check client is connected before closing since we use this for validation
      if (this._client) {
        await this._client.end();
        this.#connected = false;
      }
    }
    return result;
  }

  async checkWritePermissions() {
    try {
      if (!this.#connected) await this.connect();
      const query = await this._client.query(
        `
        SELECT EXISTS (
          SELECT 1
          FROM information_schema.tables
          WHERE table_schema = $1
            AND table_type = 'BASE TABLE'
            AND (
              has_table_privilege(current_user, format('%I.%I', table_schema, table_name), 'INSERT')
              OR has_table_privilege(current_user, format('%I.%I', table_schema, table_name), 'UPDATE')
              OR has_table_privilege(current_user, format('%I.%I', table_schema, table_name), 'DELETE')
            )
        ) AS has_write_permissions
        `,
        [this.schema]
      );

      return {
        hasWrite: Boolean(query.rows?.[0]?.has_write_permissions),
        error: null,
      };
    } catch (error) {
      return { hasWrite: false, error: error.message };
    } finally {
      if (this._client) {
        await this._client.end();
        this.#connected = false;
      }
    }
  }

  async validateConnection() {
    try {
      const result = await this.runQuery("SELECT 1");
      return { success: !result.error, error: result.error };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  getTablesSql() {
    return `SELECT * FROM pg_catalog.pg_tables WHERE schemaname = '${this.schema}'`;
  }
  getTableSchemaSql(table_name) {
    return ` select column_name, data_type, character_maximum_length, column_default, is_nullable from INFORMATION_SCHEMA.COLUMNS where table_name = '${table_name}' AND table_schema = '${this.schema}'`;
  }
}

module.exports.PostgresSQLConnector = PostgresSQLConnector;
