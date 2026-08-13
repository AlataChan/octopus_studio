/**
 * @fileoverview 定时任务调度器
 * 管理系统中的所有定时任务，包括知识同步等
 *
 * @description
 * 通过 ENABLE_CRON 环境变量控制是否启用定时任务
 * 在多实例部署时，只有一个实例应该设置 ENABLE_CRON=true（Leader 模式）
 */

const cron = require("node-cron");
const { runKnowledgeSync, getSyncStats } = require("../etl/knowledgeSync");
const { disableAgentFlowTasksOnce } = require("./startupSweep");
const { userScheduler } = require("./userTaskScheduler");

/**
 * 定时任务配置
 */
const SCHEDULER_CONFIG = {
  // 知识同步时间（默认每天凌晨 2:00）
  KNOWLEDGE_SYNC_SCHEDULE: process.env.KNOWLEDGE_SYNC_SCHEDULE || "0 2 * * *",
  // Skill Hub 发现/索引同步（默认每天凌晨 3:00）
  SKILL_HUB_DISCOVERY_SCHEDULE:
    process.env.SKILL_HUB_DISCOVERY_SCHEDULE || "0 3 * * *",
};

/**
 * 已注册的定时任务
 * @type {Map<string, cron.ScheduledTask>}
 */
const scheduledTasks = new Map();

async function runKnowledgeSyncOnce({ triggeredBy = "cron" } = {}) {
  const { SkillHubJobs } = require("../../models/skillHubJobs");
  const job = await SkillHubJobs.start({
    type: "scheduler:knowledge_sync",
    status: SkillHubJobs.Status.RUNNING,
    result: { trigger: triggeredBy },
  });

  const startTime = Date.now();
  try {
    const result = await runKnowledgeSync();
    const durationSec = Number(((Date.now() - startTime) / 1000).toFixed(2));

    await SkillHubJobs.finish(job?.id, {
      status: SkillHubJobs.Status.DONE,
      result: { ok: true, ...result, durationSec },
    });

    return { jobId: job?.id || null, result, durationSec };
  } catch (error) {
    await SkillHubJobs.finish(job?.id, {
      status: SkillHubJobs.Status.FAILED,
      error: error.message,
      result: { ok: false },
    });
    throw error;
  }
}

