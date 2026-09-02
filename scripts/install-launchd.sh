#!/usr/bin/env bash

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"
TEMPLATE="$PROJECT_DIR/scripts/com.ai-invest.services.plist"
DATA_TEMPLATE="$PROJECT_DIR/scripts/com.ai-invest.data-service.plist"
TARGET="$LAUNCH_AGENTS_DIR/com.ai-invest.services.frontend.plist"
DATA_TARGET="$LAUNCH_AGENTS_DIR/com.ai-invest.services.data.plist"

mkdir -p "$LAUNCH_AGENTS_DIR"
sed "s#__PROJECT_DIR__#$PROJECT_DIR#g" "$TEMPLATE" > "$TARGET"
sed "s#__PROJECT_DIR__#$PROJECT_DIR#g" "$DATA_TEMPLATE" > "$DATA_TARGET"
launchctl bootout "gui/$(id -u)/com.ai-invest.services" 2>/dev/null || true
launchctl bootout "gui/$(id -u)/com.ai-invest.services.frontend" 2>/dev/null || true
launchctl bootout "gui/$(id -u)/com.ai-invest.services.data" 2>/dev/null || true
sleep 1
launchctl bootstrap "gui/$(id -u)" "$TARGET"
launchctl bootstrap "gui/$(id -u)" "$DATA_TARGET"
launchctl enable "gui/$(id -u)/com.ai-invest.services.frontend"
launchctl enable "gui/$(id -u)/com.ai-invest.services.data"
echo "launchd 已安装并启动: $TARGET, $DATA_TARGET"
