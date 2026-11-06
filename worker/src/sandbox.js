import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, rm, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const exec = promisify(execFile);
const IMAGE = 'gcc:13';
const BASE = ['--network', 'none', '--cap-drop', 'ALL',
  '--security-opt', 'no-new-privileges', '--user', '1000:1000', '--pids-limit', '64'];

const rmContainer = (name) => exec('docker', ['rm', '-f', name]).catch(() => {});
const oomKilled = async (name) => {
  try {
    const { stdout } = await exec('docker', ['inspect', '--format', '{{.State.OOMKilled}}', name]);
    return stdout.trim() === 'true';
  } catch { return false; }
};
const norm = (s) => s.split('\n').map((l) => l.trimEnd()).join('\n').trimEnd();

// Runs one docker command; enforces wall time and output size from OUTSIDE the container.
function runDocker(args, { input = '', name, timeoutMs, maxBytes = 1_000_000 }) {
  return new Promise((resolve) => {
    const p = spawn('docker', args);
    let out = '', err = '', bytes = 0, timedOut = false, tooMuch = false;
    const kill = () => spawn('docker', ['kill', name], { stdio: 'ignore' });
    const timer = setTimeout(() => { timedOut = true; kill(); }, timeoutMs);
    p.stdout.on('data', (d) => {
      bytes += d.length;
      if (bytes > maxBytes) { if (!tooMuch) { tooMuch = true; kill(); } }
      else out += d;
    });
    p.stderr.on('data', (d) => { if (err.length < 10_000) err += d; });
    p.stdin.on('error', () => {});
    p.stdin.end(input);
    p.on('close', (code) => { clearTimeout(timer); resolve({ code, out, err, timedOut, tooMuch }); });
  });
}

export async function judge({ source, tests, timeLimitMs = 2000, memoryMb = 128 }) {
  const dir = await mkdtemp(path.join(tmpdir(), 'ca-'));
  await chmod(dir, 0o777); // container runs as uid 1000 and must write the binary here
  try {
    await writeFile(path.join(dir, 'main.cpp'), source);

    // Phase 1: compile (own limits, so compile bombs can't hang us)
    const cname = 'ca-c-' + randomUUID().slice(0, 8);
    const c = await runDocker(
      ['run', '-i', '--name', cname, ...BASE, '--memory', '512m', '--memory-swap', '512m',
       '--cpus', '1', '--read-only', '--tmpfs', '/tmp:rw,size=128m', '-v', `${dir}:/box`,
        IMAGE, 'timeout', '-s', 'KILL', '20', 'g++', '-O2', '-o', '/box/a', '/box/main.cpp'],
      { name: cname, timeoutMs: 15000 });
    await rmContainer(cname);
    if (c.timedOut || c.code !== 0) return { verdict: 'CE', detail: c.err.slice(0, 2000) };

    // Phase 2: run each test in a fresh container
    let maxMs = 0;
    for (const [i, t] of tests.entries()) {
      const name = 'ca-r-' + randomUUID().slice(0, 8);
      const t0 = Date.now();
      const r = await runDocker(
        ['run', '-i', '--name', name, ...BASE, '--memory', `${memoryMb}m`,
         '--memory-swap', `${memoryMb}m`, '--cpus', '0.5', '--read-only',
            '--tmpfs', '/tmp:rw,size=16m', '-v', `${dir}:/box:ro`, IMAGE,
         'timeout', '-s', 'KILL', String(Math.ceil(timeLimitMs / 1000) + 3), '/box/a'],
        { input: t.input, name, timeoutMs: timeLimitMs });
      const ms = Date.now() - t0;
      maxMs = Math.max(maxMs, ms);
      const oom = await oomKilled(name);
      await rmContainer(name);

      const fail = (verdict) => ({ verdict, failedTest: i, timeMs: ms });
      if (r.tooMuch) return fail('OLE');
      if (r.timedOut) return fail('TLE');
      if (oom) return fail('MLE');
      if (r.code !== 0) return { ...fail('RE'), detail: `exit ${r.code}` };
      if (norm(r.out) !== norm(t.expected)) return fail('WA');
    }
    return { verdict: 'AC', timeMs: maxMs };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}