const mockPrisma = {
  system_settings: {
    findUnique: jest.fn(),
    create: jest.fn(),
  },
  $disconnect: jest.fn(),
};

const mockSeedDefaultAssistants = jest.fn();

jest.mock("@prisma/client", () => ({
  PrismaClient: jest.fn(() => mockPrisma),
}));

jest.mock("../prisma/seeds/seedDefaultAssistants", () => ({
  seedDefaultAssistants: (...args) => mockSeedDefaultAssistants(...args),
}));

describe("prisma seed orchestration", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockPrisma.system_settings.findUnique.mockResolvedValue(null);
    mockPrisma.system_settings.create.mockResolvedValue({});
    mockPrisma.$disconnect.mockResolvedValue();
    mockSeedDefaultAssistants.mockResolvedValue({
      created: 29,
      skipped: 0,
      updated: 0,
    });
  });

  test("seeds default assistants through the unified assistant template path", async () => {
    const { seedTemplateDatabase } = require("../prisma/seed");

    await seedTemplateDatabase();

    expect(mockSeedDefaultAssistants).toHaveBeenCalledWith(mockPrisma);
    expect(mockSeedDefaultAssistants).toHaveBeenCalledTimes(1);
  });
});
