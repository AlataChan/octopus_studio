jest.mock("../../utils/prisma", () => ({
  skill_catalog: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    findMany: jest.fn(),
  },
}));

const prisma = require("../../utils/prisma");
const { SkillCatalog } = require("../../models/skillCatalog");

describe("SkillCatalog Model", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("upsert() merges metadataJson by default (preserves config)", async () => {
    prisma.skill_catalog.findUnique.mockResolvedValue({
      id: 1,
      skillId: "custom:test",
      source: "local",
      metadataJson: JSON.stringify({ config: { a: 1 }, name: "Old" }),
      enabled: true,
    });
    prisma.skill_catalog.update.mockResolvedValue({ id: 1 });

    await SkillCatalog.upsert({
      skillId: "custom:test",
      source: "local",
      metadata: { name: "New" },
    });

    expect(prisma.skill_catalog.update).toHaveBeenCalled();
    const updateArg = prisma.skill_catalog.update.mock.calls[0][0];
    const merged = JSON.parse(updateArg.data.metadataJson);
    expect(merged.config).toEqual({ a: 1 });
    expect(merged.name).toBe("New");
    expect(updateArg.data.name).toBe("New");
  });
});

