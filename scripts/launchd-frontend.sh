#!/usr/bin/env bash

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

if [ -f "$PROJECT_DIR/.env" ]; then
  set -a
  source "$PROJECT_DIR/.env"
  set +a
fi

NODE_BIN="/Users/jozen.lee/.nvm/versions/node/v20.20.2/bin/node"
NPM_CLI="/Users/jozen.lee/.nvm/versions/node/v20.20.2/lib/node_modules/npm/bin/npm-cli.js"
export PATH="$(dirname "$NODE_BIN"):/usr/bin:/bin:/usr/sbin:/sbin"
exec "$NODE_BIN" "$NPM_CLI" run dev
