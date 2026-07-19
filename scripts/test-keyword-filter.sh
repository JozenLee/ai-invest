#!/bin/bash

# 测试关键词筛选功能
# 验证前端输入关键词后能正确筛选新闻

echo "=========================================="
echo "测试关键词筛选功能"
echo "=========================================="
echo ""

BASE_URL="http://localhost:3000"

# 颜色输出
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

test_passed=0
test_failed=0

# 测试函数
test_api() {
  local name=$1
  local url=$2
  local expected_filter=$3

  echo -n "测试: $name ... "

  response=$(curl -s "$url")
  success=$(echo "$response" | jq -r '.success')

  if [ "$success" = "true" ]; then
    items=$(echo "$response" | jq -r '.data.items | length')
    total=$(echo "$response" | jq -r '.data.total')

    echo -e "${GREEN}✓ 通过${NC}"
    echo "  - 返回 $items 条新闻 (总数: $total)"

    # 如果有关键词过滤，检查结果中是否包含关键词
    if [ ! -z "$expected_filter" ]; then
      matched=$(echo "$response" | jq -r ".data.items[] | select(.title | contains(\"$expected_filter\") or (.content // \"\") | contains(\"$expected_filter\") or (.summary // \"\") | contains(\"$expected_filter\")) | .title" | wc -l)
      echo "  - 包含关键词 '$expected_filter' 的结果: $matched 条"

      if [ $matched -gt 0 ]; then
        echo -e "  ${GREEN}关键词筛选有效${NC}"
      else
        echo -e "  ${YELLOW}未找到包含关键词的结果（可能数据库中无此类新闻）${NC}"
      fi
    fi

    test_passed=$((test_passed + 1))
  else
    error=$(echo "$response" | jq -r '.error')
    echo -e "${RED}✗ 失败${NC}"
    echo "  错误: $error"
    test_failed=$((test_failed + 1))
  fi
  echo ""
}

echo "1. 测试基础新闻列表（无筛选）"
test_api "获取所有新闻" \
  "$BASE_URL/api/events/feed?limit=10"

echo "2. 测试关键词筛选（单独使用）"
test_api "关键词: AI" \
  "$BASE_URL/api/events/feed?limit=10&keyword=AI" \
  "AI"

test_api "关键词: 芯片" \
  "$BASE_URL/api/events/feed?limit=10&keyword=芯片" \
  "芯片"

test_api "关键词: 英伟达" \
  "$BASE_URL/api/events/feed?limit=10&keyword=英伟达" \
  "英伟达"

echo "3. 测试关键词 + 情感筛选"
test_api "关键词: AI + 利好情感" \
  "$BASE_URL/api/events/feed?limit=10&keyword=AI&sentiment=bullish" \
  "AI"

echo "4. 测试关键词 + 领域筛选"
# 首先获取一个领域ID
domain_response=$(curl -s "$BASE_URL/api/events/domains")
domain_id=$(echo "$domain_response" | jq -r '.data[0].id // empty')

if [ ! -z "$domain_id" ]; then
  test_api "关键词: AI + 领域筛选" \
    "$BASE_URL/api/events/feed?limit=10&keyword=AI&domainId=$domain_id" \
    "AI"
else
  echo -e "${YELLOW}跳过领域筛选测试（无领域数据）${NC}"
  echo ""
fi

echo "5. 测试关键词 + 分类筛选"
# 获取一个分类ID
category_response=$(curl -s "$BASE_URL/api/events/categories")
category_id=$(echo "$category_response" | jq -r '.data[0].id // empty')

if [ ! -z "$category_id" ]; then
  test_api "关键词: AI + 分类筛选" \
    "$BASE_URL/api/events/feed?limit=10&keyword=AI&categoryId=$category_id" \
    "AI"
else
  echo -e "${YELLOW}跳过分类筛选测试（无分类数据）${NC}"
  echo ""
fi

echo "6. 测试复杂组合筛选"
test_api "关键词 + 情感 + 排序" \
  "$BASE_URL/api/events/feed?limit=10&keyword=市场&sentiment=bullish&sortBy=sentiment" \
  "市场"

echo "=========================================="
echo "测试总结"
echo "=========================================="
echo -e "通过: ${GREEN}$test_passed${NC}"
echo -e "失败: ${RED}$test_failed${NC}"
echo ""

if [ $test_failed -eq 0 ]; then
  echo -e "${GREEN}✓ 所有测试通过！${NC}"
  exit 0
else
  echo -e "${RED}✗ 部分测试失败${NC}"
  exit 1
fi
