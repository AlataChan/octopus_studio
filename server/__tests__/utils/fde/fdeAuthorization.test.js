jest.mock("../../../utils/prisma", () => ({
  workspace_users: {
    findFirst: jest.fn(async ({ where }) =>
      [101, 102].includes(where.user_id) ? { id: where.user_id } : null
    ),
  },
}));

const {
  FDE_ACTIONS,
  authorizeFdeAction,
} = require("../../../utils/fde/fdeAuthorization");
const prisma = require("../../../utils/prisma");

const principals = [
  ["member", { id: 101, role: "default" }],
  ["workspace admin", { id: 102, role: "manager" }],
  ["manager non-member", { id: 103, role: "manager" }],
  ["system admin", { id: 104, role: "admin" }],
  ["foreign member", { id: 105, role: "default" }],
];

const elevated = new Set([
  FDE_ACTIONS.APPROVE,
  FDE_ACTIONS.REJECT,
  FDE_ACTIONS.PUBLISH,
  FDE_ACTIONS.CREATE_RUN,
  FDE_ACTIONS.CANCEL_RUN,
  FDE_ACTIONS.RESUME_RUN,
]);

describe("FDE authorization contract", () => {
  it("defines exactly the 18 reviewed actions", () => {
    expect(Object.values(FDE_ACTIONS)).toHaveLength(18);
    expect(new Set(Object.values(FDE_ACTIONS)).size).toBe(18);
  });

  it.each(
    Object.values(FDE_ACTIONS).flatMap((action) =>
      principals.map(([principal, user]) => [action, principal, user])
    )
  )("enforces matrix action=%s principal=%s", async (action, principal, user) => {
    prisma.workspace_users.findFirst.mockResolvedValue(
      [101, 102].includes(user.id) ? { id: user.id } : null
    );
    const result = await authorizeFdeAction({
      action,
      workspaceId: 7,
      user,
      multiUserMode: true,
    });
    const expected =
      principal === "system admin" ||
      principal === "workspace admin" ||
      (principal === "member" && !elevated.has(action));
    expect(result.ok).toBe(expected);
  });

  it.each(Object.values(FDE_ACTIONS))(
    "rejects unauthenticated action %s before resource use",
    async (action) => {
      await expect(
        authorizeFdeAction({
          action,
          workspaceId: 7,
          user: null,
          multiUserMode: true,
        })
      ).resolves.toMatchObject({ ok: false, status: 401 });
    }
  );

  it.each(Object.values(FDE_ACTIONS))(
    "allows single-user role check for action %s (approval separation is model-owned)",
    async (action) => {
      await expect(
        authorizeFdeAction({
          action,
          workspaceId: 7,
          user: { id: 1, role: "default" },
          multiUserMode: false,
        })
      ).resolves.toEqual({ ok: true });
    }
  );

  it("fails closed for an unknown action", async () => {
    await expect(
      authorizeFdeAction({
        action: "invented",
        workspaceId: 7,
        user: { id: 104, role: "admin" },
        multiUserMode: true,
      })
    ).resolves.toMatchObject({ ok: false, status: 403 });
  });
});