async function runSkillHubDiscoveryOnce({ triggeredBy = "cron" } = {}) {
  const { SkillHubJobs } = require("../../models/skillHubJobs");
  const job = await SkillHubJobs.start({
    type: "scheduler:skill_hub_discovery",
    status: SkillHubJobs.Status.RUNNING,
    result: { trigger: triggeredBy },
  });

  const startTime = Date.now();
  try {
    const { SkillCatalog } = require("../../models/skillCatalog");
    const {
      localRegistry,
      externalRegistry,
    } = require("../plugins/skillHub/registry");
    const { checker } = require("../plugins/skillHub/lifecycle");
    const {
      notifyOutdatedSkill,
    } = require("../plugins/skillHub/notifications/outdatedSkillNotifier");

    await localRegistry.scan({ forceRefresh: true });

    // Sync registries from SystemSettings (enterprise allowlist).
    try {
      const { SystemSettings } = require("../../models/systemSettings");
      const { safeJsonParse } = require("../http");
      const raw = await SystemSettings.getValueOrFallback(
        { label: "skill_hub_registries" },
        "[]"
      );
      const registries = safeJsonParse(raw, []) || [];
      if (typeof externalRegistry?.setRegistries === "function") {
        externalRegistry.setRegistries(registries);
      }
    } catch (error) {
      console.warn(
        "[Scheduler] Skill Hub registries sync skipped:",
        error.message
      );
    }

    // Refresh external index only when explicitly enabled.
    if ("SKILL_HUB_EXTERNAL_DOWNLOADS_ENABLED" in process.env) {
      try {
        await externalRegistry.refresh();
      } catch (error) {
        console.warn(
          "[Scheduler] Skill Hub external refresh skipped:",
          error.message
        );
      }
    } else {
      await externalRegistry.loadIndex({ forceRefresh: true });
    }

    const externalSkills = await externalRegistry.listSkills();

    // Sync catalog (best-effort; table may not exist on older DBs).
    const syncOne = async (skill, source) => {
      if (!skill || !skill.skillId) return;
      await SkillCatalog.upsert({
        skillId: String(skill.skillId),
        source,
        metadata: skill,
        enabledDefault: true,
      });
    };

    for (const skill of localRegistry._skills || []) {
      await syncOne(skill, String(skill.sourceType || "local"));
    }

    for (const skill of externalSkills || []) {
      await syncOne(skill, String(skill.sourceType || "external"));
    }

    // Check updates (GitHub sourced skills only)
    const updates = await checker.checkAll().catch(() => []);
    const outdated = updates.filter((u) => u.status === "outdated").length;

    // Persist check results back into catalog (best-effort).
    try {
      for (const row of updates || []) {
        const skillId = row?.skillId;
        if (!skillId) continue;

        const local = localRegistry.get(skillId);
        if (!local) continue;

        await SkillCatalog.upsert({
          skillId: String(skillId),
          source: String(local.sourceType || "local"),
          metadata: {
            ...local,
            status: row?.status || null,
            lastCheckedAt: new Date().toISOString(),
            remoteHash: row?.remoteHash || null,
            currentHash: row?.currentHash || null,
          },
          enabledDefault: true,
        });

        // P2.3: Notify workspace admins/managers for outdated skills (best-effort + cooldown).
        if (row?.status === "outdated") {
          try {
            const notified = await notifyOutdatedSkill({
              skillId: String(skillId),
              source: String(local.sourceType || "local"),
              skill: local,
              update: row,
            });

            if (notified?.notifiedAt) {
              await SkillCatalog.upsert({
                skillId: String(skillId),
                source: String(local.sourceType || "local"),
                metadata: { outdatedNotifiedAt: notified.notifiedAt },
                enabledDefault: true,
              });
            }
          } catch (error) {
            console.warn(
              "[Scheduler] Skill Hub outdated notification skipped:",
              error.message
            );
          }
        }
      }
    } catch (error) {
      console.warn(
        "[Scheduler] Skill Hub check results persist skipped:",
        error.message
      );
    }

    const localCount = (localRegistry._skills || []).length;
    const externalCount = (externalSkills || []).length;
    const durationSec = Number(((Date.now() - startTime) / 1000).toFixed(2));

    await SkillHubJobs.finish(job?.id, {
      status: SkillHubJobs.Status.DONE,
      result: {
        ok: true,
        localCount,
        externalCount,
        outdated,
        durationSec,
      },
    });

    return {
      jobId: job?.id || null,
      localCount,
      externalCount,
      outdated,
      durationSec,
    };
  } catch (error) {
    await SkillHubJobs.finish(job?.id, {
      status: SkillHubJobs.Status.FAILED,
      error: error.message,
      result: { ok: false },
    });
    throw error;
  }
}

/**
 * 初始化定时任务调度器
 * @returns {Promise<boolean>} 是否成功启动
 */
async function initScheduler() {
  console.log("[Scheduler] 正在初始化定时任务调度器...");

  try {
    await disableAgentFlowTasksOnce();
  } catch (error) {
    console.warn("[Scheduler] agent_flow startup sweep failed:", error.message);
  }

  // 1. 初始化用户任务调度器（始终加载用户定时任务）
  await userScheduler.init();

  // 2. 系统级定时任务（需要 ENABLE_CRON=true）
  if (process.env.ENABLE_CRON === "true") {
    registerKnowledgeSyncTask();
    registerSkillDiscoveryTask();
    console.log(
      `[Scheduler] 系统定时任务已启动，共 ${scheduledTasks.size} 个任务`
    );
  } else {
    console.log("[Scheduler] 系统定时任务未启用 (ENABLE_CRON !== true)");
  }

  const userStatus = userScheduler.getStatus();
  console.log(`[Scheduler] 用户定时任务: ${userStatus.totalTasks} 个已加载`);

  return true;
}

/**
 * 注册知识同步定时任务
 */
