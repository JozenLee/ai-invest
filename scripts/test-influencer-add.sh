#!/bin/bash

echo "=== 测试大V添加流程 ==="
echo ""

echo "1. 测试验证接口..."
VALIDATE_RESPONSE=$(curl -s -X POST http://localhost:8000/api/influencers/validate \
  -H "Content-Type: application/json" \
  -d '{"platform": "bilibili", "accountId": "21262795"}')

echo "$VALIDATE_RESPONSE" | python3 -m json.tool
echo ""

# 检查是否成功
if echo "$VALIDATE_RESPONSE" | grep -q '"success":true'; then
  echo "✓ 验证成功"

  # 提取用户信息
  NAME=$(echo "$VALIDATE_RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin)['data']['name'])")
  AVATAR=$(echo "$VALIDATE_RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin)['data']['avatarUrl'])")

  echo "  用户名: $NAME"
  echo "  头像: $AVATAR"
  echo ""

  echo "2. 测试创建大V..."
  CREATE_PAYLOAD=$(cat <<EOF
{
  "name": "$NAME",
  "platform": "bilibili",
  "accountId": "21262795",
  "profileUrl": "https://space.bilibili.com/21262795",
  "avatarUrl": "$AVATAR",
  "category": "未分类",
  "tags": ["测试"],
  "priority": "medium",
  "scheduleType": "polling",
  "fetchInterval": 60,
  "dailyFetchTimes": null,
  "dataRetentionDays": 30,
  "driverType": "api",
  "isActive": true
}
EOF
)

  CREATE_RESPONSE=$(curl -s -X POST http://localhost:8000/api/influencers \
    -H "Content-Type: application/json" \
    -d "$CREATE_PAYLOAD")

  echo "$CREATE_RESPONSE" | python3 -m json.tool
  echo ""

  if echo "$CREATE_RESPONSE" | grep -q '"id"'; then
    echo "✓ 创建成功"
    INFLUENCER_ID=$(echo "$CREATE_RESPONSE" | python3 -c "import sys, json; print(json.load(sys.stdin)['id'])")
    echo "  大V ID: $INFLUENCER_ID"
    echo ""
    echo "访问详情页: http://localhost:3000/events/influencers/$INFLUENCER_ID"
  else
    echo "✗ 创建失败"
    if echo "$CREATE_RESPONSE" | grep -q "already exists"; then
      echo "  原因: 该大V已存在"
    fi
  fi
else
  echo "✗ 验证失败"
  echo "$VALIDATE_RESPONSE"
fi
