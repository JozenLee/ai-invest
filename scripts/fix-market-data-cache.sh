#!/bin/bash
# 修复市场数据缓存问题
# 1. 清理旧缓存
# 2. 重启数据服务
# 3. 验证数据更新

set -e

echo "=================================================="
echo "修复市场数据缓存问题"
echo "=================================================="
echo ""

# 1. 查找并停止数据服务
echo "1. 停止Python数据服务..."
PID=$(lsof -ti:8000 2>/dev/null || echo "")
if [ -n "$PID" ]; then
    echo "   找到进程 PID: $PID"
    kill $PID
    sleep 2
    echo "   ✅ 数据服务已停止"
else
    echo "   ⚠️  数据服务未运行"
fi

# 2. 清理缓存文件
echo ""
echo "2. 清理缓存文件..."
CACHE_DIR="data-service/.cache"
if [ -d "$CACHE_DIR" ]; then
    echo "   删除旧缓存: market_overview.json"
    rm -f "$CACHE_DIR/market_overview.json"
    rm -f "$CACHE_DIR/market_capital_flow.json"
    rm -f "$CACHE_DIR/sector_capital_flow_今日.json"
    rm -f "$CACHE_DIR/northbound_flow.json"
    echo "   ✅ 缓存文件已清理"
else
    echo "   ⚠️  缓存目录不存在"
fi

# 3. 启动数据服务（后台运行）
echo ""
echo "3. 启动Python数据服务..."
cd data-service
nohup python3 main.py > ../data-service.log 2>&1 &
NEW_PID=$!
echo "   新进程 PID: $NEW_PID"
cd ..

# 4. 等待服务启动
echo ""
echo "4. 等待服务启动..."
for i in {1..10}; do
    if curl -s http://localhost:8000/health > /dev/null 2>&1; then
        echo "   ✅ 数据服务已启动"
        break
    fi
    echo "   等待... ($i/10)"
    sleep 2
done

# 5. 触发数据获取
echo ""
echo "5. 触发市场数据获取..."
RESPONSE=$(curl -s http://localhost:8000/api/market/overview)
SUCCESS=$(echo "$RESPONSE" | jq -r '.success')

if [ "$SUCCESS" == "true" ]; then
    echo "   ✅ 数据获取成功"

    # 显示第一个指数信息
    INDEX_NAME=$(echo "$RESPONSE" | jq -r '.data.indices[0].name')
    INDEX_PRICE=$(echo "$RESPONSE" | jq -r '.data.indices[0].price')
    INDEX_CHANGE=$(echo "$RESPONSE" | jq -r '.data.indices[0].changePct')

    echo "   ${INDEX_NAME}: ¥${INDEX_PRICE} (${INDEX_CHANGE}%)"
else
    echo "   ❌ 数据获取失败"
    echo "$RESPONSE" | jq '.'
fi

# 6. 验证缓存文件
echo ""
echo "6. 验证缓存文件..."
if [ -f "$CACHE_DIR/market_overview.json" ]; then
    FILE_SIZE=$(ls -lh "$CACHE_DIR/market_overview.json" | awk '{print $5}')
    FILE_TIME=$(stat -f "%Sm" -t "%Y-%m-%d %H:%M:%S" "$CACHE_DIR/market_overview.json")
    echo "   ✅ 缓存文件已生成"
    echo "   大小: $FILE_SIZE"
    echo "   时间: $FILE_TIME"
else
    echo "   ⚠️  缓存文件未生成"
fi

echo ""
echo "=================================================="
echo "修复完成"
echo "=================================================="
echo ""
echo "提示："
echo "- 查看服务日志: tail -f data-service.log"
echo "- 检查服务状态: curl http://localhost:8000/health"
echo "- 手动刷新缓存: curl -X POST http://localhost:8000/api/scheduler/run/daily_cache_refresh"
