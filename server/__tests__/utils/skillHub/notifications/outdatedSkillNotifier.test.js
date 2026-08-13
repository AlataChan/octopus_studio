jest.mock("../../../../models/notification", () => ({
  Notification: {
    TYPES: { WARNING: "warning" },
    createMany: jest.fn(),
  },
}));

jest.mock("../../../../models/workspace", () => ({
  Workspace: {
    workspaceUsers: jest.fn(),
  },
}));

jest.mock("../../../../models/skillInstallations", () => ({
  SkillInstallations: {
    listWorkspaceIdsForSkill: jest.fn(),
  },
}));

jest.mock("../../../../models/skillCatalog", () => ({
  SkillCatalog: {
    get: jest.fn(),
  },
}));

const { Notification } = require("../../../../models/notification");
const { Workspace } = require("../../../../models/workspace");
const { SkillInstallations } = require("../../../../models/skillInstallations");
const { SkillCatalog } = require("../../../../models/skillCatalog");
const {
  notifyOutdatedSkill,
} = require("../../../../utils/plugins/skillHub/notifications/outdatedSkillNotifier");

describe("notifyOutdatedSkill", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("sends notifications to admin/manager users when cooldown passed", async () => {
    const now = new Date("2026-02-20T00:00:00.000Z");

    SkillCatalog.get.mockResolvedValue({
      metadataJson: JSON.stringify({
        outdatedNotifiedAt: "2026-02-18T00:00:00.000Z",
      }),
    });
    SkillInstallations.listWorkspaceIdsForSkill.mockResolvedValue([1]);
    Workspace.workspaceUsers.mockResolvedValue([
      { userId: 1, role: "admin" },
      { userId: 2, role: "default" },
    ]);
    Notification.createMany.mockResolvedValue({ count: 1, error: null });

    const result = await notifyOutdatedSkill({
      skillId: "custom:invoice-organizer",
      source: "local",
      skill: { name: "Invoice Organizer" },
      update: { status: "outdated", currentHash: "a", remoteHash: "b" },
      now,
      cooldownMs: 24 * 60 * 60 * 1000,
    });

    expect(Notification.createMany).toHaveBeenCalledWith([1], expect.any(Object));
    expect(result.notified).toBe(true);
    expect(result.notifiedAt).toBe(now.toISOString());
  });

  test("skips when cooldown not passed", async () => {
    const now = new Date("2026-02-20T00:00:00.000Z");

    SkillCatalog.get.mockResolvedValue({
      metadataJson: JSON.stringify({
        outdatedNotifiedAt: "2026-02-19T23:30:00.000Z",
      }),
    });
    SkillInstallations.listWorkspaceIdsForSkill.mockResolvedValue([1]);
    Workspace.workspaceUsers.mockResolvedValue([{ userId: 1, role: "admin" }]);

    const result = await notifyOutdatedSkill({
      skillId: "custom:invoice-organizer",
      source: "local",
      skill: { name: "Invoice Organizer" },
      update: { status: "outdated", currentHash: "a", remoteHash: "b" },
      now,
      cooldownMs: 24 * 60 * 60 * 1000,
    });

    expect(Notification.createMany).not.toHaveBeenCalled();
    expect(result.notified).toBe(false);
    expect(result.notifiedAt).toBe(null);
  });
});

