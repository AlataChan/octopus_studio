const mockWorkspaceUserFindFirst = jest.fn();

jest.mock("../../../utils/prisma", () => ({
  workspace_users: {
    findFirst: (...args) => mockWorkspaceUserFindFirst(...args),
  },
}));

const {
  requireWorkspaceAdmin,
  WorkspaceAdminRequiredError,
} = require("../../../utils/access/requireWorkspaceAdmin");

describe("requireWorkspaceAdmin", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("allows single-user mode without a user object", async () => {
    await expect(
      requireWorkspaceAdmin({
        workspaceId: 7,
        user: null,
        multiUserMode: false,
      })
    ).resolves.toEqual({ ok: true });
    expect(mockWorkspaceUserFindFirst).not.toHaveBeenCalled();
  });

  test("rejects unauthenticated multi-user requests", async () => {
    await expect(
      requireWorkspaceAdmin({
        workspaceId: 7,
        user: null,
        multiUserMode: true,
      })
    ).resolves.toEqual({
      ok: false,
      status: 401,
      error: "Unauthenticated",
    });
  });

  test("allows system admin without workspace membership lookup", async () => {
    await expect(
      requireWorkspaceAdmin({
        workspaceId: 7,
        user: { id: 99, role: "admin" },
        multiUserMode: true,
      })
    ).resolves.toEqual({ ok: true });
    expect(mockWorkspaceUserFindFirst).not.toHaveBeenCalled();
  });

  test("allows manager role only when the user belongs to the workspace", async () => {
    mockWorkspaceUserFindFirst.mockResolvedValue({ id: 11 });

    await expect(
      requireWorkspaceAdmin({
        workspaceId: 7,
        user: { id: 2, role: "manager" },
        multiUserMode: true,
      })
    ).resolves.toEqual({ ok: true });
    expect(mockWorkspaceUserFindFirst).toHaveBeenCalledWith({
      where: { workspace_id: 7, user_id: 2 },
      select: { id: true },
    });
  });

  test("rejects manager role without workspace membership", async () => {
    mockWorkspaceUserFindFirst.mockResolvedValue(null);

    await expect(
      requireWorkspaceAdmin({
        workspaceId: 7,
        user: { id: 2, role: "manager" },
        multiUserMode: true,
      })
    ).resolves.toEqual({
      ok: false,
      status: 403,
      error: "Forbidden: workspace admin required",
    });
  });

  test("rejects ordinary workspace members for admin actions", async () => {
    await expect(
      requireWorkspaceAdmin({
        workspaceId: 7,
        user: { id: 1, role: "default" },
        multiUserMode: true,
      })
    ).resolves.toEqual({
      ok: false,
      status: 403,
      error: "Forbidden: workspace admin required",
    });
    expect(mockWorkspaceUserFindFirst).not.toHaveBeenCalled();
  });

  test("typed error carries the response status", () => {
    const error = new WorkspaceAdminRequiredError("Nope", 403);
    expect(error.name).toBe("WorkspaceAdminRequiredError");
    expect(error.status).toBe(403);
  });
});
