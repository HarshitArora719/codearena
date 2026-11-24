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