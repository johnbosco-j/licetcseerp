#!/bin/zsh
# macOS: double-click to start the Attendance Station.
cd "$(dirname "$0")"
command -v node >/dev/null || { echo "Install Node.js 18+ from https://nodejs.org"; read; exit 1; }
[ -d node_modules ] || npm install --no-audit --no-fund
( sleep 2; open http://localhost:7070 ) &
node server.mjs
