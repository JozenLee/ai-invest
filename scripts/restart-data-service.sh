#!/bin/bash
# 数据服务重启工具 - 快速重启并验证

echo "停止现有数据服务..."
lsof -ti:8000 | xargs kill -9 2>/dev/null
sleep 2

echo "清除缓存..."
rm -rf /Users/jozen.lee/ai-softwares/ai-invest/data-service/.cache/*

echo "启动数据服务..."
cd /Users/jozen.lee/ai-softwares/ai-invest/data-service
nohup python3 main.py > /tmp/data-service.log 2>&1 &

echo "等待服务启动..."
sleep 5

# 健康检查
if curl -s --max-time 3 http://localhost:8000/health > /dev/null 2>&1; then
    echo "✓ 数据服务启动成功"
    echo ""
    echo "服务信息:"
    curl -s http://localhost:8000/health | python3 -m json.tool
    echo ""
    echo "日志位置: /tmp/data-service.log"
else
    echo "✗ 数据服务启动失败"
    echo "查看日志: tail -50 /tmp/data-service.log"
    exit 1
fi
