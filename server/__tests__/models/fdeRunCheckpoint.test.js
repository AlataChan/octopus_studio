jest.mock("../../utils/prisma", () => ({
  fde_run_checkpoints: {
    create: jest.fn(),
    findUnique: jest.fn(),
    updateMany: jest.fn(),
  },
}));

const prisma = require("../../utils/prisma");
const {
  FdeRunCheckpoint,
  FdeRunCheckpointError,
} = require("../../models/fdeRunCheckpoint");

describe("FdeRunCheckpoint", () => {
  beforeEach(() => jest.clearAllMocks());

  it("claims only idle or expired leased non-terminal rows with CAS", async () => {
    const now = new Date("2026-08-09T12:00:00Z");
    prisma.fde_run_checkpoints.updateMany.mockResolvedValue({ count: 1 });
    prisma.fde_run_checkpoints.findUnique.mockResolvedValue({
      runId: "run-a",
      stateVersion: 3,
      status: "leased",
    });

    await FdeRunCheckpoint.claim({
      runId: "run-a",
      stateVersion: 2,
      leaseOwner: "worker-a",
      now,
      leaseMs: 60_000,
      attemptToken: "attempt-a",
    });

    expect(prisma.fde_run_checkpoints.updateMany).toHaveBeenCalledWith({
      where: {
        runId: "run-a",
        stateVersion: 2,
        status: { in: ["idle", "leased"] },
        OR: [{ status: "idle" }, { leaseExpiresAt: { lt: now } }],
      },
      data: {
        status: "leased",
        leaseOwner: "worker-a",
        leaseExpiresAt: new Date("2026-08-09T12:01:00.000Z"),
        attemptToken: "attempt-a",
        stateVersion: { increment: 1 },
      },
    });
  });

  it("returns a stable 409 when a lease claim loses", async () => {
    prisma.fde_run_checkpoints.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      FdeRunCheckpoint.claim({
        runId: "run-a",
        stateVersion: 2,
        leaseOwner: "worker-a",
      })
    ).rejects.toEqual(
      expect.objectContaining({
        code: "STUDIO_CHECKPOINT_CONFLICT",
        status: 409,
      })
    );
  });

  it("redacts node outputs at the persistence boundary", async () => {
    prisma.fde_run_checkpoints.updateMany.mockResolvedValue({ count: 1 });
    prisma.fde_run_checkpoints.findUnique.mockResolvedValue({
      runId: "run-a",
      stateVersion: 4,
    });

    await FdeRunCheckpoint.advance({
      runId: "run-a",
      stateVersion: 3,
      leaseOwner: "worker-a",
      attemptToken: "attempt-a",
      nodeCursor: "out",
      nodeOutputs: { nodes: { draft: { text: "Bearer secret-value" } } },
      leaseMs: 60_000,
    });

    const data = prisma.fde_run_checkpoints.updateMany.mock.calls[0][0].data;
    expect(data.nodeOutputs).toContain("[REDACTED]");
    expect(data.nodeOutputs).not.toContain("secret-value");
  });

  it("never reclaims completed or failed rows", async () => {
    const source = require("fs").readFileSync(
      require.resolve("../../models/fdeRunCheckpoint"),
      "utf8"
    );
    expect(source).toContain('status: { in: ["idle", "leased"] }');
    expect(new FdeRunCheckpointError("X")).toBeInstanceOf(Error);
  });
});
