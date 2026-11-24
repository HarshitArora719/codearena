// Fixed-window limiter. INCR + EXPIRE NX run in one MULTI, so a crash cannot leave a
// counter without a TTL (which would block someone forever).
export function rateLimit({ redis, name, max, windowSec, keyFn }) {
  return async (req, res, next) => {
    try {
      const key = `rl:${name}:${keyFn(req)}`;
      const [[, n]] = await redis.multi().incr(key).expire(key, windowSec, 'NX').exec();
      if (n > max) {
        const ttl = await redis.ttl(key);
        res.set('Retry-After', String(Math.max(ttl, 1)));
        return res.status(429).json({ error: 'too many requests' });
      }
      next();
    } catch (e) {
      next(e);
    }
  };
}