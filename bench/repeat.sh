#!/usr/bin/env bash
cd ~/codearena/bench
summ() { sed -n '/^{/,/^}/p' | jq -c '{mode,finished,seconds,perMinute,p50:.latencyMs.p50,p95:.latencyMs.p95}'; }
echo "--- burst N=20, 1 worker";  for i in 1 2 3; do N=20 ./run.sh 1 | summ; done
echo "--- burst N=40, 4 workers"; for i in 1 2 3; do N=40 ./run.sh 4 | summ; done
echo "--- latency at 50% load, 1 worker"
for i in 1 2 3; do MODE=rate RATE=0.15 DURATION=60 ./run.sh 1 | summ; done
