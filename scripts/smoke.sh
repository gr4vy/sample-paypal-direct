#!/usr/bin/env bash
# Proves the server boots with placeholder config and a throwaway key, and serves its checkout page.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -d node_modules ] || npm ci
tmp=$(mktemp -d)
pid=
trap '[ -n "$pid" ] && kill "$pid" 2>/dev/null; rm -rf "$tmp"' EXIT
port=$(node -e 'const s=require("net").createServer().listen(0,()=>{console.log(s.address().port);s.close()})')
cp -R server.js package.json public "$tmp"/
ln -s "$PWD/node_modules" "$tmp/node_modules"
openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-256 -out "$tmp/private_key.pem" 2>/dev/null
node -e 'const c=require("./config.example.json");c.port=+process.argv[1];c.privateKeyPath=process.argv[2];console.log(JSON.stringify(c))' "$port" "$tmp/private_key.pem" >"$tmp/config.json"
node "$tmp/server.js" >"$tmp/server.log" 2>&1 &
pid=$!
for _ in $(seq 60); do
  curl -fs -o /dev/null "http://localhost:$port/" && exit 0
  sleep 1
done
cat "$tmp/server.log"
exit 1
