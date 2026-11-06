import { readFile } from 'node:fs/promises';
import { judge } from './sandbox.js';

const tests = [
  { input: '2 3\n', expected: '5' },
  { input: '10 20\n', expected: '30' },
];
const files = ['main', 'wa', 'ce', 'ole', 're', 'a1_loop', 'a2_mem', 'a3_fork'];

for (const f of files) {
  const source = await readFile(new URL(`../../sandbox/work/${f}.cpp`, import.meta.url), 'utf8');
  const res = await judge({ source, tests });
  console.log(f.padEnd(8), JSON.stringify(res));
}