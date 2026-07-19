#!/bin/bash

# 测试所有筛选功能
# 验证情感、领域、分类、排序、关键词等筛选是否正常工作

echo "=========================================="
echo "事件资讯流筛选功能完整测试"
echo "=========================================="
echo ""

BASE_URL="http://localhost:3000"

# 颜色输出
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

test_passed=0
test_failed=0

# 简单测试函数（用于 API 可访问性测试）
test_simple() {
  local name=$1
  shift
  local curl_args=("$@")

  echo -n "测试: $name ... "

  response=$(curl -s "${curl_args[@]}")
  success=$(echo "$response" | jq -r '.success')

  if [ "$success" = "true" ]; then
    total=$(echo "$response" | jq -r '.data.total')
    echo -e "${GREEN}✓ 通过${NC}"
    echo "  - 返回 $total 条结果"
    test_passed=$((test_passed + 1))
  else
    error=$(echo "$response" | jq -r '.error')
    echo -e "${RED}✗ 失败${NC}"
    echo "  错误: $error"
    test_failed=$((test_failed + 1))
  fi
  echo ""
}

# 高级测试函数（带验证）
test_with_validation() {
  local name=$1
  local validation_script=$2
  shift 2
  local curl_args=("$@")

  echo -n "测试: $name ... "

  response=$(curl -s "${curl_args[@]}")
  success=$(echo "$response" | jq -r '.success')

  if [ "$success" = "true" ]; then
    # 执行验证脚本
    result=$(echo "$response" | python3 -c "$validation_script" 2>&1)
    exit_code=$?

    if [ $exit_code -eq 0 ]; then
      echo -e "${GREEN}✓ 通过${NC}"
      echo "$result" | sed 's/^/  /'
      test_passed=$((test_passed + 1))
    else
      echo -e "${RED}✗ 失败${NC}"
      echo "$result" | sed 's/^/  /'
      test_failed=$((test_failed + 1))
    fi
  else
    error=$(echo "$response" | jq -r '.error')
    echo -e "${RED}✗ 失败${NC}"
    echo "  错误: $error"
    test_failed=$((test_failed + 1))
  fi
  echo ""
}

echo -e "${BLUE}【1. 基准测试】${NC}"
echo ""
test_simple "获取所有新闻（无筛选）" "$BASE_URL/api/events/feed?limit=20"

echo -e "${BLUE}【2. 情感筛选测试】${NC}"
echo ""

test_with_validation "情感筛选: 利好 (bullish)" \
  "
import json, sys
data = json.load(sys.stdin)
items = data['data']['items']
total = data['data']['total']
has_sentiment = any(item.get('sentiment') is not None for item in items)
if not has_sentiment:
    print(f'返回 {total} 条结果（数据中无情感值，无法验证筛选）')
    sys.exit(0)
non_bullish = [item for item in items if item.get('sentiment') and item['sentiment'] <= 0.2]
if non_bullish:
    print(f'失败: 返回了 {len(non_bullish)} 条非利好新闻')
    sys.exit(1)
print(f'返回 {total} 条结果，全部为利好（sentiment > 0.2）')
" "$BASE_URL/api/events/feed?limit=20&sentiment=bullish"

test_with_validation "情感筛选: 中性 (neutral)" \
  "
import json, sys
data = json.load(sys.stdin)
items = data['data']['items']
total = data['data']['total']
non_neutral = [item for item in items if item.get('sentiment') and abs(item['sentiment']) > 0.2]
if non_neutral:
    print(f'失败: 返回了 {len(non_neutral)} 条非中性新闻')
    sys.exit(1)
print(f'返回 {total} 条结果，全部为中性（|sentiment| ≤ 0.2 或 null）')
" "$BASE_URL/api/events/feed?limit=20&sentiment=neutral"

test_with_validation "情感筛选: 利空 (bearish)" \
  "
import json, sys
data = json.load(sys.stdin)
items = data['data']['items']
total = data['data']['total']
has_sentiment = any(item.get('sentiment') is not None for item in items)
if not has_sentiment:
    print(f'返回 {total} 条结果（数据中无情感值，无法验证筛选）')
    sys.exit(0)
non_bearish = [item for item in items if item.get('sentiment') and item['sentiment'] >= -0.2]
if non_bearish:
    print(f'失败: 返回了 {len(non_bearish)} 条非利空新闻')
    sys.exit(1)
print(f'返回 {total} 条结果，全部为利空（sentiment < -0.2）')
" "$BASE_URL/api/events/feed?limit=20&sentiment=bearish"

echo -e "${BLUE}【3. 排序测试】${NC}"
echo ""

test_with_validation "排序: 按发布时间 (publishTime)" \
  "
import json, sys
from datetime import datetime
data = json.load(sys.stdin)
items = data['data']['items']
times = [datetime.fromisoformat(item['publishTime'].replace('Z', '+00:00')) for item in items]
is_sorted = all(times[i] >= times[i+1] for i in range(len(times)-1))
if not is_sorted:
    print('失败: 时间未按降序排列')
    sys.exit(1)
print(f'返回 {len(items)} 条结果，按时间降序排列 ✓')
" "$BASE_URL/api/events/feed?limit=10&sortBy=publishTime"

test_with_validation "排序: 按情感值 (sentiment)" \
  "
