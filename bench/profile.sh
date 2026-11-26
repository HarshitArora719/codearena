#!/usr/bin/env bash
FLAGS="--network none --cap-drop ALL --security-opt no-new-privileges --user 1000:1000 --pids-limit 64 --read-only --tmpfs /tmp:rw,exec,size=64m"
IMG=gcc:13
DIR=$(mktemp -d); chmod 777 "$DIR"
cp ~/codearena/sandbox/work/sum_ll.cpp "$DIR/main.cpp"
now() { date +%s%N; }
ms() { echo $(( ($(now) - $1) / 1000000 )); }

echo "A) start and stop an empty container (ms):"
for i in 1 2 3 4 5; do s=$(now); docker run --rm $FLAGS $IMG true >/dev/null; ms $s; done

echo "B) compile sum_ll.cpp with -O2 (ms):"
for i in 1 2 3 4 5; do s=$(now); docker run --rm $FLAGS -v "$DIR":/box $IMG g++ -O2 -o /box/a /box/main.cpp >/dev/null; ms $s; done

echo "C) run the compiled program once (ms):"
for i in 1 2 3 4 5; do s=$(now); echo "2 3" | docker run --rm -i $FLAGS -v "$DIR":/box:ro $IMG /box/a >/dev/null; ms $s; done

echo "D) one docker inspect (ms):"
docker run -d --name ca-prof $IMG sleep 30 >/dev/null
for i in 1 2 3 4 5; do s=$(now); docker inspect --format '{{.State.OOMKilled}}' ca-prof >/dev/null; ms $s; done
docker rm -f ca-prof >/dev/null
rm -rf "$DIR"
