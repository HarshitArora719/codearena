import { hostname } from 'node:os';
import { judge } from './sandbox.js';
import { makeRedis, STREAM, GROUP, DEAD } from '../../shared/queue.js';
import { connectDb, mongoose } from '../../shared/db.js';
import { Problem, TestCase, Submission } from '../../shared/models.js';

const consumer = `${hostname()}-${process.pid}`;
const CLAIM_IDLE_MS = Number(process.env.CLAIM_IDLE_MS ?? 60_000);
const MAX_DELIVERIES = 3;
const redis = makeRedis();
let stopping = false;
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => { stopping = true; });

function toObj(arr) {
  const o = {};
  for (let i = 0; i < arr.length; i += 2) o[arr[i]] = arr[i + 1];
  return o;
}

async function ensureGroup() {
  try { await redis.xgroup('CREATE', STREAM, GROUP, '0', 'MKSTREAM'); }
  catch (e) { if (!String(e.message).includes('BUSYGROUP')) throw e; }
}

async function handle(entryId, fields) {
  const { submissionId } = toObj(fields);
  const sub = await Submission.findById(submissionId);
  if (!sub) throw new Error(`submission ${submissionId} not found`);

  if (sub.status === 'DONE') { // duplicate delivery after a crash: already judged
    await redis.xack(STREAM, GROUP, entryId);
    return;
  }
  await Submission.updateOne({ _id: sub._id, status: 'QUEUED' }, { status: 'RUNNING' });

  const problem = await Problem.findById(sub.problemId).lean();
  const tests = (await TestCase.find({ problemId: sub.problemId }).sort('idx').lean())
    .map((t) => ({ input: t.input, expected: t.expected }));

  const result = await judge({
    source: sub.source, tests,
    timeLimitMs: problem.timeLimitMs, memoryMb: problem.memoryMb,
  });

  const { verdict, failedTest = null, timeMs = null, detail = null } = result;
  // idempotent: only the first finisher writes the result
  await Submission.updateOne(
    { _id: sub._id, status: { $ne: 'DONE' } },
    { status: 'DONE', verdict, failedTest, timeMs, detail },
  );
  await redis.xack(STREAM, GROUP, entryId);
  console.log(`[${consumer}] ${submissionId} -> ${verdict}`);
}

async function safeHandle(entryId, fields) {
  try { await handle(entryId, fields); }
  catch (e) { console.error(`[${consumer}] ${entryId} failed, left for retry: ${e.message}`); }
}

async function deadLetter(entryId, fields) {
  const { submissionId } = toObj(fields);
  await redis.xadd(DEAD, '*', 'origId', entryId, ...fields);
  if (mongoose.isValidObjectId(submissionId)) {
    await Submission.updateOne({ _id: submissionId, status: { $ne: 'DONE' } },
      { status: 'DONE', verdict: 'SE' });
  }
  await redis.xack(STREAM, GROUP, entryId);
  console.log(`[${consumer}] ${submissionId} -> dead-lettered (SE)`);
}

async function reclaimOne() {
  const res = await redis.xautoclaim(STREAM, GROUP, consumer, CLAIM_IDLE_MS, '0-0', 'COUNT', 1);
  const entries = res[1];
  if (!entries.length) return false;
  const [entryId, fields] = entries[0];
  const info = await redis.xpending(STREAM, GROUP, entryId, entryId, 1);
  const deliveries = info.length ? info[0][3] : 1;
  console.log(`[${consumer}] reclaimed ${entryId} (delivery #${deliveries})`);
  if (deliveries > MAX_DELIVERIES) await deadLetter(entryId, fields);
  else await safeHandle(entryId, fields);
  return true;
}

async function main() {
  await connectDb();
  await ensureGroup();
  console.log(`[${consumer}] up, reclaim idle > ${CLAIM_IDLE_MS} ms`);
  while (!stopping) {
    if (await reclaimOne()) continue;
    const res = await redis.xreadgroup('GROUP', GROUP, consumer, 'COUNT', 1,
      'BLOCK', 2000, 'STREAMS', STREAM, '>');
    if (!res) continue;
    const [entryId, fields] = res[0][1][0];
    if (process.env.CRASH_AFTER_READ) { // test hook: simulate dying mid-job
      console.log(`[${consumer}] got ${entryId}, simulating crash`);
      process.exit(1);
    }
    await safeHandle(entryId, fields);
  }
  redis.disconnect();
  await mongoose.disconnect();
}

main();
