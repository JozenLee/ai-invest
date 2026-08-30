#!/bin/bash
# 停止所有服务

echo "=========================================="
echo "停止 AI投资分析系统 服务"
echo "=========================================="
echo ""

# 停止 Next.js
echo "1️⃣  停止 Next.js..."
if lsof -ti:3000 > /dev/null 2>&1; then
    lsof -ti:3000 | xargs kill -9
    echo "   ✓ 已停止"
else
    echo "   - 未运行"
fi

# 停止 Python 数据服务
echo ""
echo "2️⃣  停止 Python 数据服务..."
if lsof -ti:8000 > /dev/null 2>&1; then
    lsof -ti:8000 | xargs kill -9
    echo "   ✓ 已停止"
else
    echo "   - 未运行"
fi

# 停止 Neo4j (可选)
echo ""
echo "3️⃣  Neo4j 状态..."
if docker ps | grep -q ai-invest-neo4j; then
    echo "   ℹ️  Neo4j 仍在运行 (数据持久化，可保持运行)"
    read -p "   是否停止 Neo4j? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        docker-compose stop neo4j
        echo "   ✓ 已停止"
    fi
else
    echo "   - 未运行"
fi

echo ""
echo "=========================================="
echo "✅ 服务已停止"
echo "=========================================="
echo ""
