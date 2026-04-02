#!/bin/bash
# Workshop process supervisor — keeps server + vite alive
# Usage: ./scripts/supervise.sh

DIR="$(cd "$(dirname "$0")/.." && pwd)"
SERVER_LOG="/tmp/workshop-server.log"
WEB_LOG="/tmp/workshop-web.log"

check_port() {
  lsof -i :"$1" -sTCP:LISTEN -t >/dev/null 2>&1
}

start_server() {
  echo "[supervise] starting server on :3100"
  cd "$DIR" && node server/dist/index.js >> "$SERVER_LOG" 2>&1 &
  disown
}

start_web() {
  echo "[supervise] starting vite on :5173"
  cd "$DIR/web" && npx vite --host 0.0.0.0 >> "$WEB_LOG" 2>&1 &
  disown
}

# Initial start
check_port 3100 || start_server
check_port 5173 || start_web

# Monitor loop
while true; do
  sleep 10
  if ! check_port 3100; then
    echo "[supervise] $(date +%H:%M:%S) server down, restarting..."
    start_server
  fi
  if ! check_port 5173; then
    echo "[supervise] $(date +%H:%M:%S) vite down, restarting..."
    start_web
  fi
done
