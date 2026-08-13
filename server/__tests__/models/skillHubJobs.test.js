jest.mock("../../utils/prisma", () => ({
  skill_hub_jobs: {
    create: jest.fn(),
    update: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
}));

const prisma = require("../../utils/prisma");
const { SkillHubJobs } = require("../../models/skillHubJobs");

describe("SkillHubJobs Model", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("start() creates a running job by default", async () => {
    prisma.skill_hub_jobs.create.mockResolvedValue({ id: "job_1" });

    const job = await SkillHubJobs.start({
      type: "skill_hub_install",
      skillId: "custom:test",
      workspaceId: 1,
      scopeType: "workspace",
      scopeId: "__workspace__",
      result: { input: { skillId: "custom:test" } },
    });

    expect(prisma.skill_hub_jobs.create).toHaveBeenCalled();
    const arg = prisma.skill_hub_jobs.create.mock.calls[0][0];
    expect(arg.data.type).toBe("skill_hub_install");
    expect(arg.data.status).toBe("running");
    expect(arg.data.skillId).toBe("custom:test");
    expect(arg.data.workspaceId).toBe(1);
    expect(typeof arg.data.id).toBe("string");
    expect(typeof arg.data.resultJson).toBe("string");
    expect(job).toEqual({ id: "job_1" });
  });

  test("finish() updates job status and finishedAt", async () => {
    prisma.skill_hub_jobs.update.mockResolvedValue({ id: "job_1" });

    await SkillHubJobs.finish("job_1", { status: "done", result: { ok: true } });

    expect(prisma.skill_hub_jobs.update).toHaveBeenCalledWith({
      where: { id: "job_1" },
      data: expect.objectContaining({
        status: "done",
        finishedAt: expect.any(Date),
        resultJson: expect.any(String),
      }),
    });
  });

  test("list() queries by workspaceId and status", async () => {
    prisma.skill_hub_jobs.findMany.mockResolvedValue([{ id: "job_1" }]);

    const jobs = await SkillHubJobs.list({ workspaceId: 2, status: "running", limit: 10 });

    expect(prisma.skill_hub_jobs.findMany).toHaveBeenCalledWith({
      where: { workspaceId: 2, status: "running" },
      take: 10,
      skip: 0,
      orderBy: [{ createdAt: "desc" }],
    });
    expect(jobs).toEqual([{ id: "job_1" }]);
  });

  test("listByTypes() queries with an IN filter", async () => {
    prisma.skill_hub_jobs.findMany.mockResolvedValue([{ id: "job_2" }]);

    const jobs = await SkillHubJobs.listByTypes(["a", "b"], { limit: 5, offset: 10 });

    expect(prisma.skill_hub_jobs.findMany).toHaveBeenCalledWith({
      where: { type: { in: ["a", "b"] } },
      take: 5,
      skip: 10,
      orderBy: [{ createdAt: "desc" }],
    });
    expect(jobs).toEqual([{ id: "job_2" }]);
  });
});
