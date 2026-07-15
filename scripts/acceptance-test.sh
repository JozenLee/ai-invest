#!/bin/bash

# AI投资分析系统 - 验收测试脚本

set -e

BASE_URL="http://localhost:3000"
PASS=0
FAIL=0
TOTAL=0

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 测试函数
test_api() {
    local name=$1
    local method=$2
    local endpoint=$3
    local body=$4
    local expected_status=$5

    TOTAL=$((TOTAL + 1))

    if [ "$method" = "GET" ]; then
        response=$(curl -s -w "\n%{http_code}" "$BASE_URL$endpoint" 2>/dev/null || echo -e "\n000")
    else
        response=$(curl -s -w "\n%{http_code}" -X POST -H "Content-Type: application/json" -d "$body" "$BASE_URL$endpoint" 2>/dev/null || echo -e "\n000")
    fi

    status=$(echo "$response" | tail -n1)

    if [ "$status" = "$expected_status" ]; then
        echo -e "${GREEN}✓${NC} $name (HTTP $status)"
        PASS=$((PASS + 1))
    else
        echo -e "${RED}✗${NC} $name (Expected: $expected_status, Got: $status)"
        FAIL=$((FAIL + 1))
    fi
}

echo "=========================================="
echo "  AI投资分析系统 - 验收测试"
echo "=========================================="
echo ""

# 一、基础框架验收
echo -e "${YELLOW}一、基础框架验收${NC}"

test_api "健康检查" GET "/api/health" "" "200"

# 二、基础数据层验收
echo ""
echo -e "${YELLOW}二、基础数据层验收${NC}"

test_api "市场概览API" GET "/api/market/overview" "" "200"
test_api "资金流向API" GET "/api/market/capital-flow" "" "200"

# 三、事件驱动层验收
echo ""
echo -e "${YELLOW}三、事件驱动层验收${NC}"

test_api "新闻列表API" GET "/api/events/feed" "" "200"
test_api "事件分析API" POST "/api/events/analyze" '{"title":"NVIDIA发布新GPU"}' "200"
test_api "领域趋势API" GET "/api/events/trends/半导体" "" "200"

# 四、知识图谱层验收
echo ""
echo -e "${YELLOW}四、知识图谱层验收${NC}"

test_api "图谱节点API" GET "/api/graph/nodes" "" "200"
test_api "图谱边API" GET "/api/graph/edges" "" "200"
test_api "图谱树API" GET "/api/graph/tree" "" "200"
test_api "完整图谱API" GET "/api/graph/full" "" "200"
test_api "传导路径API" POST "/api/graph/propagation" '{"event":"GPU需求增长"}' "200"
test_api "变更日志API" GET "/api/graph/changelog" "" "200"

# 五、决策层验收
echo ""
echo -e "${YELLOW}五、决策层验收${NC}"

test_api "ETF分析API" POST "/api/analysis/etf" '{"ticker":"512480"}' "200"

# 结果统计
echo ""
echo "=========================================="
echo "  测试结果统计"
echo "=========================================="
echo ""
echo "总计: $TOTAL"
echo -e "通过: ${GREEN}$PASS${NC}"
echo -e "失败: ${RED}$FAIL${NC}"
echo ""

if [ $FAIL -eq 0 ]; then
    echo -e "${GREEN}✓ 所有验收测试通过！${NC}"
    exit 0
else
    echo -e "${RED}✗ 有 $FAIL 个测试失败${NC}"
    exit 1
fi
