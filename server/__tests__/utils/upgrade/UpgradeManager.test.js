const mockReseedWorkAgentAssistants = jest.fn();

jest.mock("../../../models/systemSettings", () => ({
  SystemSettings: {
    get: jest.fn(),
    updateSettings: jest.fn(),
  },
}));

jest.mock("../../../utils/workAgent/runtimeSeed", () => ({
  reseedWorkAgentAssistants: (...args) =>
    mockReseedWorkAgentAssistants(...args),
}));

describe("UpgradeManager assistant template seeding", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockReseedWorkAgentAssistants.mockResolvedValue({
      skipped: false,
      result: { created: 29, updated: 0, skipped: 0 },
    });
  });

  it("uses the unified runtime assistant seed during first install setup", async () => {
    const { UpgradeManager } = require("../../../utils/upgrade/UpgradeManager");
    const manager = new UpgradeManager();

    await manager._runInitialSetup();

    expect(mockReseedWorkAgentAssistants).toHaveBeenCalledTimes(1);
  });

  it("uses the unified runtime assistant seed during upgrade data sync", async () => {
    const { UpgradeManager } = require("../../../utils/upgrade/UpgradeManager");
    const manager = new UpgradeManager();

    await manager._syncBuiltinData();

    expect(mockReseedWorkAgentAssistants).toHaveBeenCalledTimes(1);
  });
});
