# Decisions

## 001: Develop on WSL2 (Linux), not native Windows
- Problem: the worker depends on Linux features (cgroups, namespaces) via Docker.
- Options: native Windows, WSL2, plain VM.
- Choice: WSL2 + Docker Desktop, repo inside the Linux filesystem.
- Why: same kernel features as a real Linux server, so behavior here matches
  production; cross-filesystem (/mnt/c) I/O is slow and breaks permissions.
- Revisit when: deploying to a real Linux VM (should need no changes).

## 002: Docker with layered limits as the sandbox (v1)
- Problem: run untrusted C++/Python safely on a shared machine.
- Options: bare process + ulimit, Docker, gVisor, Firecracker microVM.
- Choice: Docker with no network, memory+swap cap, CPU quota, PID limit,
  all capabilities dropped, no-new-privileges, non-root, read-only rootfs.
- Why: each flag blocks one named attack (verified by hand: loop, memory
  bomb, fork bomb, network, disk write). Free, runs on a laptop, I can
  explain every flag.
- Weakness: containers share the host kernel, so a kernel exploit escapes.
- Revisit when: running for strangers -> gVisor/Firecracker for stronger isolation.

## 003: Containment, not detection
- Blocked attacks may still exit 0. Verdicts come from output + exit status;
  the sandbox only guarantees harmlessness.

## 004: Enforce limits from outside the sandbox (Node supervisor)
- Problem: a limit enforced inside the container can be bypassed or never fire.
- Options: `timeout` inside container only; Node supervisor; cgroup-only limits.
- Choice: Node enforces wall time (docker kill) and output size (byte counter,
  kill past 1 MB); memory uses Docker's OOMKilled flag to tell MLE from RE.
- Why: the judge must not trust the thing it's judging. OOMKilled is the kernel's
  own report, not a guess from exit code 137.
- Known limits: wall time includes container startup and kill latency
  (observed 2618 ms on a 2000 ms limit). Later: measure CPU time from cgroups.

## 005: Redis Streams with a consumer group, not a plain list
- Problem: a job popped by a worker that then crashes must not vanish.
- Options: Redis list (LPUSH/BRPOP), list + RPOPLPUSH, BullMQ, Streams, RabbitMQ/Kafka.
- Choice: Streams + consumer group (XADD, XREADGROUP, XACK, XAUTOCLAIM).
- Why: Streams keep a pending entry per delivered-but-unacked job. Verified by
  killing a worker mid-job: XPENDING showed 1, a second worker reclaimed it,
  and XPENDING went to 0 after judging.
- Rejected: BullMQ hides these internals (fine for production, worse for learning);
  RabbitMQ/Kafka are overkill at this scale and cost an extra service.
- Revisit when: multiple queues/priorities or cross-service routing are needed.

## 006: At-least-once delivery + idempotent result write
- Problem: after a crash a job may run twice; exactly-once is not achievable here.
- Choice: deliver at least once; write the result with SET NX keyed by submission id.
- Why: a duplicate run cannot overwrite or change the first stored result.
- Constraint: CLAIM_IDLE_MS must exceed the longest possible judge time, or a
  healthy slow job gets stolen and judged twice (still safe, but wasteful).

## 007: One job per worker process
- Problem: concurrent containers compete for CPU and distort timing and TLE verdicts.
- Choice: each worker judges one submission at a time; scale by running more workers.
- Revisit when: measuring CPU time from cgroups makes concurrency safe.

## 008: Dead-letter after 3 deliveries
- Problem: a poison job (bad payload, judge bug) would be retried forever.
- Choice: after 3 deliveries move it to `submissions:dead`, store verdict SE, ack it.
- Verified: bad payload failed 3 times, then was dead-lettered at delivery #4.

## 009: The queue carries only the submission ID
- Choice: the stream holds the ID; the worker loads source and tests from MongoDB.
- Why: Mongo is the single source of truth; stream messages stay tiny.
- Rejected: putting source code in the stream (two copies of the data, large messages).

## 010: Hidden tests in a separate collection
- Choice: TestCase collection; the API never returns test inputs or expected outputs.
- Why: no query on Problem can leak them. Verified: GET /api/problems/sum-two shows
  no tests, and results expose only the failing test's index.
- Revisit when: tests grow large (move to object storage).

## 011: Known gap: dual write between Mongo and the stream
- Problem: API saves to Mongo, then XADDs. A crash in between leaves a submission
  QUEUED forever.
- Plan: a sweeper that re-enqueues old QUEUED submissions (the worker already
  ignores duplicates thanks to the status guard), added in the hardening step.

