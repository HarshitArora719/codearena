import express from 'express';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { connectDb, mongoose } from '../../shared/db.js';
import { Problem, Submission, User } from '../../shared/models.js';
import { makeRedis, STREAM } from '../../shared/queue.js';
import { setSession, clearSession, requireAuth } from './auth.js';
import { rateLimit } from './ratelimit.js';
import { enqueueSubmission } from '../../shared/enqueue.js';
import { mountEvents } from './events.js';

await connectDb();
const redis = makeRedis();
const app = express();
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

const DUMMY_HASH = await bcrypt.hash('dummy-password-for-timing', 12);
const MAX_INFLIGHT = 3;

const limitRegister = rateLimit({ redis, name: 'register', max: 5, windowSec: 3600, keyFn: (r) => r.ip });
const limitLogin = rateLimit({ redis, name: 'login', max: 10, windowSec: 900, keyFn: (r) => r.ip });
const limitSubmit = rateLimit({ redis, name: 'submit', max: 10, windowSec: 60, keyFn: (r) => r.userId });

app.get('/api/health', (req, res) => res.json({ ok: true }));

// ---------- auth ----------
const RegisterBody = z.object({
  email: z.string().email().max(254),
  name: z.string().min(1).max(50),
  password: z.string().min(8).max(72), // bcrypt only uses the first 72 bytes
});

app.post('/api/auth/register', limitRegister, async (req, res) => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid body' });
  const { email, name, password } = parsed.data;
  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({ email, name, passwordHash });
    setSession(res, user._id);
    res.status(201).json({ id: user._id, email: user.email, name: user.name });
  } catch (e) {
    if (e.code === 11000) return res.status(409).json({ error: 'email already registered' });
    throw e;
  }
});

const LoginBody = z.object({ email: z.string().max(254), password: z.string().max(72) });

app.post('/api/auth/login', limitLogin, async (req, res) => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid body' });
  const email = parsed.data.email.trim().toLowerCase();
  const user = await User.findOne({ email });
  // always run one bcrypt compare so timing does not reveal whether the email exists
  const ok = await bcrypt.compare(parsed.data.password, user ? user.passwordHash : DUMMY_HASH);
  if (!user || !ok) return res.status(401).json({ error: 'invalid email or password' });
  setSession(res, user._id);
  res.json({ id: user._id, email: user.email, name: user.name });
});

app.post('/api/auth/logout', (req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

app.get('/api/auth/me', requireAuth, async (req, res) => {
  const user = await User.findById(req.userId, 'email name').lean();
  if (!user) return res.status(401).json({ error: 'login required' });
  res.json(user);
});

// ---------- problems (public) ----------
app.get('/api/problems', async (req, res) => {
  res.json(await Problem.find({}, 'slug title').lean());
});

app.get('/api/problems/:slug', async (req, res) => {
  const p = await Problem.findOne({ slug: req.params.slug }, '-__v').lean();
  if (!p) return res.status(404).json({ error: 'not found' });
  res.json(p);
});

// ---------- submissions (login required) ----------
const SubmitBody = z.object({
  problemSlug: z.string().min(1).max(100),
  language: z.literal('cpp').default('cpp'),
  source: z.string().min(1).max(65536),
});

app.post('/api/submissions', requireAuth, limitSubmit, async (req, res) => {
  const parsed = SubmitBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid body' });
  const { problemSlug, language, source } = parsed.data;

  // fairness: one user cannot fill the queue (approximate under concurrent requests)
  const inflight = await Submission.countDocuments({ userId: req.userId, status: { $ne: 'DONE' } });
  if (inflight >= MAX_INFLIGHT) return res.status(429).json({ error: 'too many unfinished submissions' });

  const problem = await Problem.findOne({ slug: problemSlug }, '_id');
  if (!problem) return res.status(404).json({ error: 'problem not found' });

  const sub = await Submission.create({ problemId: problem._id, userId: req.userId, language, source });
  // Mongo is the commit point. If enqueueing fails the sweeper will retry, so still answer 202.
  try { await enqueueSubmission(redis, sub._id); }
  catch (e) { console.error('enqueue failed, sweeper will retry:', e.message); }
  res.status(202).json({ id: sub._id, status: sub.status });
});

app.get('/api/submissions', requireAuth, async (req, res) => {
  res.json(await Submission.find({ userId: req.userId }, '-source -__v').sort('-createdAt').limit(50).lean());
});

app.get('/api/submissions/:id', requireAuth, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'bad id' });
  // 404 (not 403) for other people's submissions, so IDs cannot be probed
  const s = await Submission.findOne({ _id: req.params.id, userId: req.userId }, '-source -__v').lean();
  if (!s) return res.status(404).json({ error: 'not found' });
  res.json(s);
});

mountEvents(app);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status ?? 500).json({ error: 'server error' });
});

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => console.log(`api on :${port}`));
