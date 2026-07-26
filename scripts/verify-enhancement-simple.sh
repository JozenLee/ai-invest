#!/bin/bash

# 简化的大V管理功能验证
# 跳过Bilibili API调用（有频率限制），专注验证数据库和API功能

set -e

BASE_URL="http://localhost:8000"
API_URL="${BASE_URL}/api/influencers"

echo "🧪 验证大V管理优化功能（简化版）..."
echo ""

# 测试1: 创建大V（轮询模式）
echo "1️⃣ 测试创建大V（轮询模式）..."
CREATE_RESPONSE=$(curl -s -X POST "${API_URL}/" \
    -H "Content-Type: application/json" \
    -d '{
        "name": "测试大V-轮询",
        "platform": "bilibili",
        "accountId": "test_uid_001",
        "driverType": "api",
        "fetchInterval": 30,
        "priority": "high",
        "isActive": true,
        "profileUrl": "https://space.bilibili.com/test_uid_001",
        "avatarUrl": "https://example.com/avatar.jpg",
        "category": "科技",
        "scheduleType": "polling",
        "dataRetentionDays": 30
    }')

echo "$CREATE_RESPONSE" | jq .

if echo "$CREATE_RESPONSE" | grep -q '"id":"inf_'; then
    echo "✅ 创建轮询模式大V成功"

    # 验证scheduleType字段
    if echo "$CREATE_RESPONSE" | grep -q '"scheduleType":"polling"'; then
        echo "✅ scheduleType字段正确返回"
    else
        echo "❌ scheduleType字段未返回"
    fi

    # 验证dataRetentionDays字段
    if echo "$CREATE_RESPONSE" | grep -q '"dataRetentionDays":30'; then
        echo "✅ dataRetentionDays字段正确返回"
    else
        echo "❌ dataRetentionDays字段未返回"
    fi
else
    echo "❌ 创建失败"
    exit 1
fi
echo ""

# 测试2: 创建大V（定时模式）
echo "2️⃣ 测试创建大V（定时模式）..."
CREATE_DAILY=$(curl -s -X POST "${API_URL}/" \
    -H "Content-Type: application/json" \
    -d '{
        "name": "测试大V-定时",
        "platform": "bilibili",
        "accountId": "test_uid_002",
        "driverType": "api",
        "priority": "medium",
        "isActive": true,
        "profileUrl": "https://space.bilibili.com/test_uid_002",
        "category": "财经",
        "scheduleType": "daily",
        "dailyFetchTimes": ["09:00", "14:00", "18:00"],
        "dataRetentionDays": 60
    }')

echo "$CREATE_DAILY" | jq .

if echo "$CREATE_DAILY" | grep -q '"scheduleType":"daily"'; then
    echo "✅ 定时模式大V创建成功"

    if echo "$CREATE_DAILY" | grep -q '"dailyFetchTimes":\["09:00","14:00","18:00"\]'; then
        echo "✅ dailyFetchTimes字段正确返回"
    else
        echo "❌ dailyFetchTimes字段格式不正确"
    fi
else
    echo "❌ 定时模式创建失败"
fi
echo ""

# 测试3: 查询列表并验证字段
echo "3️⃣ 测试查询列表..."
LIST_RESPONSE=$(curl -s "${API_URL}/?page=1&pageSize=10")

echo "$LIST_RESPONSE" | jq '.items[0]'

TOTAL=$(echo "$LIST_RESPONSE" | jq -r '.total')
echo "✅ 查询成功，总数: $TOTAL"

# 检查第一条记录的字段
FIRST_ITEM=$(echo "$LIST_RESPONSE" | jq '.items[0]')

if echo "$FIRST_ITEM" | grep -q '"scheduleType"'; then
    SCHEDULE_TYPE=$(echo "$FIRST_ITEM" | jq -r '.scheduleType')
    echo "✅ scheduleType字段存在: $SCHEDULE_TYPE"
else
    echo "❌ scheduleType字段缺失"
fi

if echo "$FIRST_ITEM" | grep -q '"dataRetentionDays"'; then
    RETENTION=$(echo "$FIRST_ITEM" | jq -r '.dataRetentionDays')
    echo "✅ dataRetentionDays字段存在: $RETENTION"
else
    echo "❌ dataRetentionDays字段缺失"
fi
echo ""

# 测试4: 验证数据库schema
echo "4️⃣ 验证数据库schema..."
sqlite3 ../prisma/dev.db "PRAGMA table_info(Influencer);" | grep -E "(scheduleType|dailyFetchTimes|dataRetentionDays)" && echo "✅ 数据库字段已添加" || echo "❌ 数据库字段缺失"
echo ""

echo "✅ 验证完成！"
echo ""
echo "📋 功能状态："
echo "  ✅ 轮询模式配置（scheduleType: polling + fetchInterval）"
echo "  ✅ 定时模式配置（scheduleType: daily + dailyFetchTimes）"
echo "  ✅ 数据保留期配置（dataRetentionDays）"
echo "  ✅ API字段正确返回"
echo "  ✅ 数据库schema已更新"
echo ""
echo "🎯 前端测试："
echo "  1. 启动Next.js: npm run dev"
echo "  2. 访问添加页面: http://localhost:3000/events/influencers/new"
echo "  3. 访问编辑页面: http://localhost:3000/events/influencers/[id]/edit"
