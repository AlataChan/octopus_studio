class ChannelRateController {
  constructor({
    peerWindowMs = 60 * 1000,
    peerMax = 20,
    accountConcurrencyMax = 10,
  } = {}) {
    this.peerWindowMs = Number(peerWindowMs);
    this.peerMax = Number(peerMax);
    this.accountConcurrencyMax = Number(accountConcurrencyMax);

    this.peerBuckets = new Map();
    this.accountConcurrency = new Map();
  }

  _cleanupPeerBuckets(now = Date.now()) {
    for (const [key, bucket] of this.peerBuckets.entries()) {
      if (bucket.resetAt <= now) {
        this.peerBuckets.delete(key);
      }
    }
  }

  allowPeerMessage({ provider, accountId, peerId }) {
    const now = Date.now();
    this._cleanupPeerBuckets(now);

    const key = `${provider}:${accountId}:${peerId}`;
    let bucket = this.peerBuckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = {
        count: 0,
        resetAt: now + this.peerWindowMs,
      };
      this.peerBuckets.set(key, bucket);
    }

    if (bucket.count >= this.peerMax) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: bucket.resetAt,
      };
    }

    bucket.count += 1;
    return {
      allowed: true,
      remaining: Math.max(0, this.peerMax - bucket.count),
      resetAt: bucket.resetAt,
    };
  }

  acquireAccountSlot({ provider, accountId }) {
    const key = `${provider}:${accountId}`;
    const current = this.accountConcurrency.get(key) || 0;
    if (current >= this.accountConcurrencyMax) {
      return false;
    }
    this.accountConcurrency.set(key, current + 1);
    return true;
  }

  releaseAccountSlot({ provider, accountId }) {
    const key = `${provider}:${accountId}`;
    const current = this.accountConcurrency.get(key) || 0;
    if (current <= 1) {
      this.accountConcurrency.delete(key);
      return;
    }
    this.accountConcurrency.set(key, current - 1);
  }

  getActiveConcurrency({ provider, accountId }) {
    return this.accountConcurrency.get(`${provider}:${accountId}`) || 0;
  }
}

module.exports = {
  ChannelRateController,
};
