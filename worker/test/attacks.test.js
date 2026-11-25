import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { judge } from '../src/sandbox.js';

const exec = promisify(execFile);
const SUM_TESTS = [{ input: '2 3\n', expected: '5' }, { input: '10 20\n', expected: '30' }];
const ONE = (expected) => [{ input: '', expected }];
const T = { timeout: 60_000 };

const SUM = `#include <iostream>
int main(){ long long a,b; std::cin>>a>>b; std::cout<<a+b<<std::endl; }`;

// ---------- normal verdicts ----------
test('AC: correct program is accepted', T, async () => {
  const r = await judge({ source: SUM, tests: SUM_TESTS });
  assert.equal(r.verdict, 'AC');
});

test('WA: wrong answer is rejected and the failing test is reported', T, async () => {
  const src = `#include <iostream>
int main(){ long long a,b; std::cin>>a>>b; std::cout<<a+b+1<<std::endl; }`;
  const r = await judge({ source: src, tests: SUM_TESTS });
  assert.equal(r.verdict, 'WA');
  assert.equal(r.failedTest, 0);
});

test('CE: syntax error', T, async () => {
  const r = await judge({ source: 'int main(){ this is not c++ }', tests: SUM_TESTS });
  assert.equal(r.verdict, 'CE');
});

test('RE: segmentation fault', T, async () => {
  const r = await judge({ source: 'int main(){ int* p = 0; *p = 1; }', tests: SUM_TESTS });
  assert.equal(r.verdict, 'RE');
});

// ---------- resource attacks ----------
test('TLE: infinite loop is killed', T, async () => {
  const r = await judge({ source: 'int main(){ while(1); }', tests: SUM_TESTS });
  assert.equal(r.verdict, 'TLE');
});

test('MLE: memory bomb is killed by the memory cap', T, async () => {
  const src = `#include <vector>
int main(){ std::vector<char*> v;
  while(1){ char* p = new char[1<<20]; for(int i=0;i<(1<<20);i+=4096) p[i]=1; v.push_back(p); } }`;
  const r = await judge({ source: src, tests: SUM_TESTS });
  assert.equal(r.verdict, 'MLE');
});

test('OLE: endless output is cut off', T, async () => {
  const src = `#include <cstdio>
int main(){ while(1) puts("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"); }`;
  const r = await judge({ source: src, tests: SUM_TESTS });
  assert.equal(r.verdict, 'OLE');
});

test('fork bomb is contained by the PID limit (verdict TLE, host survives)', T, async () => {
  const src = `#include <unistd.h>
int main(){ while(1) fork(); }`;
  const r = await judge({ source: src, tests: SUM_TESTS });
  assert.equal(r.verdict, 'TLE');
});

test('compile bomb (#include of an endless file) ends as CE, not a hang', { timeout: 90_000 }, async () => {
  const r = await judge({ source: '#include "/dev/zero"\nint main(){}', tests: SUM_TESTS });
  assert.equal(r.verdict, 'CE');
});

// ---------- containment checks: the attack runs, we verify it FAILED ----------
test('network is unreachable from inside the sandbox', T, async () => {
  const src = `#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <cstdio>
int main(){ int s = socket(AF_INET, SOCK_STREAM, 0); sockaddr_in a{};
  a.sin_family = AF_INET; a.sin_port = htons(80); inet_pton(AF_INET, "1.1.1.1", &a.sin_addr);
  puts(connect(s, (sockaddr*)&a, sizeof a) == 0 ? "OPEN" : "BLOCKED"); }`;
  const r = await judge({ source: src, tests: ONE('BLOCKED') });
  assert.equal(r.verdict, 'AC');
});

test('filesystem is read-only (cannot write to / or to the mounted folder)', T, async () => {
  const src = `#include <cstdio>
int main(){ bool a = fopen("/box/x", "w") != nullptr; bool b = fopen("/x", "w") != nullptr;
  puts((a || b) ? "WRITABLE" : "READONLY"); }`;
  const r = await judge({ source: src, tests: ONE('READONLY') });
  assert.equal(r.verdict, 'AC');
});

test('program runs as a normal user, not root', T, async () => {
  const src = `#include <unistd.h>
#include <cstdio>
int main(){ printf("%d\\n", (int)getuid()); }`;
  const r = await judge({ source: src, tests: ONE('1000') });
  assert.equal(r.verdict, 'AC');
});

// ---------- cleanup ----------
test('no sandbox containers are left running after all that', T, async () => {
  const { stdout } = await exec('docker', ['ps', '-aq', '--filter', 'name=ca-']);
  assert.equal(stdout.trim(), '');
});
