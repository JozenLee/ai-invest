#!/usr/bin/env bash

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

cleanup() {
  "$PROJECT_DIR/scripts/services.sh" stop all || true
  exit 0
}

trap cleanup INT TERM EXIT
"$PROJECT_DIR/scripts/services.sh" start all
while true; do
  sleep 30
  "$PROJECT_DIR/scripts/services.sh" status all >/dev/null
done
