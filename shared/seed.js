import { connectDb, mongoose } from './db.js';
import { Problem, TestCase } from './models.js';

await connectDb();
const problem = await Problem.findOneAndUpdate(
  { slug: 'sum-two' },
  {
    title: 'Sum of Two Numbers',
    statement: 'Read two integers a and b (|a|, |b| <= 2*10^9) and print a + b.',
    sample: { input: '2 3', output: '5' },
    timeLimitMs: 2000,
    memoryMb: 128,
  },
  { upsert: true, returnDocument: 'after' },
);
await TestCase.deleteMany({ problemId: problem._id });
const cases = [
  ['2 3', '5'],
  ['-5 5', '0'],
  ['0 0', '0'],
  ['2000000000 2000000000', '4000000000'],
  ['-2000000000 -2000000000', '-4000000000'],
];
await TestCase.insertMany(cases.map(([input, expected], idx) => ({
  problemId: problem._id, idx, input: input + '\n', expected,
})));
console.log('seeded', problem.slug, cases.length, 'tests');
await mongoose.disconnect();