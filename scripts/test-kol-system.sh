#!/bin/bash
# KOL监控系统集成测试脚本

set -e

BASE_URL="http://localhost:8000"
echo "🧪 KOL监控系统集成测试"
echo "================================"
echo ""

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 测试计数
PASS=0
FAIL=0

# 测试函数
test_endpoint() {
    local name=$1
    local method=$2
    local endpoint=$3
    local data=$4
    local expected_status=${5:-200}

    echo -n "Testing: $name ... "

    if [ "$method" = "GET" ]; then
        response=$(curl -s -w "\n%{http_code}" "$BASE_URL$endpoint")
    elif [ "$method" = "POST" ]; then
        response=$(curl -s -w "\n%{http_code}" -X POST \
            -H "Content-Type: application/json" \
            -d "$data" \
            "$BASE_URL$endpoint")
    elif [ "$method" = "PUT" ]; then
        response=$(curl -s -w "\n%{http_code}" -X PUT \
            -H "Content-Type: application/json" \
            -d "$data" \
            "$BASE_URL$endpoint")
    elif [ "$method" = "DELETE" ]; then
        response=$(curl -s -w "\n%{http_code}" -X DELETE "$BASE_URL$endpoint")
    fi

    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')

    if [ "$http_code" = "$expected_status" ]; then
        echo -e "${GREEN}✓ PASS${NC} (HTTP $http_code)"
        PASS=$((PASS + 1))
        return 0
    else
        echo -e "${RED}✗ FAIL${NC} (Expected HTTP $expected_status, got $http_code)"
        echo "Response: $body"
        FAIL=$((FAIL + 1))
        return 1
    fi
}

# 1. 健康检查
echo "📋 Phase 1: 基础健康检查"
echo "--------------------------------"
test_endpoint "Health Check" "GET" "/health"
echo ""

# 2. KOL管理接口测试
echo "📋 Phase 2: KOL管理接口"
echo "--------------------------------"
test_endpoint "List Influencers (Empty)" "GET" "/api/influencers/?page=1&pageSize=10"
test_endpoint "Get Influencer Stats" "GET" "/api/influencers/stats"

# 创建测试KOL
TEST_KOL_DATA='{
  "name": "测试科技博主",
  "platform": "weibo",
  "accountId": "test_weibo_001",
  "driverType": "api",
  "fetchInterval": 60,
  "priority": "high",
  "isActive": true,
  "category": "tech",
  "tags": ["AI", "芯片"]
}'

echo ""
echo "Creating test influencer..."
CREATE_RESPONSE=$(curl -s -X POST \
    -H "Content-Type: application/json" \
    -d "$TEST_KOL_DATA" \
    "$BASE_URL/api/influencers/")

INFLUENCER_ID=$(echo "$CREATE_RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin).get('id', ''))" 2>/dev/null || echo "")

if [ -n "$INFLUENCER_ID" ]; then
    echo -e "${GREEN}✓${NC} Created influencer: $INFLUENCER_ID"
    PASS=$((PASS + 1))
else
    echo -e "${RED}✗${NC} Failed to create influencer"
    echo "Response: $CREATE_RESPONSE"
    FAIL=$((FAIL + 1))
fi

echo ""

# 3. KOL详情和更新测试
if [ -n "$INFLUENCER_ID" ]; then
    echo "📋 Phase 3: KOL详情和更新"
    echo "--------------------------------"
    test_endpoint "Get Influencer Detail" "GET" "/api/influencers/$INFLUENCER_ID"

    UPDATE_DATA='{
      "name": "测试科技博主（已更新）",
      "priority": "medium"
    }'
    test_endpoint "Update Influencer" "PUT" "/api/influencers/$INFLUENCER_ID" "$UPDATE_DATA"
    echo ""
fi

# 4. 内容抓取测试
if [ -n "$INFLUENCER_ID" ]; then
    echo "📋 Phase 4: 内容抓取"
    echo "--------------------------------"
    test_endpoint "Trigger Fetch" "POST" "/api/influencers/$INFLUENCER_ID/fetch"

    # 等待抓取完成
    echo "Waiting 2 seconds for fetch to complete..."
    sleep 2

    test_endpoint "List Posts" "GET" "/api/influencers/$INFLUENCER_ID/posts?limit=10"
    echo ""
fi

# 5. 观点聚合测试
echo "📋 Phase 5: 观点聚合"
echo "--------------------------------"
test_endpoint "Get Aggregated Opinions (3d)" "GET" "/api/influencers/opinions/aggregated?domain=chip&window=3d"
test_endpoint "Get Aggregated Opinions (7d)" "GET" "/api/influencers/opinions/aggregated?domain=chip&window=7d"
test_endpoint "Get Aggregated Opinions (30d)" "GET" "/api/influencers/opinions/aggregated?domain=chip&window=30d"
echo ""

# 6. 批量操作测试
echo "📋 Phase 6: 批量操作"
echo "--------------------------------"
test_endpoint "Batch Fetch All Active" "POST" "/api/influencers/batch/fetch"
echo ""

# 7. 清理测试数据
if [ -n "$INFLUENCER_ID" ]; then
    echo "📋 Phase 7: 清理测试数据"
    echo "--------------------------------"
    test_endpoint "Delete Test Influencer" "DELETE" "/api/influencers/$INFLUENCER_ID"
    echo ""
fi

# 8. 数据库一致性检查
echo "📋 Phase 8: 数据库检查"
echo "--------------------------------"
echo "Checking database tables..."

# 检查Influencer表
INFLUENCER_COUNT=$(sqlite3 prisma/dev.db "SELECT COUNT(*) FROM Influencer;" 2>/dev/null || echo "0")
echo "  Influencer records: $INFLUENCER_COUNT"

# 检查InfluencerPost表
POST_COUNT=$(sqlite3 prisma/dev.db "SELECT COUNT(*) FROM InfluencerPost;" 2>/dev/null || echo "0")
echo "  InfluencerPost records: $POST_COUNT"

# 检查InfluencerOpinion表
OPINION_COUNT=$(sqlite3 prisma/dev.db "SELECT COUNT(*) FROM InfluencerOpinion;" 2>/dev/null || echo "0")
echo "  InfluencerOpinion records: $OPINION_COUNT"

echo ""

# 测试总结
echo "================================"
echo "📊 测试结果汇总"
echo "================================"
echo -e "通过: ${GREEN}$PASS${NC}"
echo -e "失败: ${RED}$FAIL${NC}"
echo "总计: $((PASS + FAIL))"
echo ""

if [ $FAIL -eq 0 ]; then
    echo -e "${GREEN}✓ 所有测试通过！${NC}"
    exit 0
else
    echo -e "${RED}✗ 部分测试失败${NC}"
    exit 1
fi
