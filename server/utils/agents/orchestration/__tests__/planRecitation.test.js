const path = require("path");
const { isWithin } = require("../../../files");
const { renderRecitation, buildPlanFile, writePlanFile } = require("../planRecitation");

const employees = [
  { assistantId: "a1", name: "溪源Vera" },
  { assistantId: "a2", title: "露娜Luna" },
];
const plan = [
  { assistantId: "a1", subtask: "分析销售数据" },
  { assistantId: "a2", subtask: "撰写报告" },
  { assistantId: "a1", subtask: "复核结论" },
];

describe("planRecitation", () => {
  it("renderRecitation: done/current/pending marks + name||title fallback + prior output", () => {
    const out = renderRecitation({
      plan, cursor: 1, employees,
      stepResults: [{ index: 0, ok: true, text: "洞察：Q3 增长 20%" }],
      subtask: "撰写报告",
    });
    expect(out).toContain("[x]");
    expect(out).toContain("[>]");
    expect(out).toContain("[ ]");
    expect(out).toContain("溪源Vera");
    expect(out).toContain("露娜Luna");
    expect(out).toContain("洞察：Q3 增长 20%");
  });

  it("renderRecitation: truncates long prior output by summaryChars", () => {
    const long = "x".repeat(5000);
    const out = renderRecitation({
      plan, cursor: 1, employees,
      stepResults: [{ index: 0, ok: true, text: long }],
      subtask: "撰写报告", summaryChars: 200,
    });
    expect(out.length).toBeLessThan(long.length);
  });

  it("buildPlanFile: markdown contains goal + all steps", () => {
    const md = buildPlanFile({ goal: "分析数据做报告", plan, cursor: 1, employees, stepResults: [] });
    expect(md).toContain("分析数据做报告");
    expect(md).toContain("分析销售数据");
    expect(md).toContain("复核结论");
  });

  it("writePlanFile: confines path under team-runs and rejects traversal", () => {
    const writes = [];
    const storageDir = "/tmp/alata-storage";
    const res = writePlanFile({
      runId: "../evil/run", goal: "g", plan, cursor: 1, employees, stepResults: [],
      storageDir, writeFile: (p, c) => writes.push([p, c]), mkdir: () => {},
    });
    const root = path.join(storageDir, "team-runs");
    expect(isWithin(root, res.path)).toBe(true);
    expect(writes).toHaveLength(1);
  });
});
