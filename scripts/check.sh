#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
npm ci
node --check server.js
