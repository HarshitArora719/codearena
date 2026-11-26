import { Submission } from './models.js';
import { STREAM } from './queue.js';

// XADD first, then the marker. A crash in between only causes a harmless duplicate later.
export async function enqueueSubmission(redis, id) {
  await redis.xadd(STREAM, '*', 'submissionId', String(id));
  await Submission.updateOne({ _id: id }, { enqueuedAt: new Date() });
}
