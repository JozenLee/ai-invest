#!/bin/bash

# 趋势页面端到端验证脚本
# 验证修复后的API和前端功能

echo "======================================"
echo "趋势页面功能验证测试"
echo "======================================"
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
test_api() {
    local name=$1
    local url=$2
    local check=$3

    echo -n "测试: $name ... "

    response=$(curl -s "$url")

    if echo "$response" | grep -q "$check"; then
        echo -e "${GREEN}✓ 通过${NC}"
        ((PASS++))
    else
        echo -e "${RED}✗ 失败${NC}"
        echo "  响应: $(echo $response | head -c 200)"
        ((FAIL++))
    fi
}

# 测试Python数据服务
echo "1. Python数据服务测试 (端口8000)"
echo "-----------------------------------"

test_api "趋势摘要API" \
    "http://localhost:8000/api/trends/summary?newsCount=50" \
    '"success":true'

test_api "趋势详情API - 半导体" \
    "http://localhost:8000/api/trends/analysis?domain=semiconductor&newsCount=50" \
    '"domainCode":"semiconductor"'

test_api "趋势详情API - AI" \
    "http://localhost:8000/api/trends/analysis?domain=ai&newsCount=50" \
    '"domainCode":"ai"'

echo ""

# 测试Next.js API代理
echo "2. Next.js API代理测试 (端口3000)"
echo "-----------------------------------"

test_api "Next.js趋势摘要API" \
    "http://localhost:3000/api/events/trends/summary?newsCount=50" \
    '"success":true'

test_api "Next.js趋势详情API" \
    "http://localhost:3000/api/events/trends/analysis?domain=semiconductor&newsCount=50" \
    '"allKeyDrivers"'

echo ""

# 测试字段完整性
echo "3. 数据字段完整性测试"
echo "-----------------------------------"

echo -n "测试: 检查allKeyDrivers字段 ... "
if curl -s "http://localhost:3000/api/events/trends/analysis?domain=semiconductor&newsCount=50" | grep -q '"allKeyDrivers"'; then
    echo -e "${GREEN}✓ 通过${NC}"
    ((PASS++))
else
    echo -e "${RED}✗ 失败${NC}"
    ((FAIL++))
fi

echo -n "测试: 检查allKeyRisks字段 ... "
if curl -s "http://localhost:3000/api/events/trends/analysis?domain=semiconductor&newsCount=50" | grep -q '"allKeyRisks"'; then
    echo -e "${GREEN}✓ 通过${NC}"
    ((PASS++))
else
    echo -e "${RED}✗ 失败${NC}"
    ((FAIL++))
fi

echo -n "测试: 检查aiInsight字段 ... "
if curl -s "http://localhost:3000/api/events/trends/analysis?domain=semiconductor&newsCount=50" | grep -q '"aiInsight"'; then
    echo -e "${GREEN}✓ 通过${NC}"
    ((PASS++))
else
    echo -e "${RED}✗ 失败${NC}"
    ((FAIL++))
fi

echo -n "测试: 检查relatedDomains字段 ... "
if curl -s "http://localhost:3000/api/events/trends/analysis?domain=semiconductor&newsCount=50" | grep -q '"relatedDomains"'; then
    echo -e "${GREEN}✓ 通过${NC}"
    ((PASS++))
else
    echo -e "${RED}✗ 失败${NC}"
    ((FAIL++))
fi

echo ""

# 测试数据一致性
echo "4. 数据一致性测试"
echo "-----------------------------------"

echo -n "测试: 半导体新闻数量一致性 ... "
api_count=$(curl -s "http://localhost:8000/api/trends/analysis?domain=semiconductor&newsCount=50" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data']['relatedNewsCount'])")
db_count=$(sqlite3 /Users/jozen.lee/ai-softwares/ai-invest/prisma/dev.db "SELECT COUNT(*) FROM NewsArticle WHERE domainIds LIKE '%semiconductor%'")

if [ "$api_count" = "$db_count" ]; then
    echo -e "${GREEN}✓ 通过${NC} (API: $api_count, DB: $db_count)"
    ((PASS++))
else
    echo -e "${RED}✗ 失败${NC} (API: $api_count, DB: $db_count)"
    ((FAIL++))
fi

echo ""

# 测试前端页面
echo "5. 前端页面测试"
echo "-----------------------------------"

test_api "趋势概览页面" \
    "http://localhost:3000/events/trends" \
    "<!DOCTYPE html>"

test_api "半导体详情页面路由" \
    "http://localhost:3000/events/trends/semiconductor" \
    "<!DOCTYPE html>"

echo ""

# 总结
echo "======================================"
echo "测试总结"
echo "======================================"
echo -e "通过: ${GREEN}$PASS${NC}"
echo -e "失败: ${RED}$FAIL${NC}"
echo ""

if [ $FAIL -eq 0 ]; then
    echo -e "${GREEN}✓ 所有测试通过！${NC}"
    exit 0
else
    echo -e "${RED}✗ 有测试失败，请检查日志${NC}"
    exit 1
fi
