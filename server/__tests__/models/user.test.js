/**
 * User 模型单元测试
 * 测试用户验证、过滤和核心方法
 */

const { User } = require("../../models/user");

// Mock Prisma
jest.mock("../../utils/prisma", () => ({
  users: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
}));

// Mock EventLogs
jest.mock("../../models/eventLogs", () => ({
  EventLogs: {
    logEvent: jest.fn(),
  },
}));

const prisma = require("../../utils/prisma");

describe("User Model", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("usernameRegex", () => {
    it("should accept valid usernames", () => {
      expect(User.usernameRegex.test("john_doe")).toBe(true);
      expect(User.usernameRegex.test("user123")).toBe(true);
      expect(User.usernameRegex.test("test-user")).toBe(true);
      expect(User.usernameRegex.test("user.name")).toBe(true);
    });

    it("should reject invalid usernames", () => {
      expect(User.usernameRegex.test("John Doe")).toBe(false); // 空格
      expect(User.usernameRegex.test("User@123")).toBe(false); // 特殊字符
      expect(User.usernameRegex.test("用户名")).toBe(false); // 中文
    });
  });

  describe("validations.username", () => {
    it("should accept valid username length", () => {
      expect(User.validations.username("ab")).toBe("ab");
      expect(User.validations.username("validuser")).toBe("validuser");
    });

    it("should reject username too short", () => {
      expect(() => User.validations.username("a")).toThrow(
        "Username must be at least 2 characters"
      );
    });

    it("should reject username too long", () => {
      const longUsername = "a".repeat(101);
      expect(() => User.validations.username(longUsername)).toThrow(
        "Username cannot be longer than 100 characters"
      );
    });
  });

  describe("validations.role", () => {
    it("should accept valid roles", () => {
      expect(User.validations.role("default")).toBe("default");
      expect(User.validations.role("admin")).toBe("admin");
      expect(User.validations.role("manager")).toBe("manager");
    });

    it("should reject invalid roles", () => {
      expect(() => User.validations.role("superadmin")).toThrow(
        "Invalid role"
      );
      expect(() => User.validations.role("guest")).toThrow("Invalid role");
    });
  });

  describe("validations.dailyMessageLimit", () => {
    it("should accept null value", () => {
      expect(User.validations.dailyMessageLimit(null)).toBeNull();
    });

    it("should accept valid positive numbers", () => {
      expect(User.validations.dailyMessageLimit(1)).toBe(1);
      expect(User.validations.dailyMessageLimit(100)).toBe(100);
    });

    it("should reject invalid values", () => {
      expect(() => User.validations.dailyMessageLimit(0)).toThrow();
      expect(() => User.validations.dailyMessageLimit(-1)).toThrow();
      expect(() => User.validations.dailyMessageLimit("abc")).toThrow();
    });
  });

  describe("validations.bio", () => {
    it("should accept valid bio", () => {
      expect(User.validations.bio("Hello, I am a user")).toBe(
        "Hello, I am a user"
      );
    });

    it("should return empty string for invalid input", () => {
      expect(User.validations.bio(null)).toBe("");
      expect(User.validations.bio(undefined)).toBe("");
    });

    it("should reject bio too long", () => {
      const longBio = "a".repeat(1001);
      expect(() => User.validations.bio(longBio)).toThrow(
        "Bio cannot be longer than 1,000 characters"
      );
    });
  });

  describe("filterFields", () => {
    it("should remove password from user object", () => {
      const user = {
        id: 1,
        username: "testuser",
        password: "secret123",
        role: "default",
      };

      const filtered = User.filterFields(user);

      expect(filtered.password).toBeUndefined();
      expect(filtered.id).toBe(1);
      expect(filtered.username).toBe("testuser");
      expect(filtered.role).toBe("default");
    });

    it("should handle empty object", () => {
      const filtered = User.filterFields({});
      expect(filtered).toEqual({});
    });
  });

  describe("castColumnValue", () => {
    it("should cast suspended to number", () => {
      expect(User.castColumnValue("suspended", true)).toBe(1);
      expect(User.castColumnValue("suspended", false)).toBe(0);
    });

    it("should cast dailyMessageLimit correctly", () => {
      expect(User.castColumnValue("dailyMessageLimit", null)).toBeNull();
      expect(User.castColumnValue("dailyMessageLimit", 50)).toBe(50);
    });

    it("should cast other values to string", () => {
      expect(User.castColumnValue("username", 123)).toBe("123");
      expect(User.castColumnValue("role", "admin")).toBe("admin");
    });
  });
});

