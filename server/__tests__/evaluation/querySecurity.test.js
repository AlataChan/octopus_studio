/* eslint-env jest */
const {
  validateQuery,
  enforceLimit,
  maskSensitiveFields,
  secureQueryWrapper,
  DANGEROUS_KEYWORDS,
} = require("../../utils/agents/aibitat/plugins/sql-agent/querySecurity");

describe("QuerySecurity", () => {
  describe("validateQuery", () => {
    it("空查询应返回无效", () => {
      const result = validateQuery("");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("不能为空");
    });

    it("SELECT 查询应有效", () => {
      const result = validateQuery("SELECT * FROM users");
      expect(result.valid).toBe(true);
      expect(result.error).toBeNull();
    });

    it("INSERT 查询应无效", () => {
      const result = validateQuery("INSERT INTO users VALUES (1, 'test')");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("只允许执行");
    });

    it("UPDATE 查询应无效", () => {
      const result = validateQuery("UPDATE users SET name = 'test'");
      expect(result.valid).toBe(false);
    });

    it("DELETE 查询应无效", () => {
      const result = validateQuery("DELETE FROM users");
      expect(result.valid).toBe(false);
    });

    it("DROP 查询应无效", () => {
      const result = validateQuery("DROP TABLE users");
      expect(result.valid).toBe(false);
    });

    it("应检测危险关键字", () => {
      const result = validateQuery("SELECT * FROM users; DROP TABLE users");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("DROP");
    });

    it("无 LIMIT 应产生警告", () => {
      const result = validateQuery("SELECT * FROM users");
      expect(result.valid).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain("LIMIT");
    });

    it("有 LIMIT 不应产生警告", () => {
      const result = validateQuery("SELECT * FROM users LIMIT 10");
      expect(result.valid).toBe(true);
      expect(result.warnings.filter((w) => w.includes("LIMIT"))).toHaveLength(0);
    });
  });

  describe("enforceLimit", () => {
    it("无 LIMIT 应添加默认限制", () => {
      const query = enforceLimit("SELECT * FROM users");
      expect(query).toContain("LIMIT 100");
    });

    it("应使用自定义默认限制", () => {
      const query = enforceLimit("SELECT * FROM users", 1000, 50);
      expect(query).toContain("LIMIT 50");
    });

    it("超过最大限制应替换", () => {
      const query = enforceLimit("SELECT * FROM users LIMIT 5000", 1000);
      expect(query).toContain("LIMIT 1000");
      expect(query).not.toContain("5000");
    });

    it("未超过最大限制应保持不变", () => {
      const query = enforceLimit("SELECT * FROM users LIMIT 50", 1000);
      expect(query).toContain("LIMIT 50");
    });
  });

  describe("maskSensitiveFields", () => {
    it("空数据应返回空数组", () => {
      expect(maskSensitiveFields([], ["password"])).toEqual([]);
      expect(maskSensitiveFields(null, ["password"])).toBeNull();
    });

    it("无敏感字段应返回原数据", () => {
      const rows = [{ id: 1, name: "test" }];
      expect(maskSensitiveFields(rows, [])).toEqual(rows);
    });

    it("应脱敏敏感字段", () => {
      const rows = [
        { id: 1, name: "test", password: "secret123", email: "test@example.com" },
      ];
      const masked = maskSensitiveFields(rows, ["password", "email"]);

      expect(masked[0].id).toBe(1);
      expect(masked[0].name).toBe("test");
      expect(masked[0].password).toBe("***");
      expect(masked[0].email).toBe("***");
    });

    it("应支持自定义脱敏模式", () => {
      const rows = [{ password: "secret" }];
      const masked = maskSensitiveFields(rows, ["password"], "[REDACTED]");

      expect(masked[0].password).toBe("[REDACTED]");
    });

    it("应忽略大小写", () => {
      const rows = [{ PASSWORD: "secret", Email: "test@example.com" }];
      const masked = maskSensitiveFields(rows, ["password", "email"]);

      expect(masked[0].PASSWORD).toBe("***");
      expect(masked[0].Email).toBe("***");
    });
  });

  describe("secureQueryWrapper", () => {
    it("应拒绝无效查询", async () => {
      const mockQueryFn = jest.fn();
      const result = await secureQueryWrapper(mockQueryFn, "DELETE FROM users");

      expect(result.error).toBeDefined();
      expect(mockQueryFn).not.toHaveBeenCalled();
    });

    it("应执行有效查询", async () => {
      const mockQueryFn = jest.fn().mockResolvedValue({
        rows: [{ id: 1 }],
        count: 1,
        error: null,
      });

      const result = await secureQueryWrapper(mockQueryFn, "SELECT * FROM users");

      expect(result.rows).toHaveLength(1);
      expect(mockQueryFn).toHaveBeenCalled();
    });

    it("应自动添加 LIMIT", async () => {
      const mockQueryFn = jest.fn().mockResolvedValue({
        rows: [],
        count: 0,
        error: null,
      });

      await secureQueryWrapper(mockQueryFn, "SELECT * FROM users");

      expect(mockQueryFn).toHaveBeenCalledWith(expect.stringContaining("LIMIT"));
    });

    it("应脱敏敏感字段", async () => {
      const mockQueryFn = jest.fn().mockResolvedValue({
        rows: [{ id: 1, password: "secret" }],
        count: 1,
        error: null,
      });

      const result = await secureQueryWrapper(mockQueryFn, "SELECT * FROM users", {
        sensitiveFields: ["password"],
      });

      expect(result.rows[0].password).toBe("***");
    });

    it("应处理超时", async () => {
      const mockQueryFn = jest.fn().mockImplementation(() => new Promise(() => {}));

      const result = await secureQueryWrapper(mockQueryFn, "SELECT * FROM users", {
        queryTimeout: 100,
      });

      expect(result.error).toContain("超时");
    });
  });
});
