#!/bin/bash
# 大V监控API快速测试脚本
# 用法: bash scripts/test-influencer-api.sh

set -e

BASE_URL="${1:-http://localhost:3000}"
INFLUENCER_ID="${2:-inf_1785044475094355}"

echo "=========================================="
echo "大V监控API测试"
echo "Base URL: $BASE_URL"
echo "Influencer ID: $INFLUENCER_ID"
echo "=========================================="
echo ""

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 测试函数
test_api() {
    local name="$1"
    local url="$2"
    local expected="$3"

    echo -n "Testing $name... "
    response=$(curl -s "$url")

    if echo "$response" | grep -q "$expected"; then
        echo -e "${GREEN}✓${NC}"
        return 0
    else
        echo -e "${RED}✗${NC}"
        echo "Expected: $expected"
        echo "Response: $response"
        return 1
    fi
}

# 运行测试
test_api "Influencer详情" \
    "$BASE_URL/api/influencers/$INFLUENCER_ID" \
    '"success":true'

test_api "Influencer Posts" \
    "$BASE_URL/api/influencers/$INFLUENCER_ID/posts?limit=5" \
    '"success":true'

test_api "必需字段: postCount" \
    "$BASE_URL/api/influencers/$INFLUENCER_ID" \
    '"postCount":'

test_api "必需字段: tags" \
    "$BASE_URL/api/influencers/$INFLUENCER_ID" \
    '"tags":\['

test_api "必需字段: scheduleType" \
    "$BASE_URL/api/influencers/$INFLUENCER_ID" \
    '"scheduleType":"polling"'

echo ""
echo -e "${GREEN}所有测试通过！${NC}"
