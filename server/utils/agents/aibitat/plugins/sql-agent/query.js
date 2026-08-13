module.exports.SqlAgentQuery = {
  name: "sql-query",
  startupConfig: {
    params: {
      allowWrites: {
        required: false,
        default: false,
      },
    },
  },
  plugin: function (toolConfig = {}) {
    const {
      getDBClient,
      listSQLConnections,
    } = require("./SQLConnectors/index.js");
    const { validateSqlQuery, parserDialect } = require("./queryValidator");

    const warnedWritableDatabases = new Set();

    function envFlagEnabled(value) {
      return String(value || "").toLowerCase() === "true";
    }

    function parsePositiveInteger(value, fallback) {
      const parsed = Number.parseInt(value, 10);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
    }

    function defaultRowLimit() {
      return parsePositiveInteger(
        process.env.SQL_AGENT_DEFAULT_ROW_LIMIT,
        1000
      );
    }

    function statementTimeoutMs() {
      return parsePositiveInteger(
        process.env.SQL_AGENT_STATEMENT_TIMEOUT_MS,
        10000
      );
    }

    function writesAllowed() {
      return (
        envFlagEnabled(process.env.SQL_AGENT_WRITE_ENABLED) &&
        toolConfig.allowWrites === true
      );
    }

    async function warnIfDbRoleCanWrite(db, databaseConfig, log) {
      const databaseId = databaseConfig.database_id;
      if (warnedWritableDatabases.has(databaseId)) return;
      warnedWritableDatabases.add(databaseId);

      if (typeof db.checkWritePermissions !== "function") return;

      try {
        const permissions = await db.checkWritePermissions();
        if (permissions?.hasWrite) {
          const message = `[SQL Agent] Database connection "${databaseId}" appears to have INSERT/UPDATE/DELETE privileges. Use a dedicated read-only DB role in production.`;
          console.warn(message);
          log?.(message);
        }
      } catch (error) {
        log?.(
          `[SQL Agent] Unable to verify database role permissions for "${databaseId}": ${error.message}`
        );
      }
    }

    return {
      name: "sql-query",
      setup(aibitat) {
        aibitat.function({
          super: aibitat,
          name: this.name,
          description:
            "Run a read-only SQL query on a `database_id` which will return up rows of data related to the query. The query must only be SELECT statements which do not modify the table data. There should be a reasonable LIMIT on the return quantity to prevent long-running or queries which crash the db.",
          examples: [
            {
              prompt: "How many customers are in dvd-rentals?",
              call: JSON.stringify({
                database_id: "dvd-rentals",
                sql_query: "SELECT * FROM customers",
              }),
            },
            {
              prompt: "Can you tell me the total volume of sales last month?",
              call: JSON.stringify({
                database_id: "sales-db",
                sql_query:
                  "SELECT SUM(sale_amount) AS total_sales FROM sales WHERE sale_date >= DATEADD(month, -1, DATEFROMPARTS(YEAR(GETDATE()), MONTH(GETDATE()), 1)) AND sale_date < DATEFROMPARTS(YEAR(GETDATE()), MONTH(GETDATE()), 1)",
              }),
            },
            {
              prompt:
                "Do we have anyone in the staff table for our production db named 'sam'? ",
              call: JSON.stringify({
                database_id: "production",
                sql_query:
                  "SElECT * FROM staff WHERE first_name='sam%' OR last_name='sam%'",
              }),
            },
          ],
          parameters: {
            $schema: "http://json-schema.org/draft-07/schema#",
            type: "object",
            properties: {
              database_id: {
                type: "string",
                description:
                  "The database identifier for which we will connect to to query the table schema. This is required to run the SQL query.",
              },
              sql_query: {
                type: "string",
                description:
                  "The raw SQL query to run. Should be a query which does not modify the table and will return results.",
              },
            },
            additionalProperties: false,
          },
          required: ["database_id", "sql_query"],
          handler: async function ({ database_id = "", sql_query = "" }) {
            this.super.handlerProps.log(`Using the sql-query tool.`);
            try {
              const databaseConfig = (await listSQLConnections()).find(
                (db) => db.database_id === database_id
              );
              if (!databaseConfig) {
                this.super.handlerProps.log(
                  `sql-query failed to find config!`,
                  database_id
                );
                return `No database connection for ${database_id} was found!`;
              }

              this.super.introspect(
                `${this.caller}: Im going to run a query on the ${database_id} to get an answer.`
              );
              const db = getDBClient(databaseConfig.engine, databaseConfig);
              await warnIfDbRoleCanWrite(
                db,
                databaseConfig,
                this.super.handlerProps.log
              );

              const validation = validateSqlQuery({
                sql: sql_query,
                allowWrites: writesAllowed(),
                dialect: parserDialect(databaseConfig.engine),
                defaultRowLimit: defaultRowLimit(),
              });
              if (!validation.ok) {
                this.super.handlerProps.log(
                  `sql-query validation failed`,
                  validation.code,
                  validation.error
                );
                this.super.introspect(`SQL rejected: ${validation.error}`);
                return `There was an error validating the query: ${validation.error}`;
              }

              this.super.introspect(`Running SQL: ${validation.normalizedSql}`);
              const result = await db.runQuery(validation.normalizedSql, {
                statementTimeoutMs: statementTimeoutMs(),
              });
              if (result.error) {
                this.super.handlerProps.log(
                  `sql-query tool reported error`,
                  result.error
                );
                this.super.introspect(`Error: ${result.error}`);
                return `There was an error running the query: ${result.error}`;
              }

              return JSON.stringify(result);
            } catch (e) {
              console.error(e);
              return e.message;
            }
          },
        });
      },
    };
  },
};
