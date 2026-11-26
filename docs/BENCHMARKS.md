# Benchmarks

Hardware: 12 logical CPUs, 7.4 GB RAM in WSL2, laptop.
Judging pipeline only (queue, workers, sandbox, MongoDB). The benchmark creates submissions
directly, bypassing the API so per-user rate limits do not distort the test.
Workload: one correct C++ solution, 5 hidden tests, a fresh container per test.
Each figure is the median of 3 runs.

## Throughput (burst)

| Workers | Submissions | Median per minute | Range |
|---|---|---|---|
| 1 | 20 | 21.7 | 21.5 to 22.2 |
| 4 | 40 | 52.7 | 51.4 to 52.8 |

Speedup with 4 workers: 2.4x (about 61% efficiency). Not CPU-bound on this machine (12 logical
CPUs); the shared Docker daemon is the likely limit but this was not measured.

## Latency at about 50% load (steady arrival, 1 worker, 9 submissions per run)

| p50 | p95 (small sample, close to max) |
|---|---|
| 2.77 s (range 2.75 to 2.83) | 2.87 s (range 2.85 to 3.09) |

Offered load was 9 per minute against about 22 per minute capacity. A steady-rate test is only
valid below capacity; above it, latency is just queue length.

## Where one submission's time goes (1 worker, light load)

| Phase | Time | Share |
|---|---|---|
| Compile (container start, g++, remove) | about 690 ms | 26% |
| 5 test runs (container start plus run) | 5 x about 315 ms = 1.55 s | 59% |
| 5 x docker inspect (OOM check) | 5 x about 34 ms = 0.17 s | 6% |
| 5 x docker rm | 5 x about 48 ms = 0.24 s | 9% |
| Total | about 2.65 s (measured p50 about 2.7 s) | |

Queue, MongoDB and API overhead are below measurement noise. The first container after an idle
gap is slower (690 to 1185 ms versus about 320 ms warm).

## Known measurement caveats

- An early set of runs showed about 6 s latency and 18 per minute on one worker. Later repeated
  runs did not reproduce it. The cause is unknown (possibly other load on the laptop).
- Numbers come from a laptop under WSL2, not a server.
