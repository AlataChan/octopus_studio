const {
  validateSqlQuery,
} = require("../../utils/agents/aibitat/plugins/sql-agent/queryValidator");

describe("SQL agent queryValidator", () => {
  test("simple SELECT injects default LIMIT 1000", () => {
    const result = validateSqlQuery({ sql: "SELECT * FROM customers" });

    expect(result.ok).toBe(true);
    expect(result.normalizedSql).toMatch(/LIMIT 1000/i);
  });

  test("SELECT with LIMIT 100 keeps the existing lower limit", () => {
    const result = validateSqlQuery({
      sql: "SELECT * FROM customers LIMIT 100",
    });

    expect(result.ok).toBe(true);
    expect(result.normalizedSql).toMatch(/LIMIT 100\b/i);
  });

  test("SELECT with LIMIT 5000 is lowered to defaultRowLimit", () => {
    const result = validateSqlQuery({
      sql: "SELECT * FROM customers LIMIT 5000",
      defaultRowLimit: 1000,
    });

    expect(result.ok).toBe(true);
    expect(result.normalizedSql).toMatch(/LIMIT 1000\b/i);
    expect(result.normalizedSql).not.toMatch(/LIMIT 5000\b/i);
  });

  test("INSERT is denied when allowWrites is false", () => {
    const result = validateSqlQuery({
      sql: "INSERT INTO customers(id) VALUES (1)",
      allowWrites: false,
    });

    expect(result).toEqual({
      ok: false,
      code: "WRITE_DENIED",
      error: expect.any(String),
    });
  });

  test("INSERT is allowed when allowWrites is true", () => {
    const result = validateSqlQuery({
      sql: "INSERT INTO customers(id) VALUES (1)",
      allowWrites: true,
    });

    expect(result.ok).toBe(true);
    expect(result.normalizedSql).toMatch(/^INSERT/i);
  });

  test("DROP TABLE is always denied", () => {
    const result = validateSqlQuery({
      sql: "DROP TABLE customers",
      allowWrites: true,
    });

    expect(result).toEqual({
      ok: false,
      code: "DDL_DENIED",
      error: expect.any(String),
    });
  });

  test("ALTER TABLE is always denied", () => {
    const result = validateSqlQuery({
      sql: "ALTER TABLE customers ADD COLUMN foo TEXT",
      allowWrites: true,
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe("DDL_DENIED");
  });

  test("TRUNCATE is always denied", () => {
    const result = validateSqlQuery({
      sql: "TRUNCATE TABLE customers",
      allowWrites: true,
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe("DDL_DENIED");
  });

  test("multi-statement SQL is denied", () => {
    const result = validateSqlQuery({ sql: "SELECT 1; SELECT 2" });

    expect(result.ok).toBe(false);
    expect(result.code).toBe("MULTI_STATEMENT_DENIED");
  });

  test("syntax errors return PARSE_ERROR", () => {
    const result = validateSqlQuery({ sql: "SELECT FROM" });

    expect(result.ok).toBe(false);
    expect(result.code).toBe("PARSE_ERROR");
  });

  test("WITH CTE SELECT is accepted and limited", () => {
    const result = validateSqlQuery({
      sql: "WITH recent AS (SELECT * FROM customers) SELECT * FROM recent",
    });

    expect(result.ok).toBe(true);
    expect(result.normalizedSql).toMatch(/^WITH/i);
    expect(result.normalizedSql).toMatch(/LIMIT 1000/i);
  });
});