## 012: bcrypt (cost 12) for password hashing
- Why: slow by design, per-user salt built in, widely understood. Passwords capped at
  72 bytes (bcrypt's limit). Login runs a dummy compare when the email is unknown so
  timing does not reveal which emails exist.
- Rejected/revisit: Argon2id is the current first recommendation; bcrypt kept for
  ubiquity. Be ready to say that.

## 013: JWT in an httpOnly, SameSite=Lax cookie (HS256 pinned)
- Why: JS cannot read httpOnly cookies, so an XSS bug cannot steal the session.
  Algorithm pinned on verify to block alg=none and confusion attacks.
- Rejected: localStorage (readable by any script); server sessions in Redis (revocable).
- Trade-off: a JWT cannot be revoked before expiry (logout only clears the cookie).
- Revisit: add a CSRF token if the frontend ends up on a different site.

## 014: Redis fixed-window rate limiting (INCR + EXPIRE NX in one MULTI)
- Limits: login 10/15 min per IP, register 5/hour per IP, submit 10/min per user.
- Why: atomic, shared by all API instances, tiny. NX in the same MULTI means a crash
  cannot leave a counter with no TTL.
- Weaknesses: a burst up to 2x at a window boundary; per-IP limits are wrong behind a
  proxy unless trust proxy is configured; add per-account login limits.

## 015: Max 3 unfinished submissions per user
- Why: fairness, so one user cannot fill the queue and starve everyone else.
- Weakness: count-then-insert is approximate under truly concurrent requests.

## 016: SSE for live status (not WebSockets or polling)
- Why: updates flow one way (server to browser), SSE is plain HTTP, the browser
  reconnects by itself, and cookie auth works unchanged.
- Rejected: WebSockets (two-way, more machinery, only needed for live contest chat);
  polling (wasteful, slower to feel live).

## 017: Redis pub/sub for events, MongoDB stays the source of truth
- Problem: worker and API are separate processes; pub/sub drops messages if nobody listens.
- Choice: on connect, subscribe first, then read Mongo and send the snapshot (buffering
  events that arrive meanwhile); re-check Mongo every 5 s; a failed publish never fails a job.
- Also: ownership checked (404 for others), max 5 open streams per user.

## 018: Vite dev server proxies /api to the API
- Why: browser sees one origin, so the httpOnly cookie and EventSource work with no CORS.
- Revisit: in deployment serve the built frontend and the API behind one origin.

## 019: Client closes EventSource on DONE, with a polling fallback
- Problem: when the server ends an SSE stream, the browser treats it as a dropped
  connection and reconnects every 3 s forever.
- Choice: close() on the final event; on error fetch the final state from the plain endpoint.

## 020: Automated adversarial test suite for the sandbox
- Choice: node:test file that runs judge() directly against 13 cases (all 7 verdicts,
  fork bomb, compile bomb, network, read-only fs, non-root, leftover containers).
- Containment checks run the attack and verify it FAILED (program prints BLOCKED /
  READONLY / uid 1000), instead of trusting a verdict.
- Why: after any sandbox change one command (npm test) shows whether a hole opened.
- Result: 13/13 pass in about 15 s.

## 021: Sweeper closes the dual-write gap (decision 011)
- Problem: a crash between "save to Mongo" and "XADD" left submissions QUEUED forever.
- Choice: Mongo is the commit point (API answers 202 even if enqueue fails); enqueuedAt
  marks a submission as announced; every worker runs a sweeper (Redis SET NX lock, so
  one sweeps at a time) that re-enqueues QUEUED submissions with no marker after 30 s,
  and re-announces anything QUEUED for over 10 minutes.
- Why duplicates are safe: the status guard writes a result only once (decision 006).
- Verified: planted a submission that was never on the stream; it was picked up
  about 40 s later and judged AC.
- Limits: a duplicate delivered while the first run is still RUNNING wastes work (a
  per-submission lease would fix it); the sweeper does not help during a full Redis outage.

## 022: Benchmark the judging pipeline directly, not through the API
- Why: API rate limits (10 per minute per user, 3 unfinished) would block a load test, and
  weakening them for a benchmark is the wrong trade. The pipeline is what is worth measuring.
- Two modes: burst for throughput, steady rate for latency. Burst latency is mostly queue
  position, so it is not reported as latency.
- Lesson: a steady-rate test is only valid below capacity. Offered load must be about 50%
  of measured throughput, or latency is just queue length.

## 023: Keep a fresh container per test; do not collapse tests into one container
- Measured: about 59% of a submission's time is the 5 test-container starts (about 315 ms
  each); queue and database overhead are below noise.
- Option not taken: one container per submission with an in-container supervisor, about 40%
  faster, but tests would share tmpfs and process space, limit enforcement would move inside
  the sandbox (undoing decision 004), and per-test memory attribution gets unclear.
- Why: measured capacity (about 22 per minute per worker, about 53 with 4 workers) covers the
  expected contest peak (50 users, about 30 submissions per minute) with about 1.7x headroom
  on 4 workers. One worker alone would not.
- Revisit when: real load exceeds capacity.