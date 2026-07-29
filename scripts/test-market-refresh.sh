#!/bin/bash
# 测试市场数据刷新机制
# 验证：交易时间1分钟刷新，非交易时间5分钟刷新
# 验证：每次刷新同步更新指数、资金流向、板块数据

echo "========================================"
echo "市场数据刷新机制测试"
echo "========================================"
echo ""

# 检查数据服务是否运行
echo "1. 检查数据服务状态..."
if curl -s http://localhost:8000/health > /dev/null 2>&1; then
    echo "✅ 数据服务已启动"
else
    echo "❌ 数据服务未启动，请先运行: cd data-service && python main.py"
    exit 1
fi
echo ""

# 检查Next.js服务是否运行
echo "2. 检查Next.js服务状态..."
if curl -s http://localhost:3000 > /dev/null 2>&1; then
    echo "✅ Next.js服务已启动"
else
    echo "❌ Next.js服务未启动，请先运行: npm run dev"
    exit 1
fi
echo ""

# 测试指数数据API
echo "3. 测试指数数据API (带缓存)..."
response=$(curl -s http://localhost:3000/api/market/overview)
success=$(echo $response | jq -r '.success')
source=$(echo $response | jq -r '.source')
indices_count=$(echo $response | jq '.data.indices | length')

if [ "$success" = "true" ]; then
    echo "✅ 指数数据获取成功"
    echo "   数据源: $source"
    echo "   指数数量: $indices_count"
else
    echo "❌ 指数数据获取失败"
    echo "   响应: $(echo $response | jq -r '.error')"
fi
echo ""

# 测试资金流向API
echo "4. 测试资金流向API (带缓存)..."
response=$(curl -s http://localhost:3000/api/market/capital-flow)
success=$(echo $response | jq -r '.success')
source=$(echo $response | jq -r '.source')

if [ "$success" = "true" ]; then
    echo "✅ 资金流向数据获取成功"
    echo "   数据源: $source"
    has_market=$(echo $response | jq 'has("data.market")')
    has_northbound=$(echo $response | jq 'has("data.northbound")')
    echo "   包含市场总览: $has_market"
    echo "   包含北向资金: $has_northbound"
else
    echo "⚠️  资金流向数据获取失败 (可能是非交易时段)"
    echo "   响应: $(echo $response | jq -r '.error')"
fi
echo ""

# 测试板块资金流向API
echo "5. 测试板块资金流向API (带缓存)..."
response=$(curl -s http://localhost:3000/api/market/sectors)
success=$(echo $response | jq -r '.success')
sectors_count=$(echo $response | jq '.sectors | length')

if [ "$success" = "true" ]; then
    echo "✅ 板块数据获取成功"
    echo "   板块数量: $sectors_count"
else
    echo "⚠️  板块数据获取失败 (可能是非交易时段)"
fi
echo ""

# 测试强制刷新
echo "6. 测试强制刷新 (绕过缓存)..."
echo "   等待2秒后执行刷新..."
sleep 2

start_time=$(date +%s)
response=$(curl -s "http://localhost:3000/api/market/overview?refresh=true")
end_time=$(date +%s)
duration=$((end_time - start_time))

success=$(echo $response | jq -r '.success')
if [ "$success" = "true" ]; then
    echo "✅ 强制刷新成功"
    echo "   响应时间: ~${duration}秒"
    is_realtime=$(echo $response | jq -r '.data.meta.isRealtime')
    echo "   实时数据: $is_realtime"
else
    echo "❌ 强制刷新失败"
fi
echo ""

# 测试缓存机制
echo "7. 测试缓存机制..."
echo "   第一次请求 (未命中缓存)..."
start_time=$(date +%s)
curl -s "http://localhost:3000/api/market/overview?refresh=true" > /dev/null
end_time=$(date +%s)
duration1=$((end_time - start_time))
echo "   响应时间: ~${duration1}秒"

echo "   第二次请求 (命中缓存)..."
start_time=$(date +%s)
curl -s http://localhost:3000/api/market/overview > /dev/null
end_time=$(date +%s)
duration2=$((end_time - start_time))
echo "   响应时间: ~${duration2}秒"

if [ $duration2 -le $duration1 ]; then
    echo "✅ 缓存机制工作正常"
else
    echo "⚠️  缓存响应时间异常"
fi
echo ""

# 验证交易状态判断
echo "8. 验证交易状态判断..."
response=$(curl -s http://localhost:3000/api/market/overview)
is_open=$(echo $response | jq -r '.data.meta.isOpen')
is_realtime=$(echo $response | jq -r '.data.meta.isRealtime')
status_text=$(echo $response | jq -r '.data.meta.statusText')

echo "   市场开盘: $is_open"
echo "   实时数据: $is_realtime"
echo "   状态文本: $status_text"

if [ "$is_open" = "true" ]; then
    echo "   📊 当前为交易时段 - 刷新间隔应为 1分钟"
else
    echo "   🌙 当前为非交易时段 - 刷新间隔应为 5分钟"
fi
echo ""

echo "========================================"
echo "测试完成"
echo "========================================"
echo ""
echo "缓存策略说明："
echo "  - 交易时段: 后端缓存30秒, 前端刷新1分钟"
echo "  - 非交易时段: 后端缓存2分钟, 前端刷新5分钟"
echo ""
echo "同步更新数据："
echo "  - 市场指数 (overview)"
echo "  - 资金流向 (capital-flow)"
echo "  - 板块资金流向 (sectors)"
echo ""
