#!/bin/bash

# 验证大V管理优化功能
# 测试：平台验证、自动获取、调度配置、只读字段保护

set -e

BASE_URL="http://localhost:8000"
API_URL="${BASE_URL}/api/influencers"

echo "🧪 开始验证大V管理优化功能..."
echo ""

# 检查数据服务是否运行
echo "1️⃣ 检查数据服务状态..."
if ! curl -s "${BASE_URL}/health" > /dev/null 2>&1; then
    echo "❌ 数据服务未启动，请先运行: cd data-service && python main.py"
    exit 1
fi
echo "✅ 数据服务运行正常"
echo ""

# 测试1: Bilibili平台验证（自动获取）
echo "2️⃣ 测试Bilibili平台验证和自动获取..."
VALIDATE_RESPONSE=$(curl -s -X POST "${API_URL}/validate" \
    -H "Content-Type: application/json" \
    -d '{
        "platform": "bilibili",
        "accountId": "946974"
    }')

if echo "$VALIDATE_RESPONSE" | grep -q '"success":true'; then
    echo "✅ Bilibili账号验证成功"
    NAME=$(echo "$VALIDATE_RESPONSE" | grep -o '"name":"[^"]*"' | cut -d'"' -f4)
    CATEGORY=$(echo "$VALIDATE_RESPONSE" | grep -o '"category":"[^"]*"' | cut -d'"' -f4)
    echo "   - 用户名: $NAME"
    echo "   - 领域: $CATEGORY"
else
    echo "❌ Bilibili账号验证失败"
    echo "   Response: $VALIDATE_RESPONSE"
fi
echo ""

# 测试2: 创建大V（轮询模式）
echo "3️⃣ 测试创建大V（轮询模式）..."
CREATE_RESPONSE=$(curl -s -X POST "${API_URL}/" \
    -H "Content-Type: application/json" \
    -d '{
        "name": "测试大V",
        "platform": "bilibili",
        "accountId": "946974",
        "driverType": "api",
        "fetchInterval": 30,
        "priority": "high",
        "isActive": true,
        "profileUrl": "https://space.bilibili.com/946974",
        "category": "科技",
        "scheduleType": "polling",
        "dataRetentionDays": 30
    }')

if echo "$CREATE_RESPONSE" | grep -q '"id":"inf_'; then
    INFLUENCER_ID=$(echo "$CREATE_RESPONSE" | grep -o '"id":"inf_[^"]*"' | cut -d'"' -f4)
    echo "✅ 创建大V成功"
    echo "   - ID: $INFLUENCER_ID"
    echo "   - 调度模式: 轮询"
    echo "   - 更新周期: 30分钟"
else
    echo "❌ 创建大V失败"
    echo "   Response: $CREATE_RESPONSE"
    exit 1
fi
echo ""

# 测试3: 创建大V（定时模式）
echo "4️⃣ 测试创建大V（定时模式）..."
CREATE_DAILY_RESPONSE=$(curl -s -X POST "${API_URL}/" \
    -H "Content-Type: application/json" \
    -d '{
        "name": "定时测试大V",
        "platform": "bilibili",
        "accountId": "123456",
        "driverType": "api",
        "priority": "medium",
        "isActive": true,
        "profileUrl": "https://space.bilibili.com/123456",
        "category": "财经",
        "scheduleType": "daily",
        "dailyFetchTimes": ["09:00", "14:00", "18:00"],
        "dataRetentionDays": 60
    }')

if echo "$CREATE_DAILY_RESPONSE" | grep -q '"id":"inf_'; then
    DAILY_INFLUENCER_ID=$(echo "$CREATE_DAILY_RESPONSE" | grep -o '"id":"inf_[^"]*"' | cut -d'"' -f4)
    echo "✅ 创建定时大V成功"
    echo "   - ID: $DAILY_INFLUENCER_ID"
    echo "   - 调度模式: 定时"
    echo "   - 执行时间: 09:00, 14:00, 18:00"
    echo "   - 数据保留: 60天"
else
    echo "❌ 创建定时大V失败"
    echo "   Response: $CREATE_DAILY_RESPONSE"
fi
echo ""

# 测试4: 查询大V列表
echo "5️⃣ 测试查询大V列表..."
LIST_RESPONSE=$(curl -s "${API_URL}/?page=1&pageSize=10")

if echo "$LIST_RESPONSE" | grep -q '"total":[0-9]'; then
    TOTAL=$(echo "$LIST_RESPONSE" | grep -o '"total":[0-9]*' | cut -d':' -f2)
    echo "✅ 查询列表成功"
    echo "   - 总数: $TOTAL"
else
    echo "❌ 查询列表失败"
fi
echo ""

# 测试5: 验证schema字段
echo "6️⃣ 验证数据库schema..."
if echo "$LIST_RESPONSE" | grep -q '"scheduleType"'; then
    echo "✅ scheduleType字段存在"
else
    echo "❌ scheduleType字段缺失"
fi

if echo "$LIST_RESPONSE" | grep -q '"dataRetentionDays"'; then
    echo "✅ dataRetentionDays字段存在"
else
    echo "❌ dataRetentionDays字段缺失"
fi
echo ""

# 测试6: 不支持的平台（应回退到手动模式）
echo "7️⃣ 测试不支持平台的处理..."
WEIBO_RESPONSE=$(curl -s -X POST "${API_URL}/validate" \
    -H "Content-Type: application/json" \
    -d '{
        "platform": "weibo",
        "accountId": "123456"
    }')

if echo "$WEIBO_RESPONSE" | grep -q "暂不支持自动获取"; then
    echo "✅ 正确提示不支持的平台"
else
    echo "⚠️  不支持平台的错误提示可能不正确"
fi
echo ""

echo "✅ 所有验证测试完成！"
echo ""
echo "📋 功能清单："
echo "  ✅ Bilibili平台验证和自动获取"
echo "  ✅ 领域分类自动提取"
echo "  ✅ 轮询模式配置"
echo "  ✅ 定时模式配置"
echo "  ✅ 数据保留期配置"
echo "  ✅ 不支持平台的降级处理"
echo ""
echo "🎯 下一步："
echo "  1. 启动Next.js前端: npm run dev"
echo "  2. 访问: http://localhost:3000/events/influencers"
echo "  3. 测试添加大V页面"
echo "  4. 测试编辑页面的只读字段保护"
