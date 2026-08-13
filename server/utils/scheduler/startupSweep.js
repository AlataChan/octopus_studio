const prisma = require("../../utils/prisma");

const DISABLED_BY_BUILD_SWEEP_REASON = "disabled_by_build_v1";
const AGENT_FLOW_DISABLED_CODE = "AGENT_FLOW_RUN_DISABLED";

async function disableAgentFlowTasksOnce() {
  const tasks = await prisma.scheduled_tasks.findMany({
    where: { actionType: "agent_flow", enabled: true },
    select: { id: true, name: true },
  });

  let disabledCount = 0;
  let skippedCount = 0;

  for (const task of tasks) {
    const existingAudit = await prisma.scheduled_task_logs.findFirst({
      where: {
        taskId: task.id,
        output: { contains: DISABLED_BY_BUILD_SWEEP_REASON },
      },
    });

    if (existingAudit) {
      skippedCount += 1;
      continue;
    }

    const startedAt = new Date();
    await prisma.scheduled_tasks.update({
      where: { id: task.id },
      data: {
        enabled: false,
        lastRunStatus: "disabled_by_build",
        lastRunError: AGENT_FLOW_DISABLED_CODE,
        nextRunAt: null,
      },
    });
    await prisma.scheduled_task_logs.create({
      data: {
        taskId: task.id,
        status: "skipped",
        startedAt,
        finishedAt: new Date(),
        durationMs: 0,
        output: JSON.stringify({
          reason: DISABLED_BY_BUILD_SWEEP_REASON,
          code: AGENT_FLOW_DISABLED_CODE,
          message: "agent_flow scheduling is disabled in this build",
        }),
        error: AGENT_FLOW_DISABLED_CODE,
      },
    });
    disabledCount += 1;
  }

  console.log(
    `[Scheduler] disabled ${disabledCount} agent_flow tasks (idempotent)`
  );

  return { disabledCount, skippedCount };
}

module.exports = {
  AGENT_FLOW_DISABLED_CODE,
  DISABLED_BY_BUILD_SWEEP_REASON,
  disableAgentFlowTasksOnce,
};
