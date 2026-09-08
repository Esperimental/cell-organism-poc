#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

SCENARIO="${1:-scenarios/food-east.json}"
TICKS="${2:-20}"
SEED="${3:-42}"
RUN_NAME="manual-$(date +%Y%m%d-%H%M%S)"
OUTPUT_DIR="runs/$RUN_NAME"

echo "Running cell-organism POC"
echo "  scenario: $SCENARIO"
echo "  ticks:    $TICKS"
echo "  seed:     $SEED"
echo "  output:   $OUTPUT_DIR"
echo

npm run sim -- \
  --scenario "$SCENARIO" \
  --rules configs/baseline.json \
  --world configs/world.json \
  --ticks "$TICKS" \
  --seed "$SEED" \
  --output "$OUTPUT_DIR"

echo
echo "=== INITIAL MAP ==="
cat "$OUTPUT_DIR/initial-map.txt"

echo "=== FINAL MAP ==="
cat "$OUTPUT_DIR/final-map.txt"

echo "=== SUMMARY ==="
cat "$OUTPUT_DIR/summary.json"

echo
echo "Detailed logs: $OUTPUT_DIR/events.ndjson"
echo "Per-tick metrics: $OUTPUT_DIR/metrics.ndjson"
