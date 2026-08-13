const { ensurePhase0Workspace, PHASE0_WORKSPACE_NAME } = require("../../scripts/lib/phase0Workspace");

describe("ensurePhase0Workspace", () => {
  it("reuses the latest existing phase0 workspace", async () => {
    const existingWorkspace = {
      id: 8,
      name: PHASE0_WORKSPACE_NAME,
      slug: "phase0-test-1771569052949",
    };
    const prisma = {
      workspaces: {
        findFirst: jest.fn().mockResolvedValue(existingWorkspace),
        create: jest.fn(),
      },
    };

    const workspace = await ensurePhase0Workspace(prisma);

    expect(workspace).toEqual(existingWorkspace);
    expect(prisma.workspaces.findFirst).toHaveBeenCalledWith({
      where: { name: PHASE0_WORKSPACE_NAME },
      orderBy: { id: "desc" },
    });
    expect(prisma.workspaces.create).not.toHaveBeenCalled();
  });

  it("creates a new phase0 workspace when none exists", async () => {
    const prisma = {
      workspaces: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: 9,
          name: PHASE0_WORKSPACE_NAME,
          slug: "phase0-test-123",
        }),
      },
    };

    const workspace = await ensurePhase0Workspace(prisma);

    expect(workspace).toMatchObject({
      id: 9,
      name: PHASE0_WORKSPACE_NAME,
      slug: expect.stringMatching(/^phase0-test-/),
    });
    expect(prisma.workspaces.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: PHASE0_WORKSPACE_NAME,
        slug: expect.stringMatching(/^phase0-test-/),
      }),
    });
  });
});
