jest.mock("../../utils/prisma", () => ({
  skill_installations: {
    findUnique: jest.fn(),
    create: jest.fn(),
    deleteMany: jest.fn(),
    findMany: jest.fn(),
  },
}));

const prisma = require("../../utils/prisma");
const { SkillInstallations } = require("../../models/skillInstallations");

describe("SkillInstallations Model", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("bind() creates a new installation when missing", async () => {
    prisma.skill_installations.findUnique.mockResolvedValue(null);
    prisma.skill_installations.create.mockResolvedValue({ id: 1, skillId: "custom:x" });

    const result = await SkillInstallations.bind({
      skillId: "custom:x",
      workspaceId: 1,
    });

    expect(prisma.skill_installations.findUnique).toHaveBeenCalled();
    expect(prisma.skill_installations.create).toHaveBeenCalledWith({
      data: {
        skillId: "custom:x",
        workspaceId: 1,
        scopeType: "workspace",
        scopeId: "__workspace__",
      },
    });
    expect(result).toEqual({ id: 1, skillId: "custom:x" });
  });

  test("bind() returns existing installation when present", async () => {
    prisma.skill_installations.findUnique.mockResolvedValue({ id: 2 });

    const result = await SkillInstallations.bind({
      skillId: "custom:x",
      workspaceId: 1,
      assistantId: 10,
    });

    expect(prisma.skill_installations.create).not.toHaveBeenCalled();
    expect(result).toEqual({ id: 2 });
  });

  test("unbind() deletes matching installation rows", async () => {
    prisma.skill_installations.deleteMany.mockResolvedValue({ count: 3 });

    const count = await SkillInstallations.unbind({
      skillId: "custom:x",
      workspaceId: 1,
      assistantId: 10,
    });

    expect(prisma.skill_installations.deleteMany).toHaveBeenCalledWith({
      where: {
        skillId: "custom:x",
        workspaceId: 1,
        scopeType: "assistant",
        scopeId: "10",
      },
    });
    expect(count).toBe(3);
  });

  test("listForWorkspace() returns rows", async () => {
    prisma.skill_installations.findMany.mockResolvedValue([{ id: 1 }]);
    const result = await SkillInstallations.listForWorkspace(1);
    expect(result).toEqual([{ id: 1 }]);
  });

  test("listWorkspaceIdsForSkill() returns distinct workspace ids", async () => {
    prisma.skill_installations.findMany.mockResolvedValue([
      { workspaceId: 1 },
      { workspaceId: 2 },
    ]);

    const ids = await SkillInstallations.listWorkspaceIdsForSkill("custom:x");
    expect(prisma.skill_installations.findMany).toHaveBeenCalledWith({
      where: { skillId: "custom:x" },
      select: { workspaceId: true },
      distinct: ["workspaceId"],
    });
    expect(ids).toEqual([1, 2]);
  });

  test("listAll() returns rows", async () => {
    prisma.skill_installations.findMany.mockResolvedValue([{ id: 1 }]);
    const result = await SkillInstallations.listAll();
    expect(prisma.skill_installations.findMany).toHaveBeenCalled();
    expect(result).toEqual([{ id: 1 }]);
  });
});
