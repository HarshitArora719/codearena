#!/usr/bin/env bash
H='content-type: application/json'
BASE=localhost:3000
SRC=~/codearena/sandbox/work/sum_ll.cpp
SUB=$(jq -Rs '{problemSlug:"sum-two", source:.}' "$SRC")
A="alice$RANDOM@test.com"; B="bob$RANDOM@test.com"
rm -f /tmp/a.jar /tmp/b.jar

echo "== 1. not logged in (expect 401 login required)"
curl -s -X POST $BASE/api/submissions -H "$H" -d "$SUB"; echo

echo "== 2. register A (expect 201 and a Set-Cookie with HttpOnly and SameSite=Lax)"
curl -si -c /tmp/a.jar -X POST $BASE/api/auth/register -H "$H" \
  -d "{\"email\":\"$A\",\"name\":\"Alice\",\"password\":\"password123\"}" | grep -iE "^HTTP/|set-cookie"
echo "-- /me:"; curl -s -b /tmp/a.jar $BASE/api/auth/me; echo

echo "== 3. logged-in submit (expect 202), then verdict AC"
RESP=$(curl -s -b /tmp/a.jar -X POST $BASE/api/submissions -H "$H" -d "$SUB"); echo "$RESP"
ID=$(echo "$RESP" | jq -r .id)
sleep 6
curl -s -b /tmp/a.jar $BASE/api/submissions/$ID; echo

echo "== 4. user B reading A's submission (expect 404 not found)"
curl -s -c /tmp/b.jar -X POST $BASE/api/auth/register -H "$H" \
  -d "{\"email\":\"$B\",\"name\":\"Bob\",\"password\":\"password123\"}" > /dev/null
curl -s -b /tmp/b.jar $BASE/api/submissions/$ID; echo

echo "== 5. wrong password vs unknown email (expect identical messages)"
curl -s -X POST $BASE/api/auth/login -H "$H" -d "{\"email\":\"$A\",\"password\":\"wrongpass1\"}"; echo
curl -s -X POST $BASE/api/auth/login -H "$H" -d '{"email":"nobody@test.com","password":"wrongpass1"}'; echo

echo "== 6. login rate limit (expect 401s, then 429s)"
for i in $(seq 1 12); do
  curl -s -o /dev/null -w "%{http_code} " -X POST $BASE/api/auth/login -H "$H" \
    -d "{\"email\":\"$A\",\"password\":\"wrongpass1\"}"
done; echo
