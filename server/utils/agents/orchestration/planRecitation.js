const fsDefault = require("fs");
const path = require("path");
const { isWithin } = require("../../files");

const DEFAULT_SUMMARY_CHARS = 300;

function labelFor(employees, assistantId) {
  const e = (employees || []).find((x) => String(x.assistantId) === String(assistantId));
  return e?.label || e?.name || e?.title || String(assistantId);
}

function summaryOf(stepResults, index, summaryChars) {
  const r = (stepResults || []).find((s) => s.index === index);
  if (!r || !r.ok || !r.text) return null;
  const t = String(r.text);
  return t.length > summaryChars ? t.slice(0, summaryChars) + "…" : t;
}

function renderRecitation({ plan, cursor, stepResults, employees, subtask, summaryChars = DEFAULT_SUMMARY_CHARS }) {
  const lines = ["[团队计划]"];
  plan.forEach((s, i) => {
    const mark = i < cursor ? "x" : i === cursor ? ">" : " ";
    let line = `- [${mark}] 步${i + 1} @${labelFor(employees, s.assistantId)}：${s.subtask}`;
    if (i === cursor) line += "（← 你现在做这步）";
    const sm = summaryOf(stepResults, i, summaryChars);
    if (sm) line += `\n    产出：${sm}`;
    lines.push(line);
  });
  lines.push(`[你的任务] ${subtask}`);
  return lines.join("\n");
}

function buildPlanFile({ goal, plan, cursor, stepResults, employees }) {
  const header = `# 团队计划\n\n目标：${goal}\n\n## 步骤进度\n`;
  const body = plan
    .map((s, i) => {
      const mark = i < cursor ? "x" : i === cursor ? ">" : " ";
      const sm = summaryOf(stepResults, i, 1000);
      return `- [${mark}] 步${i + 1} @${labelFor(employees, s.assistantId)}：${s.subtask}` + (sm ? `\n    产出：${sm}` : "");
    })
    .join("\n");
  return header + body + "\n";
}

function writePlanFile({ runId, goal, plan, cursor, stepResults, employees, storageDir, writeFile = fsDefault.writeFileSync, mkdir = (d) => fsDefault.mkdirSync(d, { recursive: true }) }) {
  const root = path.resolve(storageDir, "team-runs");
  const dir = path.resolve(root, String(runId).replace(/[^a-zA-Z0-9_-]/g, "_"));
  const file = path.resolve(dir, "plan.md");
  if (!isWithin(root, file)) return null;
  try {
    mkdir(dir);
    const content = buildPlanFile({ goal, plan, cursor, stepResults, employees });
    writeFile(file, content);
    return { path: file, content };
  } catch (_) {
    return null;
  }
}

module.exports = { renderRecitation, buildPlanFile, writePlanFile, labelFor, DEFAULT_SUMMARY_CHARS };
