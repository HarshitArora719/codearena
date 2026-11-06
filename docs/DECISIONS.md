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