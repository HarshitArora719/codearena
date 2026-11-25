import Redis from 'ioredis';

export const STREAM = 'submissions';
export const GROUP = 'judges';
export const DEAD = 'submissions:dead';
export const makeRedis = () => new Redis(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379');export const EVENTS = 'submission-events';
