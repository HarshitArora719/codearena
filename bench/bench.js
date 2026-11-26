import { readFile } from 'node:fs/promises';
import { connectDb, mongoose } from '../shared/db.js';
import { Problem, Submission, User } from '../shared/models.js';
import { makeRedis } from '../shared/queue.js';
import { enqueueSubmission } from '../shared/enqueue.js';

const MODE = process.env.MODE ?? 'burst';             // burst | rate
const N = Number(process.env.N ?? 40);                // burst: how many submissions
const RATE = Number(process.env.RATE ?? 0.3);         // rate: submissions per second
const DURATION = Number(process.env.DURATION ?? 60);  // rate: seconds

await connectDb();
const redis = makeRedis();
const user = await User.findOneAndUpdate(
  { email: 'bench@local.test' },
  { $setOnInsert: { name: 'bench', passwordHash: 'not-a-real-hash' } },
  { upsert: true, returnDocument: 'after' },
);
const problem = await Problem.findOne({ slug: 'sum-two' });
const source = await readFile(new URL('../sandbox/work/sum_ll.cpp', import.meta.url), 'utf8');

const ids = [];
async function submitOne() {
  const s = await Submission.create({ problemId: problem._id, userId: user._id, source });
  await enqueueSubmission(redis, s._id);
  ids.push(s._id);
}

const t0 = Date.now();
if (MODE === 'burst') {
  await Promise.all(Array.from({ length: N }, submitOne));
} else {
  const total = Math.floor(RATE * DURATION);
  for (let i = 0; i < total; i++) {
    const wait = t0 + (i * 1000) / RATE - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    await submitOne();
  }
}
console.log(`submitted ${ids.length} (${MODE}), waiting for verdicts...`);

const deadline = Date.now() + 15 * 60_000;
let rows = [];
while (Date.now() < deadline) {
  rows = await Submission.find({ _id: { $in: ids } }, 'status verdict createdAt updatedAt').lean();
  if (rows.every((r) => r.status === 'DONE')) break;
  await new Promise((r) => setTimeout(r, 500));
}
const done = rows.filter((r) => r.status === 'DONE');
if (!done.length) {
  console.log('nothing finished: are the workers running?');
} else {
  const lat = done.map((r) => r.updatedAt - r.createdAt).sort((a, b) => a - b);
  const pct = (p) => lat[Math.min(lat.length - 1, Math.floor((p / 100) * lat.length))];
  const secs = (Math.max(...done.map((r) => +r.updatedAt)) - t0) / 1000;
  const verdicts = {};
  for (const r of done) verdicts[r.verdict] = (verdicts[r.verdict] ?? 0) + 1;
  console.log(JSON.stringify({
    mode: MODE, submitted: ids.length, finished: done.length, verdicts,
    seconds: +secs.toFixed(1), perMinute: +((done.length / secs) * 60).toFixed(1),
    latencyMs: { p50: pct(50), p95: pct(95), max: lat.at(-1) },
  }, null, 2));
}
await Submission.deleteMany({ _id: { $in: ids } });
await mongoose.disconnect();
redis.disconnect();
