const WINDOW_MS = 60_000;
const buckets = new Map();

const LIMITS = {
  perAccount: parseInt(process.env.RATE_LIMIT_PER_ACCOUNT || "120"),
  perPeer: parseInt(process.env.RATE_LIMIT_PER_PEER || "20"),
};

function incrementFixedWindow(key) {
  const now = Date.now();
  let bucket = buckets.get(key);

  if (!bucket || bucket.expiresAt <= now) {
    if (bucket?.timer) clearTimeout(bucket.timer);
    const timer = setTimeout(() => buckets.delete(key), WINDOW_MS);
    timer.unref?.();
    bucket = { count: 0, expiresAt: now + WINDOW_MS, timer };
    buckets.set(key, bucket);
  }

  bucket.count += 1;
  return bucket.count;
}

function checkRateLimit(message) {
  const accountKey = `${message.provider}:${message.accountId}`;
  const peerKey = `${message.provider}:${message.accountId}:${message.peerId}`;

  const accountCount = incrementFixedWindow(accountKey);
  const peerCount = incrementFixedWindow(peerKey);

  if (accountCount > LIMITS.perAccount) return { limited: true, reason: "RATE_LIMITED" };
  if (peerCount > LIMITS.perPeer) return { limited: true, reason: "RATE_LIMITED" };
  return { limited: false };
}

module.exports = { checkRateLimit };
