#!/bin/bash

set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:3000}"
FAILED=0

check_contains() {
  local label="$1"
  local pattern="$2"
  local body="$3"

  if printf '%s' "$body" | rg -q "$pattern"; then
    echo "✓ $label"
  else
    echo "✗ $label"
    FAILED=1
  fi
}

check_status() {
  local label="$1"
  local expected="$2"
  local url="$3"
  local actual

  actual=$(curl -sS -o /dev/null -w '%{http_code}' "$url")
  if [ "$actual" = "$expected" ]; then
    echo "✓ $label ($actual)"
  else
    echo "✗ $label (expected $expected, got $actual)"
    FAILED=1
  fi
}

echo "验证生产环境: $BASE_URL"

OVERVIEW_BODY=$(curl -fsS "$BASE_URL/portfolio/overview") || {
  echo "✗ 无法访问 $BASE_URL/portfolio/overview"
  exit 1
}

check_contains "持仓总览导航存在" '持仓总览' "$OVERVIEW_BODY"
check_contains "AI分析导航存在" 'AI分析' "$OVERVIEW_BODY"

if printf '%s' "$OVERVIEW_BODY" | rg -q '组合优化|风险分析|标签管理|系统偏好'; then
  echo "✗ 已删除导航仍出现在页面响应中"
  FAILED=1
else
  echo "✓ 已删除导航未出现在页面响应中"
fi

check_status "组合优化路由已删除" "404" "$BASE_URL/portfolio/optimize"
check_status "风险分析路由已删除" "404" "$BASE_URL/portfolio/risk"
check_status "设置路由已删除" "404" "$BASE_URL/settings"
check_status "标签管理路由已删除" "404" "$BASE_URL/settings/tags"

if [ "$FAILED" -ne 0 ]; then
  echo "生产环境验证失败"
  exit 1
fi

echo "生产环境验证通过"
