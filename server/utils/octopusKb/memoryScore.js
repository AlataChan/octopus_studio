const DEFAULT_HALF_LIFE_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function isPinned(kind) {
  return String(kind || "").trim() === "open_question";
}

function scoreCandidate(
  { sourcePriority = 1, created = null } = {},
  { now = new Date(), halfLifeDays = DEFAULT_HALF_LIFE_DAYS } = {}
) {
  const priorityWeight = Number.isFinite(Number(sourcePriority))
    ? Number(sourcePriority)
    : 1;
  const halfLife = Number(halfLifeDays) > 0 ? Number(halfLifeDays) : DEFAULT_HALF_LIFE_DAYS;
  const ageDays = ageInDays(created, now);
  return Math.pow(0.5, ageDays / halfLife) * priorityWeight;
}

function ageInDays(created, now) {
  if (!created) return 0;
  const createdDate = new Date(created);
  const nowDate = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(createdDate.getTime()) || Number.isNaN(nowDate.getTime())) {
    return 0;
  }
  return Math.max(0, (nowDate.getTime() - createdDate.getTime()) / MS_PER_DAY);
}

module.exports = {
  DEFAULT_HALF_LIFE_DAYS,
  isPinned,
  scoreCandidate,
};
