const {
  installAssistantTemplatesToWorkspace,
} = require("../../scripts/lib/installWorkspaceAssistants");

describe("installAssistantTemplatesToWorkspace", () => {
  it("installs only templates not already present in the workspace", async () => {
    const prisma = {
      workspaces: {
        findUnique: jest.fn().mockResolvedValue({ id: 8, slug: "phase0-test" }),
      },
      assistant_templates: {
        findMany: jest.fn().mockResolvedValue([
          { id: "t1", name: "Alpha" },
          { id: "t2", name: "Beta" },
          { id: "t3", name: "Gamma" },
        ]),
      },
      workspace_assistants: {
        findMany: jest.fn().mockResolvedValue([{ templateId: "t2" }]),
      },
    };
    const WorkspaceAssistant = {
      install: jest.fn().mockResolvedValue({
        assistant: { id: "wa-1" },
        message: null,
      }),
    };

    const result = await installAssistantTemplatesToWorkspace({
      prisma,
      WorkspaceAssistant,
      workspaceSlug: "phase0-test",
    });

    expect(result.workspaceId).toBe(8);
    expect(result.installedTemplateIds).toEqual(["t1", "t3"]);
    expect(result.skippedTemplateIds).toEqual(["t2"]);
    expect(WorkspaceAssistant.install).toHaveBeenCalledTimes(2);
    expect(WorkspaceAssistant.install).toHaveBeenNthCalledWith(
      1,
      8,
      "t1",
      null,
      null,
      "hired"
    );
    expect(WorkspaceAssistant.install).toHaveBeenNthCalledWith(
      2,
      8,
      "t3",
      null,
      null,
      "hired"
    );
  });

  it("throws when the target workspace does not exist", async () => {
    const prisma = {
      workspaces: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };

    await expect(
      installAssistantTemplatesToWorkspace({
        prisma,
        WorkspaceAssistant: { install: jest.fn() },
        workspaceSlug: "missing-workspace",
      })
    ).rejects.toThrow("Workspace missing-workspace not found");
  });
});
