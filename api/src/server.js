import express from 'express';
import { z } from 'zod';
import { connectDb, mongoose } from '../../shared/db.js';
import { Problem, Submission } from '../../shared/models.js';
import { makeRedis, STREAM } from '../../shared/queue.js';

await connectDb();
const redis = makeRedis();
const app = express();
app.use(express.json({ limit: '100kb' }));

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.get('/api/problems', async (req, res) => {
  res.json(await Problem.find({}, 'slug title').lean());
});

app.get('/api/problems/:slug', async (req, res) => {
  const p = await Problem.findOne({ slug: req.params.slug }, '-__v').lean();
  if (!p) return res.status(404).json({ error: 'not found' });
  res.json(p);
});

const SubmitBody = z.object({
  problemSlug: z.string().min(1).max(100),
  language: z.literal('cpp').default('cpp'),
  source: z.string().min(1).max(65536),
});

app.post('/api/submissions', async (req, res) => {
  const parsed = SubmitBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid body' });
  const { problemSlug, language, source } = parsed.data;

  const problem = await Problem.findOne({ slug: problemSlug }, '_id');
  if (!problem) return res.status(404).json({ error: 'problem not found' });

  const sub = await Submission.create({ problemId: problem._id, language, source });
  await redis.xadd(STREAM, '*', 'submissionId', String(sub._id)); // queue carries the ID only
  res.status(202).json({ id: sub._id, status: sub.status });
});

app.get('/api/submissions/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'bad id' });
  const s = await Submission.findById(req.params.id, '-source -__v').lean();
  if (!s) return res.status(404).json({ error: 'not found' });
  res.json(s);
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status ?? 500).json({ error: 'server error' });
});

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => console.log(`api on :${port}`));
