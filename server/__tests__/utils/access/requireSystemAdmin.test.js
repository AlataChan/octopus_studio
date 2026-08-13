const {
  requireSystemAdmin,
  SystemAdminRequiredError,
} = require("../../../utils/access/requireSystemAdmin");

describe("requireSystemAdmin", () => {
  test("allows single-user mode without a user object", async () => {
    await expect(
      requireSystemAdmin({ user: null, multiUserMode: false })
    ).resolves.toEqual({ ok: true });
  });

  test("rejects unauthenticated multi-user requests", async () => {
    await expect(
      requireSystemAdmin({ user: null, multiUserMode: true })
    ).resolves.toEqual({
      ok: false,
      status: 401,
      error: "Unauthenticated",
    });
  });

  test("allows multi-user system admins", async () => {
    await expect(
      requireSystemAdmin({
        user: { id: 99, role: "admin" },
        multiUserMode: true,
      })
    ).resolves.toEqual({ ok: true });
  });

  test("rejects ordinary multi-user members", async () => {
    await expect(
      requireSystemAdmin({
        user: { id: 1, role: "default" },
        multiUserMode: true,
      })
    ).resolves.toEqual({
      ok: false,
      status: 403,
      error: "Forbidden: system admin required",
    });
  });

  test("rejects multi-user workspace owners or managers", async () => {
    await expect(
      requireSystemAdmin({
        user: { id: 2, role: "manager" },
        multiUserMode: true,
      })
    ).resolves.toEqual({
      ok: false,
      status: 403,
      error: "Forbidden: system admin required",
    });
  });

  test("typed error carries the response status", () => {
    const error = new SystemAdminRequiredError("Nope", 403);
    expect(error.name).toBe("SystemAdminRequiredError");
    expect(error.status).toBe(403);
  });
});
