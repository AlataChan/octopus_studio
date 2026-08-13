jest.mock("../../utils/prisma", () => ({
  runs: {
    create: jest.fn(),
  },
}));

const prisma = require("../../utils/prisma");
const { Run } = require("../../models/run");

describe("Run model", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("create", () => {
    it("connects the required workspace relation and normalizes null threadId", async () => {
      prisma.runs.create.mockResolvedValue({ id: "run-1" });

      await Run.create({
        threadId: null,
        workspaceId: 1,
        triggerType: Run.TRIGGER.UI,
        engine: "mastra",
        metadata: { kind: "team_orchestration" },
      });

      expect(prisma.runs.create).toHaveBeenCalledWith({
        data: {
          threadId: "",
          workspace: { connect: { id: 1 } },
          triggerType: Run.TRIGGER.UI,
          triggerId: null,
          status: Run.STATUS.QUEUED,
          engine: "mastra",
          metadata: JSON.stringify({ kind: "team_orchestration" }),
        },
      });
    });

    it("requires an explicit engine instead of inferring ownership", async () => {
      await expect(
        Run.create({
          threadId: "thread-1",
          workspaceId: 1,
          triggerType: Run.TRIGGER.UI,
        })
      ).rejects.toMatchObject({ code: "RUN_ENGINE_REQUIRED" });
      expect(prisma.runs.create).not.toHaveBeenCalled();
    });

    it("redacts metadata and terminal error detail before persistence", async () => {
      prisma.runs.create.mockResolvedValue({ id: "run-1" });
      prisma.runs.update = jest.fn().mockResolvedValue({ id: "run-1" });

      await Run.create({
        threadId: "thread-a",
        workspaceId: 1,
        triggerType: Run.TRIGGER.MANUAL,
        engine: "mastra",
        metadata: { note: "Bearer metadata-secret" },
      });
      await Run.updateStatus("run-1", Run.STATUS.FAILED, {
        errorCode: "STUDIO_FAILED",
        errorDetail: "sk-error-secret",
      });

      const metadata = prisma.runs.create.mock.calls[0][0].data.metadata;
      const errorDetail = prisma.runs.update.mock.calls[0][0].data.errorDetail;
      expect(metadata).toContain("[REDACTED]");
      expect(metadata).not.toContain("metadata-secret");
      expect(errorDetail).toContain("[REDACTED]");
      expect(errorDetail).not.toContain("error-secret");
    });
  });
});
