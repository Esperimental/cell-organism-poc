#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

PORT="${PORT:-8080}"
URL="http://127.0.0.1:${PORT}/src/gui/"

echo "Cell Organism GUI"
echo "Serving: $URL"
echo "Press Ctrl+C to stop."
echo

if command -v xdg-open >/dev/null 2>&1; then
  (sleep 0.5; xdg-open "$URL" >/dev/null 2>&1 || true) &
fi

python3 -m http.server "$PORT" --bind 127.0.0.1
