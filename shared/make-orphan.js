import { readFile } from 'node:fs/promises';
import { connectDb, mongoose } from './db.js';
import { Problem, Submission, User } from './models.js';

await connectDb();
const user = await User.findOne();
const problem = await Problem.findOne({ slug: 'sum-two' });
if (!user || !problem) throw new Error('need at least one user and the sum-two problem');
const source = await readFile(new URL('../sandbox/work/sum_ll.cpp', import.meta.url), 'utf8');

const sub = await Submission.create({ problemId: problem._id, userId: user._id, source });
console.log('created orphan (never put on the stream):', String(sub._id));

const t0 = Date.now();
let last = '';
while (Date.now() - t0 < 90_000) {
  const s = await Submission.findById(sub._id, 'status verdict enqueuedAt').lean();
  const line = `${s.status} ${s.verdict ?? ''} enqueuedAt=${s.enqueuedAt ? 'set' : 'unset'}`;
  if (line !== last) { console.log(new Date().toISOString().slice(11, 19), line); last = line; }
  if (s.status === 'DONE') break;
  await new Promise((r) => setTimeout(r, 1000));
}
await mongoose.disconnect();
