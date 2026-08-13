jest.mock("../../utils/prisma", () => {
  const mock = {
    fde_authoring_sessions: {
      create: jest.fn(),
      findFirst: jest.fn(),
      updateMany: jest.fn(),
      findUnique: jest.fn(),
    },
  };
  mock.$transaction = jest.fn(async (callback) => callback(mock));
  return mock;
});

const prisma = require("../../utils/prisma");
const { FdeAuthoringSession } = require("../../models/fdeAuthoringSession");

describe("FdeAuthoringSession", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(async (callback) =>
      callback(prisma)
    );
  });

  it("creates a workspace-owned reference to the remote session", async () => {
    prisma.fde_authoring_sessions.create.mockResolvedValue({
      id: "authoring-a",
    });

    await FdeAuthoringSession.create({
      workspaceId: 7,
      fdeSessionId: "fde-a",
      createdByUserId: 12,
    });

    expect(prisma.fde_authoring_sessions.create).toHaveBeenCalledWith({
      data: {
        workspaceId: 7,
        fdeSessionId: "fde-a",
        createdByUserId: 12,
      },
    });
  });

  it("loads only through the owning workspace", async () => {
    prisma.fde_authoring_sessions.findFirst.mockResolvedValue(null);

    await FdeAuthoringSession.getInWorkspace("authoring-a", 7);

    expect(prisma.fde_authoring_sessions.findFirst).toHaveBeenCalledWith({
      where: { id: "authoring-a", workspaceId: 7 },
    });
  });

  it("moves the previous turn to fromTurn when recording the next turn", async () => {
    prisma.fde_authoring_sessions.findUnique.mockResolvedValue({
      id: "authoring-a",
      fdeToTurnId: "turn-one",
    });
    prisma.fde_authoring_sessions.updateMany.mockResolvedValue({ count: 1 });

    await FdeAuthoringSession.recordTurn("authoring-a", "turn-two");

    expect(prisma.fde_authoring_sessions.updateMany).toHaveBeenCalledWith({
      where: { id: "authoring-a", fdeToTurnId: "turn-one" },
      data: { fdeFromTurnId: "turn-one", fdeToTurnId: "turn-two" },
    });
  });
});
