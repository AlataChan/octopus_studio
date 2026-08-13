"use strict";

describe("trajectory memory purge", () => {
  afterEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();
  });

  test("workspace trajectoryMemoryDisabled=true updates, purges rows, audits in one transaction, then drops namespace", async () => {
    const order = [];
    const mockFindFirst = jest.fn().mockResolvedValue({
      id: 7,
      trajectoryMemoryDisabled: false,
    });
    const mockUpdate = jest.fn(async () => {
      order.push("update");
      return { id: 7, trajectoryMemoryDisabled: true };
    });
    const mockDeleteMany = jest.fn(async () => {
      order.push("deleteMany");
      return { count: 2 };
    });
    const mockEventCreate = jest.fn(async () => {
      order.push("audit");
      return { id: 1 };
    });
    const mockTransaction = jest.fn(async (fn) =>
      fn({
        workspaces: { update: mockUpdate },
        agent_trajectories: { deleteMany: mockDeleteMany },
        event_logs: { create: mockEventCreate },
      })
    );
    const mockNamespaces = jest
      .fn()
      .mockResolvedValue(["traj-ws-7-u-0", "traj-ws-7-u-42"]);
    const mockDropNamespaces = jest.fn(async () => {
      order.push("drop");
      return true;
    });

    jest.doMock("../../../../utils/prisma", () => ({
      workspaces: {
        findFirst: (...args) => mockFindFirst(...args),
      },
      $transaction: (...args) => mockTransaction(...args),
    }));
    jest.doMock("../../../../models/documents", () => ({
      Document: { forWorkspace: jest.fn() },
    }));
    jest.doMock("../../../../models/workspaceUsers", () => ({
      WorkspaceUser: { create: jest.fn() },
    }));
    jest.doMock("../../../../models/promptHistory", () => ({
      PromptHistory: { handlePromptChange: jest.fn() },
    }));
    jest.doMock("../../../../models/assistantTemplate", () => ({
      AssistantTemplate: { getDefaultTemplates: jest.fn(async () => []) },
    }));
    jest.doMock("../../../../models/workspaceAssistant", () => ({
      WorkspaceAssistant: { install: jest.fn() },
    }));
    jest.doMock("../../../../models/eventLogs", () => ({
      EventLogs: { logEvent: jest.fn() },
    }));
    jest.doMock("../../../../utils/agents/trajectoryMemory", () => ({
      listTrajectoryNamespacesForWorkspace: (...args) => mockNamespaces(...args),
      dropTrajectoryNamespaces: (...args) => mockDropNamespaces(...args),
    }));

    const { Workspace } = require("../../../../models/workspace");

    const result = await Workspace.update(7, {
      trajectoryMemoryDisabled: true,
    });

    expect(result.workspace).toEqual({ id: 7, trajectoryMemoryDisabled: true });
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockDeleteMany).toHaveBeenCalledWith({
      where: { workspaceId: 7 },
    });
    expect(mockEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          event: "workspace_trajectory_memory_disabled_changed",
          userId: null,
        }),
      })
    );
    expect(JSON.parse(mockEventCreate.mock.calls[0][0].data.metadata)).toEqual({
      workspaceId: 7,
      old: false,
      new: true,
      purged: true,
    });
    expect(mockDropNamespaces).toHaveBeenCalledWith([
      "traj-ws-7-u-0",
      "traj-ws-7-u-42",
    ]);
    expect(order).toEqual(["update", "deleteMany", "audit", "drop"]);
  });

  test("workspace and user delete collect namespaces before FK cascade deletes rows", async () => {
    const order = [];
    const mockWorkspaceFindFirst = jest.fn().mockResolvedValue({ slug: "ws" });
    const mockWorkspaceDelete = jest.fn(async () => {
      order.push("workspaceDelete");
      return { id: 7 };
    });
    const mockUserDeleteMany = jest.fn(async () => {
      order.push("userDelete");
      return { count: 1 };
    });
    const mockDropWorkspace = jest.fn(async () => {
      order.push("dropWorkspace");
      return true;
    });
    const mockDropUser = jest.fn(async () => {
      order.push("dropUser");
      return true;
    });

    jest.doMock("../../../../utils/prisma", () => ({
      workspaces: {
        findFirst: (...args) => mockWorkspaceFindFirst(...args),
        delete: (...args) => mockWorkspaceDelete(...args),
      },
      users: {
        deleteMany: (...args) => mockUserDeleteMany(...args),
      },
    }));
    jest.doMock("../../../../models/documents", () => ({
      Document: { forWorkspace: jest.fn() },
    }));
    jest.doMock("../../../../models/workspaceUsers", () => ({
      WorkspaceUser: { create: jest.fn() },
    }));
    jest.doMock("../../../../models/promptHistory", () => ({
      PromptHistory: { handlePromptChange: jest.fn() },
    }));
    jest.doMock("../../../../models/assistantTemplate", () => ({
      AssistantTemplate: { getDefaultTemplates: jest.fn(async () => []) },
    }));
    jest.doMock("../../../../models/workspaceAssistant", () => ({
      WorkspaceAssistant: { install: jest.fn() },
    }));
    jest.doMock("../../../../models/eventLogs", () => ({
      EventLogs: { logEvent: jest.fn() },
    }));
    jest.doMock("../../../../utils/octopusKb/retention", () => ({
      deleteWorkspaceMemoryPages: jest.fn(),
    }));
    jest.doMock("../../../../utils/agents/trajectoryMemory", () => ({
      dropTrajectoryNamespacesForWorkspace: async (...args) => {
        order.push("collectWorkspace");
        return mockDropWorkspace(...args);
      },
      dropTrajectoryNamespacesForUser: async (...args) => {
        order.push("collectUser");
        return mockDropUser(...args);
      },
    }));

    const { Workspace } = require("../../../../models/workspace");
    const { User } = require("../../../../models/user");

    await Workspace.delete({ id: 7 });
    await User.delete({ id: 42 });

    expect(order.indexOf("collectWorkspace")).toBeLessThan(
      order.indexOf("workspaceDelete")
    );
    expect(order.indexOf("collectUser")).toBeLessThan(order.indexOf("userDelete"));
    expect(mockDropWorkspace).toHaveBeenCalledWith(7);
    expect(mockDropUser).toHaveBeenCalledWith(42);
  });

  test("SQLite and Postgres schemas and migrations contain trajectory memory storage", () => {
    const fs = require("fs");
    const path = require("path");
    const root = path.resolve(__dirname, "../../../../");
    const sqliteSchema = fs.readFileSync(
      path.join(root, "prisma/schema.prisma"),
      "utf8"
    );
    const postgresSchema = fs.readFileSync(
      path.join(root, "prisma/postgres/schema.prisma"),
      "utf8"
    );

    for (const schema of [sqliteSchema, postgresSchema]) {
      expect(schema).toContain("trajectoryMemoryDisabled");
      expect(schema).toContain("model agent_trajectories");
      expect(schema).toContain("workspace     workspaces @relation");
      expect(schema).toContain("user          users?     @relation");
      expect(schema).toContain("@@index([scopeKey, successScore])");
    }

    const sqliteMigrations = fs
      .readdirSync(path.join(root, "prisma/migrations"), {
        withFileTypes: true,
      })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .join("\n");
    const postgresMigrations = fs
      .readdirSync(path.join(root, "prisma/postgres/migrations"), {
        withFileTypes: true,
      })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .join("\n");

    expect(sqliteMigrations).toMatch(/trajectory_memory/);
    expect(postgresMigrations).toMatch(/trajectory_memory/);
  });
});
