#!/usr/bin/env bash

set -euo pipefail

TARGET="$HOME/Library/LaunchAgents/com.ai-invest.services.plist"
launchctl bootout "gui/$(id -u)/com.ai-invest.services" 2>/dev/null || true
rm -f "$TARGET"
echo "launchd 已卸载"
