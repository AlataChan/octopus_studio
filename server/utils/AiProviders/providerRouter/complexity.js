const TIERS = Object.freeze(["C0", "C1", "C2", "C3"]);

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function normalizeText(value) {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function keywordScore(text, patterns, weight = 0.2) {
  const hits = patterns.reduce(
    (count, pattern) => count + (pattern.test(text) ? 1 : 0),
    0
  );
  return clamp(hits * weight);
}

function tierForScore(score) {
  if (score < 0.25) return "C0";
  if (score < 0.5) return "C1";
  if (score < 0.75) return "C2";
  return "C3";
}

function scoreComplexity({ message, history = [], attachments = [] } = {}) {
  const text = normalizeText(message);
  const lower = text.toLowerCase();
  const trimmed = text.trim();
  const lengthNorm = clamp(trimmed.length / 1_400);

  const triviaSignal =
    trimmed.length <= 40 &&
    /^(hi|hello|hey|thanks|thank you|ok|okay|yes|no|what is \d+\s*[+\-*/]\s*\d+\??|你好|谢谢|天气怎么样[？?]?)$/i.test(
      trimmed
    )
      ? 1
      : 0;

  const codeSignal = clamp(
    keywordScore(
      lower,
      [
        /```/,
        /\b(function|const|let|var|class|async|await|return|javascript)\b/,
        /\b(sql|select|insert|update|delete|join|where|migration)\b/,
        /\b(api|stack trace|exception|traceback|debug|bug|error)\b/,
        /代码|查询|接口|报错|调试/,
      ],
      0.35
    ) + (/```/.test(text) ? 0.25 : 0)
  );

  const multiStepSignal = clamp(
    keywordScore(
      lower,
      [
        /\b(summarize|translate|rewrite|write|review|create|implement)\b/,
        /\b(email|refund|title ideas?|propose|fix|tests?|pseudocode)\b/,
        /\b(step|steps|plan|rollout|rollback|migration|matrix|checklist)\b/,
        /\b(retries|leases|idempotency|metrics|failure recovery)\b/,
        /\b(list|three|compare|pros and cons|tradeoffs?)\b/,
        /帮我|改得|写一个/,
        /分步骤/,
        /方案|风险/,
        /迁移|回滚/,
        /矩阵|测试|统计/,
        /[,，].*[,，].*[,，]/,
      ],
      0.3
    )
  );

  const reasoningSignal = clamp(
    keywordScore(
      lower,
      [
        /\b(explain why|why|analyze|architecture|design|reason|prove|debug)\b/,
        /\b(compare|tradeoffs?|race condition|threat model|risks?)\b/,
        /\b(distributed|multi-tenant|concurrency|security|failure recovery)\b/,
        /为什么|分析|架构/,
        /设计/,
        /威胁建模/,
        /权限|并发|多租户/,
      ],
      0.35
    )
  );

  const historyDepth = clamp((Array.isArray(history) ? history.length : 0) / 10);
  const attachmentSignal = Array.isArray(attachments) && attachments.length > 0
    ? clamp(attachments.length / 3)
    : 0;

  let score =
    0.14 +
    lengthNorm * 0.38 +
    codeSignal * 0.26 +
    multiStepSignal * 0.25 +
    reasoningSignal * 0.26 +
    historyDepth * 0.08 +
    attachmentSignal * 0.12 -
    triviaSignal * 0.22;

  if (lengthNorm > 0.8) score += 0.12;
  if (multiStepSignal > 0.55 && (reasoningSignal > 0.45 || codeSignal > 0.45)) {
    score += 0.18;
  }
  if (codeSignal > 0.7 && reasoningSignal > 0.35) score += 0.08;
  if (!triviaSignal && multiStepSignal >= 0.3) {
    score = Math.max(score, 0.3);
  }
  if (multiStepSignal >= 0.3 && reasoningSignal > 0.25) {
    score = Math.max(score, 0.52);
  }
  if (
    multiStepSignal > 0.8 &&
    reasoningSignal > 0.25 &&
    /\b(distributed|idempotency|leases|race conditions?|architecture|subsystems?)\b|威胁建模|多租户|权限系统/.test(
      lower
    )
  ) {
    score = Math.max(score, 0.78);
  }
  if (codeSignal > 0.6 && multiStepSignal > 0.2) {
    score = Math.max(score, 0.53);
  }

  score = clamp(Number(score.toFixed(4)));
  const tier = tierForScore(score);
  const features = {
    lengthNorm: Number(lengthNorm.toFixed(4)),
    codeSignal: Number(codeSignal.toFixed(4)),
    multiStepSignal: Number(multiStepSignal.toFixed(4)),
    reasoningSignal: Number(reasoningSignal.toFixed(4)),
    historyDepth: Number(historyDepth.toFixed(4)),
    attachmentSignal: Number(attachmentSignal.toFixed(4)),
    triviaSignal,
  };

  const reason = Object.entries(features)
    .filter(([, value]) => value > 0)
    .map(([key]) => key)
    .join(",") || "base";

  return { score, tier, features, reason };
}

module.exports = {
  TIERS,
  scoreComplexity,
};
