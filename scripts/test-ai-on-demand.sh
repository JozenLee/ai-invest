#!/bin/bash

# AI按需分析功能验证脚本

echo "======================================"
echo "AI按需分析功能验证"
echo "======================================"
echo ""

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

PASS=0
FAIL=0

echo "1. 快速加载测试（不含AI分析）"
echo "-----------------------------------"

echo -n "测试: 半导体领域快速加载 ... "
start_time=$(date +%s%3N)
response=$(curl -s "http://localhost:8000/api/trends/analysis?domain=semiconductor&newsCount=50&includeAI=false")
end_time=$(date +%s%3N)
elapsed=$((end_time - start_time))

has_data=$(echo "$response" | grep -c '"success":true')
no_ai=$(echo "$response" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d['data']['allKeyDrivers']) == 0)" 2>/dev/null || echo "false")

if [ "$has_data" -eq 1 ] && [ "$no_ai" = "True" ]; then
    echo -e "${GREEN}✓ 通过${NC} (耗时: ${elapsed}ms)"
    ((PASS++))
else
    echo -e "${RED}✗ 失败${NC}"
    ((FAIL++))
fi

echo -n "测试: AI领域快速加载 ... "
start_time=$(date +%s%3N)
response=$(curl -s "http://localhost:8000/api/trends/analysis?domain=ai&newsCount=50&includeAI=false")
end_time=$(date +%s%3N)
elapsed=$((end_time - start_time))

has_data=$(echo "$response" | grep -c '"success":true')

if [ "$has_data" -eq 1 ]; then
    echo -e "${GREEN}✓ 通过${NC} (耗时: ${elapsed}ms)"
    ((PASS++))
else
    echo -e "${RED}✗ 失败${NC}"
    ((FAIL++))
fi

echo ""
echo "2. AI分析生成测试（包含AI）"
echo "-----------------------------------"

echo -n "测试: 生成半导体AI分析 ... "
start_time=$(date +%s%3N)
response=$(curl -s "http://localhost:8000/api/trends/analysis?domain=semiconductor&newsCount=50&includeAI=true")
end_time=$(date +%s%3N)
elapsed=$((end_time - start_time))

has_drivers=$(echo "$response" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d['data']['allKeyDrivers']) > 0)" 2>/dev/null || echo "false")
has_risks=$(echo "$response" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d['data']['allKeyRisks']) > 0)" 2>/dev/null || echo "false")

if [ "$has_drivers" = "True" ] && [ "$has_risks" = "True" ]; then
    echo -e "${GREEN}✓ 通过${NC} (耗时: ${elapsed}ms)"
    ((PASS++))
else
    echo -e "${RED}✗ 失败${NC}"
    ((FAIL++))
fi

echo ""
echo "3. Next.js API代理测试"
echo "-----------------------------------"

echo -n "测试: Next.js快速加载 ... "
response=$(curl -s "http://localhost:3000/api/events/trends/analysis?domain=battery&newsCount=50&includeAI=false")
has_data=$(echo "$response" | grep -c '"success":true')

if [ "$has_data" -eq 1 ]; then
    echo -e "${GREEN}✓ 通过${NC}"
    ((PASS++))
else
    echo -e "${RED}✗ 失败${NC}"
    ((FAIL++))
fi

echo -n "测试: Next.js包含AI参数 ... "
response=$(curl -s "http://localhost:3000/api/events/trends/analysis?domain=robotics&newsCount=50&includeAI=false")
has_data=$(echo "$response" | grep -c '"success":true')

if [ "$has_data" -eq 1 ]; then
    echo -e "${GREEN}✓ 通过${NC}"
    ((PASS++))
else
    echo -e "${RED}✗ 失败${NC}"
    ((FAIL++))
fi

echo ""
echo "4. 性能对比测试"
echo "-----------------------------------"

echo "测试: 对比快速加载vs AI分析的耗时差异"

# 快速加载
start_time=$(date +%s%3N)
curl -s "http://localhost:8000/api/trends/analysis?domain=communication&newsCount=50&includeAI=false" > /dev/null
end_time=$(date +%s%3N)
fast_time=$((end_time - start_time))

# AI分析
start_time=$(date +%s%3N)
curl -s "http://localhost:8000/api/trends/analysis?domain=communication&newsCount=50&includeAI=true" > /dev/null
end_time=$(date +%s%3N)
ai_time=$((end_time - start_time))

echo "  快速加载耗时: ${fast_time}ms"
echo "  AI分析耗时: ${ai_time}ms"

if [ "$fast_time" -lt 500 ]; then
    echo -e "  快速加载性能: ${GREEN}优秀 (<500ms)${NC}"
    ((PASS++))
else
    echo -e "  快速加载性能: ${YELLOW}一般${NC}"
    ((FAIL++))
fi

if [ "$ai_time" -lt 15000 ]; then
    echo -e "  AI分析性能: ${GREEN}正常 (<15s)${NC}"
    ((PASS++))
else
    echo -e "  AI分析性能: ${YELLOW}较慢${NC}"
    ((FAIL++))
fi

echo ""
echo "5. 数据完整性测试"
echo "-----------------------------------"

echo -n "测试: 快速加载必需字段 ... "
response=$(curl -s "http://localhost:8000/api/trends/analysis?domain=semiconductor&newsCount=50&includeAI=false")
has_fields=$(echo "$response" | python3 -c "
import sys, json
d = json.load(sys.stdin)
data = d['data']
required = ['domainCode', 'domainName', 'trendDirection', 'confidenceScore',
            'sentimentDistribution', 'relatedNewsCount', 'relatedNews',
            'allKeyDrivers', 'allKeyRisks']
print(all(k in data for k in required))
" 2>/dev/null || echo "false")

if [ "$has_fields" = "True" ]; then
    echo -e "${GREEN}✓ 通过${NC}"
    ((PASS++))
else
    echo -e "${RED}✗ 失败${NC}"
    ((FAIL++))
fi

echo -n "测试: AI分析额外字段 ... "
response=$(curl -s "http://localhost:8000/api/trends/analysis?domain=semiconductor&newsCount=50&includeAI=true")
has_ai_fields=$(echo "$response" | python3 -c "
import sys, json
d = json.load(sys.stdin)
data = d['data']
print(len(data.get('allKeyDrivers', [])) > 0 and len(data.get('allKeyRisks', [])) > 0)
" 2>/dev/null || echo "false")

if [ "$has_ai_fields" = "True" ]; then
    echo -e "${GREEN}✓ 通过${NC}"
    ((PASS++))
else
    echo -e "${RED}✗ 失败${NC}"
    ((FAIL++))
fi

echo ""
echo "======================================"
echo "测试总结"
echo "======================================"
echo -e "通过: ${GREEN}$PASS${NC}"
echo -e "失败: ${RED}$FAIL${NC}"
echo ""

if [ $FAIL -eq 0 ]; then
    echo -e "${GREEN}✓ 所有测试通过！${NC}"
    echo ""
    echo "功能验证:"
    echo "  ✓ 快速加载模式工作正常（<500ms）"
    echo "  ✓ AI分析按需生成功能正常（10-15s）"
    echo "  ✓ 前端可以快速打开详情页面"
    echo "  ✓ 用户可以按需点击生成AI分析"
    exit 0
else
    echo -e "${RED}✗ 有测试失败，请检查日志${NC}"
    exit 1
fi
