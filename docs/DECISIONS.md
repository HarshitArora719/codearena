# Decisions

## 001: Develop on WSL2 (Linux), not native Windows
- Problem: the worker depends on Linux features (cgroups, namespaces) via Docker.
- Options: native Windows, WSL2, plain VM.
- Choice: WSL2 + Docker Desktop, repo inside the Linux filesystem.
- Why: same kernel features as a real Linux server, so behavior here matches
  production; cross-filesystem (/mnt/c) I/O is slow and breaks permissions.
- Revisit when: deploying to a real Linux VM (should need no changes).