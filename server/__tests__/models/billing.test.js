/**
 * 计费系统单元测试
 * 测试 UserWallet, UsageLog, WorkspaceBudget 模型
 */

const { UserWallet, UsageLog, WorkspaceBudget } = require("../../models/billing");

// Mock Prisma
jest.mock("../../utils/prisma", () => ({
  users: {
    findMany: jest.fn(),
    count: jest.fn(),
  },
  user_wallets: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  wallet_topups: {
    create: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    aggregate: jest.fn(),
  },
  usage_logs: {
    create: jest.fn(),
    findMany: jest.fn(),
    aggregate: jest.fn(),
  },
  workspace_budgets: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  $transaction: jest.fn((callback) => callback(require("../../utils/prisma"))),
}));

const prisma = require("../../utils/prisma");

describe("Billing Models", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ==========================================
  // UsageLog 测试
  // ==========================================
  describe("UsageLog", () => {
    describe("getModelGroup", () => {
      it("should return international for Claude models", () => {
        expect(UsageLog.getModelGroup("claude-3-5-sonnet")).toBe("international");
        expect(UsageLog.getModelGroup("claude-3-opus")).toBe("premium");
      });

      it("should return international for GPT models", () => {
        expect(UsageLog.getModelGroup("gpt-4")).toBe("international");
        expect(UsageLog.getModelGroup("gpt-4-turbo")).toBe("premium");
        expect(UsageLog.getModelGroup("gpt-3.5-turbo")).toBe("international");
      });

      it("should return international for Gemini models", () => {
        expect(UsageLog.getModelGroup("gemini-pro")).toBe("international");
        expect(UsageLog.getModelGroup("gemini-1.5-flash")).toBe("international");
      });

      it("should return domestic for DeepSeek models", () => {
        expect(UsageLog.getModelGroup("deepseek-chat")).toBe("domestic");
        expect(UsageLog.getModelGroup("deepseek-coder")).toBe("domestic");
      });

      it("should return domestic for Qwen models", () => {
        expect(UsageLog.getModelGroup("qwen-turbo")).toBe("domestic");
        expect(UsageLog.getModelGroup("qwen-plus")).toBe("domestic");
        expect(UsageLog.getModelGroup("qwen2.5-72b")).toBe("domestic");
      });

      it("should default to domestic for unknown models (safer/cheaper)", () => {
        expect(UsageLog.getModelGroup("unknown-model")).toBe("domestic");
        expect(UsageLog.getModelGroup("")).toBe("domestic");
      });
    });

    describe("calculateCredits", () => {
      it("should calculate credits for international models", () => {
        // 1000 输入 tokens = 100 积分, 1000 输出 tokens = 500 积分
        const credits = UsageLog.calculateCredits("international", 1000, 1000);
        expect(credits).toBe(600); // 100 + 500
      });

      it("should calculate credits for domestic models", () => {
        // 1000 输入 tokens = 5 积分, 1000 输出 tokens = 10 积分
        const credits = UsageLog.calculateCredits("domestic", 1000, 1000);
        expect(credits).toBe(15); // 5 + 10
      });

      it("should handle zero tokens", () => {
        expect(UsageLog.calculateCredits("international", 0, 0)).toBe(0);
        expect(UsageLog.calculateCredits("domestic", 0, 0)).toBe(0);
      });

      it("should round credits correctly", () => {
        // 500 tokens = 50 积分 (international input)
        const credits = UsageLog.calculateCredits("international", 500, 0);
        expect(credits).toBe(50);
      });
    });
  });

  // ==========================================
  // UserWallet 测试
  // ==========================================
  describe("UserWallet", () => {
    describe("getOrCreate", () => {
      it("should return existing wallet", async () => {
        const mockWallet = { id: 1, userId: 1, balance: 10000 };
        prisma.user_wallets.findUnique.mockResolvedValue(mockWallet);

        const wallet = await UserWallet.getOrCreate(1);
        expect(wallet).toEqual(mockWallet);
        expect(prisma.user_wallets.create).not.toHaveBeenCalled();
      });

      it("should create new wallet if not exists", async () => {
        prisma.user_wallets.findUnique.mockResolvedValue(null);
        const newWallet = { id: 1, userId: 1, balance: 0 };
        prisma.user_wallets.create.mockResolvedValue(newWallet);

        const wallet = await UserWallet.getOrCreate(1);
        expect(prisma.user_wallets.create).toHaveBeenCalledWith({
          data: { userId: 1 },
        });
      });
    });

    describe("checkBalance", () => {
      it("should return sufficient when balance >= amount", async () => {
        prisma.user_wallets.findUnique.mockResolvedValue({ balance: 1000 });

        const result = await UserWallet.checkBalance(1, 500);
        expect(result.sufficient).toBe(true);
        expect(result.balance).toBe(1000);
        expect(result.shortfall).toBe(0);
      });

      it("should return insufficient when balance < amount", async () => {
        prisma.user_wallets.findUnique.mockResolvedValue({ balance: 100 });

        const result = await UserWallet.checkBalance(1, 500);
        expect(result.sufficient).toBe(false);
        expect(result.balance).toBe(100);
        expect(result.shortfall).toBe(400);
      });
    });

    describe("list", () => {
      it("should include users that do not have a persisted wallet row yet", async () => {
        prisma.users.findMany.mockResolvedValue([
          {
            id: 2,
            username: "alice",
            role: "default",
            createdAt: new Date("2026-03-02T00:00:00.000Z"),
            lastUpdatedAt: new Date("2026-03-03T00:00:00.000Z"),
          },
          {
            id: 1,
            username: "admin",
            role: "admin",
            createdAt: new Date("2026-03-01T00:00:00.000Z"),
            lastUpdatedAt: new Date("2026-03-01T12:00:00.000Z"),
          },
        ]);
        prisma.users.count.mockResolvedValue(2);
        prisma.user_wallets.findMany.mockResolvedValue([
          {
            id: 7,
            userId: 2,
            balance: 5000,
            plan: "starter",
            alertThreshold: 500,
            createdAt: new Date("2026-03-04T00:00:00.000Z"),
            updatedAt: new Date("2026-03-05T00:00:00.000Z"),
            user: {
              id: 2,
              username: "alice",
              role: "default",
            },
          },
        ]);

        const result = await UserWallet.list({ page: 1, limit: 20 });

        expect(prisma.users.findMany).toHaveBeenCalled();
        expect(prisma.user_wallets.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { userId: { in: [2, 1] } },
          })
        );
        expect(result.total).toBe(2);
        expect(result.wallets).toEqual([
          expect.objectContaining({
            id: 7,
            userId: 2,
            balance: 5000,
            plan: "starter",
            isVirtual: false,
          }),
          expect.objectContaining({
            id: "virtual-1",
            userId: 1,
            balance: 0,
            plan: "free",
            isVirtual: true,
            user: { id: 1, username: "admin", role: "admin" },
          }),
        ]);
      });
    });
  });
});
