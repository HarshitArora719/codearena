#!/usr/bin/env bash
H='content-type: application/json'
BASE=localhost:3000
U="sse$RANDOM@test.com"
SUB=$(jq -Rs '{problemSlug:"sum-two", source:.}' ~/codearena/sandbox/work/a1_loop.cpp)
curl -s -c /tmp/s.jar -X POST $BASE/api/auth/register -H "$H" \
  -d "{\"email\":\"$U\",\"name\":\"Sse\",\"password\":\"password123\"}" > /dev/null
for i in 1 2 3; do
  ID=$(curl -s -b /tmp/s.jar -X POST $BASE/api/submissions -H "$H" -d "$SUB" | jq -r .id)
done
echo "streaming submission $ID (3rd in the queue)"
curl -sN --max-time 40 -b /tmp/s.jar $BASE/api/submissions/$ID/events | while IFS= read -r line; do
  [ -n "$line" ] && echo "$(date +%T) $line"
done
echo "stream closed"
