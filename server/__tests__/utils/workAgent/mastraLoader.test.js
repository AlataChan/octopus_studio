describe("mastraLoader", () => {
  beforeEach(() => {
    // Clear require cache before each test to ensure fresh loads
    jest.resetModules();
  });

  it("exposes all required Mastra primitives including workflow exports", () => {
    // Mock @mastra/core modules to avoid actual dependency loading
    jest.doMock("@mastra/core/agent", () => ({
      Agent: class Agent {},
    }));
    jest.doMock("@mastra/core/tools", () => ({
      createTool: jest.fn(),
    }));
    jest.doMock("@mastra/core/workflows", () => ({
      createWorkflow: jest.fn(),
      createStep: jest.fn(),
    }));
    jest.doMock("zod", () => ({
      z: { object: jest.fn() },
    }));

    const { loadMastra } = require("../../../utils/workAgent/mastraLoader");
    const mastra = loadMastra();

    // Check backward-compatible exports
    expect(mastra.Agent).toBeDefined();
    expect(mastra.createTool).toBeDefined();
    expect(mastra.z).toBeDefined();

    // Check new workflow exports
    expect(mastra.createWorkflow).toBeDefined();
    expect(mastra.createStep).toBeDefined();

    // Verify they are functions
    expect(typeof mastra.createWorkflow).toBe("function");
    expect(typeof mastra.createStep).toBe("function");
  });
});
