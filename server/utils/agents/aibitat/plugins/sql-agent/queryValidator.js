const { Parser } = require("node-sql-parser");

const DDL_TYPES = new Set(["drop", "alter", "truncate"]);
const WRITE_TYPES = new Set(["insert", "update", "delete"]);
const SUPPORTED_READ_TYPES = new Set(["select"]);

function parserDialect(dialect = "postgresql") {
  if (dialect === "sql-server" || dialect === "mssql") return "transactsql";
  if (dialect === "postgres") return "postgresql";
  return dialect || "postgresql";
}

function errorResult(code, error) {
  return { ok: false, code, error };
}

function astType(ast) {
  return String(ast?.type || "").toLowerCase();
}

function statementList(ast) {
  if (Array.isArray(ast)) return ast;
  return ast ? [ast] : [];
}

function containsStatementType(node, targetTypes) {
  if (!node || typeof node !== "object") return false;
  if (targetTypes.has(astType(node))) return true;

  return Object.values(node).some((value) => {
    if (Array.isArray(value)) {
      return value.some((item) => containsStatementType(item, targetTypes));
    }
    return containsStatementType(value, targetTypes);
  });
}

function parseLimitValue(limitNode) {
  const firstLimit = limitNode?.value?.[0];
  if (!firstLimit) return null;
  const value = Number(firstLimit.value);
  return Number.isFinite(value) ? value : null;
}

function setSelectLimit(ast, defaultRowLimit, dialect) {
  if (astType(ast) !== "select") return ast;
  const safeLimit = Math.max(1, Number(defaultRowLimit) || 1000);

  if (parserDialect(dialect) === "transactsql") {
    const currentTop = Number(ast.top?.value);
    if (!Number.isFinite(currentTop) || currentTop > safeLimit) {
      ast.top = { value: safeLimit, percent: null };
    }
    return ast;
  }

  const currentLimit = parseLimitValue(ast.limit);
  if (!Number.isFinite(currentLimit) || currentLimit > safeLimit) {
    ast.limit = {
      seperator: "",
      value: [{ type: "number", value: safeLimit }],
    };
  }
  return ast;
}

function normalizeSql(ast, dialect) {
  const parser = new Parser();
  return parser.sqlify(ast, { database: parserDialect(dialect) });
}

/**
 * Validate and normalize a SQL agent query.
 * @param {Object} params
 * @param {string} params.sql
 * @param {boolean} [params.allowWrites=false]
 * @param {string} [params.dialect='postgresql']
 * @param {number} [params.defaultRowLimit=1000]
 * @returns {{ok: true, normalizedSql: string}|{ok: false, error: string, code: string}}
 */
function validateSqlQuery({
  sql,
  allowWrites = false,
  dialect = "postgresql",
  defaultRowLimit = 1000,
}) {
  if (!sql || typeof sql !== "string") {
    return errorResult("PARSE_ERROR", "SQL query is empty.");
  }

  const parser = new Parser();
  let ast;
  try {
    ast = parser.astify(sql, { database: parserDialect(dialect) });
  } catch (error) {
    if (/^\s*(drop|alter|truncate)\b/i.test(sql)) {
      return errorResult(
        "DDL_DENIED",
        "DDL statements are not allowed for SQL agent queries."
      );
    }
    return errorResult("PARSE_ERROR", `Unable to parse SQL: ${error.message}`);
  }

  const statements = statementList(ast);
  if (statements.length !== 1) {
    return errorResult(
      "MULTI_STATEMENT_DENIED",
      "SQL agent only accepts a single SQL statement."
    );
  }

  const statement = statements[0];
  if (containsStatementType(statement, DDL_TYPES)) {
    return errorResult(
      "DDL_DENIED",
      "DROP, ALTER, and TRUNCATE statements are never allowed."
    );
  }

  const type = astType(statement);
  if (WRITE_TYPES.has(type) && !allowWrites) {
    return errorResult(
      "WRITE_DENIED",
      "Write statements require SQL_AGENT_WRITE_ENABLED=true and toolConfig.allowWrites=true."
    );
  }

  if (!SUPPORTED_READ_TYPES.has(type) && !WRITE_TYPES.has(type)) {
    return errorResult(
      "WRITE_DENIED",
      `SQL statement type '${type || "unknown"}' is not allowed.`
    );
  }

  const normalizedAst = setSelectLimit(statement, defaultRowLimit, dialect);
  return {
    ok: true,
    normalizedSql: normalizeSql(normalizedAst, dialect),
  };
}

module.exports = {
  validateSqlQuery,
  parserDialect,
};
