#!/bin/bash
# 测试添加大V脚本

echo "=== 测试添加大V功能 ==="
echo ""

# 1. 添加微博大V - 天津股侠
echo "1. 添加微博大V: 天津股侠"
WEIBO_RESULT=$(curl -s -X POST http://localhost:8000/api/influencers/ \
  -H "Content-Type: application/json" \
  -d '{
    "name": "天津股侠",
    "platform": "weibo",
    "account_id": "1642909335",
    "profile_url": "https://weibo.com/u/1642909335",
    "category": "投资",
    "tags": ["股票", "投资", "财经"]
  }')

echo "$WEIBO_RESULT" | python3 -m json.tool
WEIBO_ID=$(echo "$WEIBO_RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "✓ 微博大V ID: $WEIBO_ID"
echo ""

# 2. 添加B站大V - 二狗学长好
echo "2. 添加B站大V: 二狗学长好"
BILI_RESULT=$(curl -s -X POST http://localhost:8000/api/influencers/ \
  -H "Content-Type: application/json" \
  -d '{
    "name": "二狗学长好",
    "platform": "bilibili",
    "account_id": "393056819",
    "profile_url": "https://space.bilibili.com/393056819",
    "category": "科技",
    "tags": ["科技", "数码", "测评"]
  }')

echo "$BILI_RESULT" | python3 -m json.tool
BILI_ID=$(echo "$BILI_RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "✓ B站大V ID: $BILI_ID"
echo ""

# 3. 验证大V列表
echo "3. 验证已添加的大V"
curl -s http://localhost:8000/api/influencers/ | python3 -c "
import sys, json
data = json.load(sys.stdin)
print(f'共有 {len(data)} 个大V:')
for item in data:
    if item['name'] in ['天津股侠', '二狗学长好']:
        print(f\"  ✓ [{item['platform']}] {item['name']} - ID: {item['id']}\")
"
echo ""

# 4. 触发动态抓取
echo "4. 触发动态抓取测试"
echo "  抓取微博大V..."
curl -s -X POST "http://localhost:8000/api/influencers/${WEIBO_ID}/fetch" | python3 -m json.tool | head -10
echo ""

echo "  抓取B站大V..."
curl -s -X POST "http://localhost:8000/api/influencers/${BILI_ID}/fetch" | python3 -m json.tool | head -10
echo ""

echo "=== 测试完成 ==="