function registerKnowledgeSyncTask() {
  const schedule = SCHEDULER_CONFIG.KNOWLEDGE_SYNC_SCHEDULE;

  // 验证 cron 表达式
  if (!cron.validate(schedule)) {
    console.error(`[Scheduler] 无效的 cron 表达式: ${schedule}`);
    return;
  }

  const task = cron.schedule(schedule, async () => {
    console.log("[Scheduler] 开始执行知识同步任务...");

    try {
      const { result, durationSec, jobId } = await runKnowledgeSyncOnce({
        triggeredBy: "cron",
      });
      console.log(
        `[Scheduler] 知识同步完成: 成功=${result.success}, 失败=${result.failed}, 耗时=${durationSec}s${jobId ? `, job=${jobId}` : ""}`
      );
    } catch (error) {
      console.error("[Scheduler] 知识同步失败:", error.message);
    }
  });

  scheduledTasks.set("knowledge-sync", task);
  console.log(`[Scheduler] 已注册知识同步任务: ${schedule}`);
}

/**
 * 注册 Skill Hub 发现/索引同步任务
 */
function registerSkillDiscoveryTask() {
  const schedule = SCHEDULER_CONFIG.SKILL_HUB_DISCOVERY_SCHEDULE;

  if (!cron.validate(schedule)) {
    console.error(`[Scheduler] 无效的 cron 表达式: ${schedule}`);
    return;
  }

  const task = cron.schedule(schedule, async () => {
    console.log("[Scheduler] 开始执行 Skill Hub 发现任务...");

    try {
      const { jobId, localCount, externalCount, outdated, durationSec } =
        await runSkillHubDiscoveryOnce({ triggeredBy: "cron" });
      console.log(
        `[Scheduler] Skill Hub 发现任务完成: 本地=${localCount}, 外部=${externalCount}, 待更新=${outdated}, 耗时=${durationSec}s${jobId ? `, job=${jobId}` : ""}`
      );
    } catch (error) {
      console.error("[Scheduler] Skill Hub 发现任务失败:", error.message);
    }
  });

  scheduledTasks.set("skill-hub-discovery", task);
  console.log(`[Scheduler] 已注册 Skill Hub 发现任务: ${schedule}`);
}

/**
 * 停止所有定时任务
 */
function stopScheduler() {
  console.log("[Scheduler] 正在停止定时任务调度器...");

  // 停止系统任务
  for (const [name, task] of scheduledTasks) {
    task.stop();
    console.log(`[Scheduler] 已停止系统任务: ${name}`);
  }
  scheduledTasks.clear();

  // 停止用户任务
  userScheduler.stopAll();

  console.log("[Scheduler] 定时任务调度器已停止");
}

/**
 * 获取调度器状态
 * @returns {Object}
 */
async function getSchedulerStatus() {
  const stats = await getSyncStats().catch(() => ({
    pendingCount: 0,
    lastSyncTime: null,
  }));

  const userStatus = userScheduler.getStatus();

  return {
    systemCronEnabled: process.env.ENABLE_CRON === "true",
    systemTasks: Array.from(scheduledTasks.keys()),
    systemTaskCount: scheduledTasks.size,
    userTaskCount: userStatus.totalTasks,
    knowledgeSync: {
      schedule: SCHEDULER_CONFIG.KNOWLEDGE_SYNC_SCHEDULE,
      pendingCount: stats.pendingCount,
      lastSyncTime: stats.lastSyncTime,
    },
    skillHubDiscovery: {
      schedule: SCHEDULER_CONFIG.SKILL_HUB_DISCOVERY_SCHEDULE,
    },
  };
}

/**
 * 手动触发知识同步（用于测试或管理员操作）
 * @returns {Promise<Object>}
 */
async function triggerKnowledgeSync() {
  console.log("[Scheduler] 手动触发知识同步...");
  return await runKnowledgeSyncOnce({ triggeredBy: "manual" });
}

/**
 * 手动触发 Skill Hub 发现任务（用于管理员操作）
 * @returns {Promise<Object>}
 */
async function triggerSkillHubDiscovery() {
  console.log("[Scheduler] 手动触发 Skill Hub 发现任务...");
  return await runSkillHubDiscoveryOnce({ triggeredBy: "manual" });
}

module.exports = {
  initScheduler,
  stopScheduler,
  getSchedulerStatus,
  triggerKnowledgeSync,
  triggerSkillHubDiscovery,
  userScheduler,
  SCHEDULER_CONFIG,
};
