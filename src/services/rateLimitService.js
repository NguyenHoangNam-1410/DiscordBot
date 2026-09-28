function createRateLimiter() {
  const buckets = new Map();

  function consume(key, limit, windowMs, now = Date.now()) {
    const cutoff = now - windowMs;
    const recent = (buckets.get(key) || []).filter(timestamp => timestamp > cutoff);
    if (recent.length >= limit) {
      buckets.set(key, recent);
      return { allowed: false, retryAfter: Math.max(1, recent[0] + windowMs - now) };
    }
    recent.push(now);
    buckets.set(key, recent);
    return { allowed: true, retryAfter: 0 };
  }

  function cleanup(now = Date.now()) {
    for (const [key, timestamps] of buckets) {
      const recent = timestamps.filter(timestamp => timestamp > now - 5 * 60_000);
      if (recent.length) buckets.set(key, recent);
      else buckets.delete(key);
    }
  }

  const timer = setInterval(cleanup, 60_000);
  timer.unref?.();
  return { consume, cleanup, stop: () => { clearInterval(timer); buckets.clear(); } };
}

module.exports = { createRateLimiter };
