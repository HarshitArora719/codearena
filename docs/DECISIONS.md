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