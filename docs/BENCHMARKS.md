
## Latency at about 50% load (steady arrival rate, below capacity)

| Workers | Offered load | Utilization | p50 | p95 | max |
|---|---|---|---|---|---|
| 1 | 9/min (0.15/s) | about 50% of 18.1/min | 5.9 s | 6.5 s | 6.5 s |
| 2 | 18/min (0.3/s) | about 55% of 32.4/min | 6.4 s | 6.6 s | 6.6 s |

Latency is submit to final verdict (createdAt to last update), 18 submissions per run. The
tight p50/p95 spread shows the queue was not building, so this is service time under light
load. It is higher than the 3.3 s per submission implied by the burst runs; under
investigation (see profiling).
