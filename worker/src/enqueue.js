import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { makeRedis, STREAM } from './queue.js';

const redis = makeRedis();
const tests = [
  { input: '2 3\n', expected: '5' },
  { input: '10 20\n', expected: '30' },
];

const ids = {};
for (const f of process.argv.slice(2)) {
  const source = await readFile(new URL(`../../sandbox/work/${f}.cpp`, import.meta.url), 'utf8');
  const id = randomUUID().slice(0, 8);
  await redis.xadd(STREAM, '*', 'id', id,
    'payload', JSON.stringify({ source, tests, timeLimitMs: 2000, memoryMb: 128 }));
  ids[id] = f;
}
console.log('enqueued', ids);

const pending = new Set(Object.keys(ids));
const deadline = Date.now() + 60_000;
while (pending.size && Date.now() < deadline) {
  for (const id of [...pending]) {
    const r = await redis.get(`result:${id}`);
    if (r) { console.log(ids[id].padEnd(8), r); pending.delete(id); }
  }
  await new Promise((r) => setTimeout(r, 500));
}
redis.disconnect();