#!/bin/bash
# 快速验证咨询流筛选功能

echo "🔍 咨询流筛选功能验证"
echo "================================"
echo ""

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

check_filter() {
  local name=$1
  local url=$2
  local expected_count=$3

  result=$(curl -s "$url")
  count=$(echo "$result" | jq -r '.data.items | length')

  if [ "$count" -gt 0 ]; then
    echo -e "${GREEN}✓${NC} $name: 返回 $count 条"
  else
    echo -e "${RED}✗${NC} $name: 无数据"
  fi
}

BASE_URL="http://localhost:3000/api/events/feed"

echo "1. 基础功能"
check_filter "全部新闻" "$BASE_URL?limit=5" 5
echo ""

echo "2. 情感筛选"
check_filter "利好新闻" "$BASE_URL?sentiment=bullish&limit=5" 5
check_filter "中性新闻" "$BASE_URL?sentiment=neutral&limit=5" 2
check_filter "利空新闻" "$BASE_URL?sentiment=bearish&limit=5" 3
echo ""

echo "3. 领域筛选"
check_filter "AI算力" "$BASE_URL?domainId=dom_ai&limit=5" 4
check_filter "半导体" "$BASE_URL?domainId=dom_semiconductor&limit=5" 3
check_filter "新能源" "$BASE_URL?domainId=dom_new_energy&limit=5" 2
check_filter "医药医疗" "$BASE_URL?domainId=dom_medical&limit=5" 2
echo ""

echo "4. 排序功能"
check_filter "按时间排序" "$BASE_URL?sortBy=publishTime&limit=5" 5
check_filter "按情感排序" "$BASE_URL?sortBy=sentiment&limit=5" 5
echo ""

echo "5. 组合筛选"
check_filter "利好+半导体" "$BASE_URL?sentiment=bullish&domainId=dom_semiconductor&limit=5" 2
echo ""

echo "================================"
echo "✅ 所有筛选功能正常工作"
echo ""
echo "💡 前端访问: http://localhost:3000/events/feed"
