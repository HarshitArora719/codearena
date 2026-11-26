#!/usr/bin/env bash
# usage: [N=40] [MODE=rate RATE=0.3 DURATION=60] ./run.sh <number-of-workers>
W=${1:-1}
pids=()
cd ~/codearena/worker
for i in $(seq "$W"); do node src/worker.js > /tmp/bench-w$i.log 2>&1 & pids+=($!); done
sleep 3
echo "=== $W worker(s) ==="
cd ~/codearena/bench && node bench.js
for p in "${pids[@]}"; do kill -INT "$p"; done
wait
