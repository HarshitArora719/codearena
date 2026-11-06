#!/usr/bin/env bash
# usage: ./run.sh <file-in-work/>   (default: main.cpp)
FILE=${1:-main.cpp}
docker run --rm \
  --network none \
  --memory 128m --memory-swap 128m \
  --cpus 0.5 \
  --pids-limit 64 \
  --cap-drop ALL \
  --security-opt no-new-privileges \
  --user 1000:1000 \
  --read-only \
  --tmpfs /tmp:rw,exec,size=64m \
  -v "$PWD/work":/work:ro \
  gcc:13 sh -c "g++ -O2 -o /tmp/a /work/$FILE && timeout 2 /tmp/a < /work/in.txt"
echo "exit code: $?"
