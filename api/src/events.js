import { mongoose } from '../../shared/db.js';
import { Submission } from '../../shared/models.js';
import { makeRedis, EVENTS } from '../../shared/queue.js';
import { requireAuth } from './auth.js';

const MAX_STREAMS_PER_USER = 5;
const RECHECK_MS = 5000;

const listeners = new Map();   // submissionId -> Set of callbacks
const openStreams = new Map(); // userId -> number of open streams

// One shared subscriber connection for the whole API process.
const subscriber = makeRedis();
await subscriber.subscribe(EVENTS);
subscriber.on('message', (_channel, msg) => {
  let ev;
  try { ev = JSON.parse(msg); } catch { return; }
  const set = listeners.get(ev.id);
  if (set) for (const fn of set) fn(ev);
});

const toEvent = (s) => ({
  id: String(s._id), status: s.status, verdict: s.verdict ?? null,
  failedTest: s.failedTest ?? null, timeMs: s.timeMs ?? null, detail: s.detail ?? null,
});
const load = (id, userId) => Submission.findOne({ _id: id, userId }, '-source -__v').lean();

export function mountEvents(app) {
  app.get('/api/submissions/:id/events', requireAuth, async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'bad id' });
    const id = new mongoose.Types.ObjectId(req.params.id).toString();
    const userId = req.userId;

    if (!(await load(id, userId))) return res.status(404).json({ error: 'not found' });
    const open = openStreams.get(userId) ?? 0;
    if (open >= MAX_STREAMS_PER_USER) return res.status(429).json({ error: 'too many open streams' });
    openStreams.set(userId, open + 1);

    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();
    res.write('retry: 3000\n\n'); // browser reconnect delay

    let closed = false, ready = false, timer;
    const buffer = [];

    const cleanup = () => {
      if (closed) return;
      closed = true;
      clearInterval(timer);
      const set = listeners.get(id);
      if (set) { set.delete(onEvent); if (!set.size) listeners.delete(id); }
      const n = (openStreams.get(userId) ?? 1) - 1;
      if (n <= 0) openStreams.delete(userId); else openStreams.set(userId, n);
    };
    const finish = () => { cleanup(); res.end(); };
    const deliver = (ev) => {
      if (closed) return;
      res.write(`data: ${JSON.stringify(ev)}\n\n`);
      if (ev.status === 'DONE') finish();
    };
    function onEvent(ev) { if (ready) deliver(ev); else buffer.push(ev); }

    res.on('close', cleanup); // client went away (use res, not req, for this)

    // 1) subscribe first, 2) then read the current state: no event can slip between them
    if (!listeners.has(id)) listeners.set(id, new Set());
    listeners.get(id).add(onEvent);

    const snap = await load(id, userId);
    if (closed) return;
    if (snap) deliver(toEvent(snap));
    ready = true;
    for (const ev of buffer.splice(0)) deliver(ev);
    if (closed) return;

    // safety net: pub/sub can lose messages, the database cannot
    timer = setInterval(async () => {
      if (closed) return;
      try {
        const cur = await load(id, userId);
        if (cur && cur.status === 'DONE') deliver(toEvent(cur));
        else if (!closed) res.write(': ping\n\n');
      } catch { /* try again next tick */ }
    }, RECHECK_MS);
  });
}
