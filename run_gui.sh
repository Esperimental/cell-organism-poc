#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

REQUESTED_PORT="${PORT:-8080}"
PORT="$REQUESTED_PORT"
while ss -ltn "sport = :${PORT}" 2>/dev/null | tail -n +2 | grep -q .; do
  PORT=$((PORT + 1))
done

URL="http://127.0.0.1:${PORT}/src/gui/?run=$(date +%s)"

echo "Cell Organism GUI"
if [[ "$PORT" != "$REQUESTED_PORT" ]]; then
  echo "Port $REQUESTED_PORT is already in use; using $PORT instead."
fi
echo "Serving: $URL"
echo "Press Ctrl+C to stop."
echo

python3 scripts/dev_server.py "$PORT" >/tmp/cell-organism-gui-${PORT}.log 2>&1 &
SERVER_PID=$!
cleanup() {
  kill "$SERVER_PID" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

for _ in $(seq 1 40); do
  if curl -fsS "http://127.0.0.1:${PORT}/src/gui/" >/dev/null 2>&1; then
    break
  fi
  if ! kill -0 "$SERVER_PID" >/dev/null 2>&1; then
    echo "GUI server failed to start. See /tmp/cell-organism-gui-${PORT}.log" >&2
    exit 1
  fi
  sleep 0.05
done

if ! curl -fsS "http://127.0.0.1:${PORT}/src/gui/" >/dev/null 2>&1; then
  echo "GUI server did not become ready." >&2
  exit 1
fi

if [[ "${NO_OPEN:-0}" != "1" ]] && command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$URL" >/dev/null 2>&1 || true
fi

wait "$SERVER_PID"
