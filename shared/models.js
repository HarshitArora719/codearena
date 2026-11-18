import { mongoose } from './db.js';
const { Schema } = mongoose;

export const Problem = mongoose.model('Problem', new Schema({
  slug: { type: String, unique: true, required: true },
  title: { type: String, required: true },
  statement: { type: String, required: true },
  sample: { input: String, output: String },
  timeLimitMs: { type: Number, default: 2000 },
  memoryMb: { type: Number, default: 128 },
}, { timestamps: true }));

// Hidden tests are a separate collection so no Problem query can ever leak them.
export const TestCase = mongoose.model('TestCase', new Schema({
  problemId: { type: Schema.Types.ObjectId, ref: 'Problem', required: true, index: true },
  idx: Number,
  input: String,
  expected: String,
}));

export const Submission = mongoose.model('Submission', new Schema({
  problemId: { type: Schema.Types.ObjectId, ref: 'Problem', required: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User' }, // required in step 5b
  language: { type: String, default: 'cpp' },
  source: { type: String, required: true },
  status: { type: String, enum: ['QUEUED', 'RUNNING', 'DONE'], default: 'QUEUED', index: true },
  verdict: String,
  failedTest: Number,
  timeMs: Number,
  detail: String,
}, { timestamps: true }));