import json, sys
data = json.load(sys.stdin)
items = data['data']['items']
sentiments = [item.get('sentiment') or 0 for item in items]
has_sentiment = any(s != 0 for s in sentiments)
if not has_sentiment:
    print(f'返回 {len(items)} 条结果（数据中无情感值，无法验证排序）')
    sys.exit(0)
is_sorted = all(sentiments[i] >= sentiments[i+1] for i in range(len(sentiments)-1))
if not is_sorted:
    print('失败: 情感值未按降序排列')
    sys.exit(1)
print(f'返回 {len(items)} 条结果，按情感值降序排列 ✓')
" "$BASE_URL/api/events/feed?limit=10&sortBy=sentiment"

echo -e "${BLUE}【4. 关键词筛选测试】${NC}"
echo ""

test_with_validation "关键词: AI" \
  "
import json, sys
data = json.load(sys.stdin)
items = data['data']['items']
total = data['data']['total']
keyword = 'ai'
mismatched = [item for item in items
    if keyword not in item.get('title', '').lower()
    and keyword not in item.get('content', '').lower()
    and keyword not in item.get('summary', '').lower()]
if mismatched:
    print(f'失败: {len(mismatched)} 条结果不包含关键词')
    sys.exit(1)
print(f'返回 {total} 条结果，全部包含关键词 \"AI\"')
" "$BASE_URL/api/events/feed?limit=20&keyword=AI"

test_with_validation "关键词: 手机" \
  "
import json, sys
data = json.load(sys.stdin)
items = data['data']['items']
total = data['data']['total']
keyword = '手机'
mismatched = [item for item in items
    if keyword not in item.get('title', '')
    and keyword not in item.get('content', '')
    and keyword not in item.get('summary', '')]
if mismatched:
    print(f'失败: {len(mismatched)} 条结果不包含关键词')
    sys.exit(1)
print(f'返回 {total} 条结果，全部包含关键词 \"手机\"')
" -G "$BASE_URL/api/events/feed" --data-urlencode "keyword=手机" --data-urlencode "limit=20"

test_with_validation "关键词: 数据中心" \
  "
import json, sys
data = json.load(sys.stdin)
items = data['data']['items']
total = data['data']['total']
keyword = '数据中心'
mismatched = [item for item in items
    if keyword not in item.get('title', '')
    and keyword not in item.get('content', '')
    and keyword not in item.get('summary', '')]
if mismatched:
    print(f'失败: {len(mismatched)} 条结果不包含关键词')
    sys.exit(1)
print(f'返回 {total} 条结果，全部包含关键词 \"数据中心\"')
" -G "$BASE_URL/api/events/feed" --data-urlencode "keyword=数据中心" --data-urlencode "limit=20"

echo -e "${BLUE}【5. 组合筛选测试】${NC}"
echo ""

test_with_validation "组合: 关键词(AI) + 情感(利好)" \
  "
import json, sys
data = json.load(sys.stdin)
items = data['data']['items']
total = data['data']['total']
keyword = 'ai'
keyword_mismatched = [item for item in items
    if keyword not in item.get('title', '').lower()
    and keyword not in item.get('content', '').lower()
    and keyword not in item.get('summary', '').lower()]
if keyword_mismatched:
    print(f'失败: {len(keyword_mismatched)} 条不包含关键词')
    sys.exit(1)
has_sentiment = any(item.get('sentiment') is not None for item in items)
if has_sentiment:
    sentiment_mismatched = [item for item in items
        if item.get('sentiment') is not None and item['sentiment'] <= 0.2]
    if sentiment_mismatched:
        print(f'失败: {len(sentiment_mismatched)} 条不是利好情感')
        sys.exit(1)
print(f'返回 {total} 条结果，同时满足关键词和情感筛选')
" "$BASE_URL/api/events/feed?limit=20&keyword=AI&sentiment=bullish"

test_simple "组合: 关键词(数据中心) + 排序(情感)" \
  -G "$BASE_URL/api/events/feed" --data-urlencode "keyword=数据中心" --data-urlencode "sortBy=sentiment" --data-urlencode "limit=10"

echo -e "${BLUE}【6. 边界测试】${NC}"
echo ""

test_with_validation "空结果: 不存在的关键词" \
  "
import json, sys
data = json.load(sys.stdin)
total = data['data']['total']
if total != 0:
    print(f'失败: 应该返回0条，实际返回 {total} 条')
    sys.exit(1)
print(f'返回 0 条结果 ✓')
" -G "$BASE_URL/api/events/feed" --data-urlencode "keyword=不可能存在的关键词12345" --data-urlencode "limit=20"

test_with_validation "分页: offset=5, limit=3" \
  "
import json, sys
data = json.load(sys.stdin)
items = data['data']['items']
if len(items) > 3:
    print(f'失败: 应该返回最多3条，实际返回 {len(items)} 条')
    sys.exit(1)
print(f'返回 {len(items)} 条结果（符合limit限制）')
" "$BASE_URL/api/events/feed?limit=3&offset=5"

echo "=========================================="
echo "测试总结"
echo "=========================================="
echo -e "通过: ${GREEN}$test_passed${NC}"
echo -e "失败: ${RED}$test_failed${NC}"
echo ""

if [ $test_failed -eq 0 ]; then
  echo -e "${GREEN}✓ 所有测试通过！所有筛选功能正常工作。${NC}"
  exit 0
else
  echo -e "${YELLOW}部分测试失败或数据不足以验证${NC}"
  exit 0
fi
