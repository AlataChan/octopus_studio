jest.mock("../../models/scheduledTask", () => ({
  ScheduledTask: {
    update: jest.fn(),
    logExecution: jest.fn(),
  },
}));

jest.mock("../../utils/prisma", () => ({
  scheduled_tasks: {
    findMany: jest.fn(),
    update: jest.fn(),
  },
  scheduled_task_logs: {
    findFirst: jest.fn(),
    create: jest.fn(),
  },
}));

const { ScheduledTask } = require("../../models/scheduledTask");
const prisma = require("../../utils/prisma");
const {
  FeatureDisabledError,
  userScheduler,
} = require("../../utils/scheduler/userTaskScheduler");
const {
  DISABLED_BY_BUILD_SWEEP_REASON,
  disableAgentFlowTasksOnce,
} = require("../../utils/scheduler/startupSweep");

describe("agent_flow scheduled task safety hide", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("_executeAgentFlow throws FeatureDisabledError", async () => {
    await expect(
      userScheduler._executeAgentFlow({
        id: "task-1",
        actionConfig: { flowId: "flow-1" },
      })
    ).rejects.toMatchObject({
      name: "FeatureDisabledError",
      code: "AGENT_FLOW_RUN_DISABLED",
      message: "agent_flow scheduling not enabled in this build",
    });
  });

  test("scheduler catch disables agent_flow task without retrying", async () => {
    ScheduledTask.logExecution.mockResolvedValue();
    ScheduledTask.update.mockResolvedValue();

    const result = await userScheduler._executeTask({
      id: "task-1",
      name: "Legacy flow task",
      actionType: "agent_flow",
      actionConfig: { flowId: "flow-1" },
      runCount: 0,
    });

    expect(result).toEqual({
      status: "disabled",
      reason: "AGENT_FLOW_RUN_DISABLED",
    });
    expect(ScheduledTask.logExecution).toHaveBeenCalledWith(
      "task-1",
      expect.objectContaining({
        status: "skipped",
        error: "AGENT_FLOW_RUN_DISABLED",
        reason: "disabled_by_build",
      })
    );
    expect(ScheduledTask.update).toHaveBeenCalledWith("task-1", {
      enabled: false,
      lastRunStatus: "disabled_by_build",
      lastRunError: "AGENT_FLOW_RUN_DISABLED",
      nextRunAt: null,
    });
  });

  test("disableAgentFlowTasksOnce is idempotent and does not append duplicate audit logs", async () => {
    const tasks = [
      {
        id: "task-1",
        name: "Legacy flow task",
        actionType: "agent_flow",
        enabled: true,
      },
    ];
    const logs = [];

    prisma.scheduled_tasks.findMany.mockImplementation(async () =>
      tasks.filter((task) => task.actionType === "agent_flow" && task.enabled)
    );
    prisma.scheduled_task_logs.findFirst.mockImplementation(async ({ where }) =>
      logs.find(
        (log) =>
          log.taskId === where.taskId &&
          log.output?.includes(DISABLED_BY_BUILD_SWEEP_REASON)
      )
    );
    prisma.scheduled_tasks.update.mockImplementation(async ({ where, data }) => {
      const task = tasks.find((candidate) => candidate.id === where.id);
      Object.assign(task, data);
      return task;
    });
    prisma.scheduled_task_logs.create.mockImplementation(async ({ data }) => {
      logs.push(data);
      return data;
    });

    await disableAgentFlowTasksOnce();
    await disableAgentFlowTasksOnce();

    expect(prisma.scheduled_tasks.update).toHaveBeenCalledTimes(1);
    expect(prisma.scheduled_task_logs.create).toHaveBeenCalledTimes(1);
    expect(logs).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      enabled: false,
      lastRunStatus: "disabled_by_build",
      lastRunError: "AGENT_FLOW_RUN_DISABLED",
      nextRunAt: null,
    });
  });

  test("disableAgentFlowTasksOnce ignores already disabled agent_flow tasks", async () => {
    prisma.scheduled_tasks.findMany.mockResolvedValue([]);

    await disableAgentFlowTasksOnce();

    expect(prisma.scheduled_tasks.findMany).toHaveBeenCalledWith({
      where: { actionType: "agent_flow", enabled: true },
      select: { id: true, name: true },
    });
    expect(prisma.scheduled_tasks.update).not.toHaveBeenCalled();
    expect(prisma.scheduled_task_logs.create).not.toHaveBeenCalled();
  });
});
