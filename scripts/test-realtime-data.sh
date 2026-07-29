#!/bin/bash
# 测试实时数据更新机制

echo "=========================================="
echo "市场数据实时更新测试"
echo "=========================================="
echo ""

# 检查当前时间
echo "1. 当前时间："
date "+%Y-%m-%d %H:%M:%S %A"
echo ""

# 检查Python数据服务
echo "2. 检查Python数据服务状态："
if curl -s --connect-timeout 2 http://localhost:8000/health > /dev/null 2>&1; then
    echo "✅ Python数据服务运行正常 (端口8000)"
else
    echo "❌ Python数据服务未启动"
    echo "   请运行: cd data-service && python main.py"
fi
echo ""

# 检查Next.js服务
echo "3. 检查Next.js服务状态："
if curl -s --connect-timeout 2 http://localhost:3000 > /dev/null 2>&1; then
    echo "✅ Next.js服务运行正常 (端口3000)"
else
    echo "❌ Next.js服务未启动"
    echo "   请运行: npm run dev"
fi
echo ""

# 测试Python数据服务返回的市场状态
echo "4. Python数据服务 - 市场状态："
python_meta=$(curl -s http://localhost:8000/api/market/overview | jq -r '.data.meta')
echo "$python_meta" | jq '{
    status: .status,
    statusText: .statusText,
    isRealtime: .isRealtime,
    lastTradingDate: .lastTradingDate
}'
echo ""

# 测试Next.js API返回的市场状态
echo "5. Next.js API - 市场状态："
nextjs_meta=$(curl -s "http://localhost:3000/api/market/overview?refresh=true" | jq -r '.data.meta')
echo "$nextjs_meta" | jq '{
    status: .status,
    statusText: .statusText,
    isRealtime: .isRealtime,
    lastTradingDate: .lastTradingDate
}'
echo ""

# 测试数据时间戳
echo "6. 数据时间戳对比（强制刷新3次，间隔2秒）："
for i in 1 2 3; do
    timestamp=$(curl -s "http://localhost:3000/api/market/overview?refresh=true" | jq -r '.data.timestamp')
    echo "   请求 $i: $timestamp"
    if [ $i -lt 3 ]; then
        sleep 2
    fi
done
echo ""

# 测试缓存行为
echo "7. 缓存行为测试（不刷新，连续请求3次）："
for i in 1 2 3; do
    timestamp=$(curl -s "http://localhost:3000/api/market/overview" | jq -r '.data.timestamp')
    echo "   请求 $i: $timestamp"
done
echo ""

# 检查配置
echo "8. 缓存配置检查："
echo "   - 交易时段缓存TTL: 5秒（后端）"
echo "   - 非交易时段缓存TTL: 30秒（后端）"
echo "   - 前端自动刷新间隔: 10秒（交易时段）/ 60秒（非交易时段）"
echo ""

echo "=========================================="
echo "测试完成"
echo "=========================================="
