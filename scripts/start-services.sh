#!/usr/bin/env bash
exec "$(cd "$(dirname "$0")" && pwd)/services.sh" start all

set -e

echo "=========================================="
echo "AI投资分析系统 - 启动脚本"
echo "=========================================="
echo ""

# 检查并启动 Neo4j
echo "1️⃣  检查 Neo4j..."
if docker ps | grep -q ai-invest-neo4j; then
    echo "   ✓ Neo4j 已运行"
else
    echo "   启动 Neo4j..."
    docker-compose up -d neo4j
    echo "   等待 Neo4j 就绪..."
    sleep 15
    echo "   ✓ Neo4j 已启动"
fi

# 验证 Neo4j 数据
echo ""
echo "2️⃣  验证 Neo4j 数据..."
INDUSTRY_COUNT=$(docker exec ai-invest-neo4j cypher-shell -u neo4j -p ai-invest-neo4j-2024 "MATCH (i:Industry) RETURN count(i) as total" --format plain | grep -v "total" | tr -d ' ')

if [ "$INDUSTRY_COUNT" -eq "0" ]; then
    echo "   ⚠️  数据库为空，正在恢复..."
    python3 scripts/restore-industries.py
    echo "   ✓ 数据已恢复"
else
    echo "   ✓ 找到 $INDUSTRY_COUNT 个产业"
fi

# 检查并启动 Python 数据服务
echo ""
echo "3️⃣  检查 Python 数据服务..."
if lsof -ti:8000 > /dev/null 2>&1; then
    echo "   ✓ 数据服务已运行 (端口 8000)"
else
    echo "   启动数据服务..."
    # 加载环境变量并启动服务
    export $(cat .env | grep -v '^#' | xargs)
    cd data-service
    nohup python3 main.py > /tmp/data-service.log 2>&1 &
    cd ..
    sleep 3
    echo "   ✓ 数据服务已启动"
fi

# 检查并启动 Next.js
echo ""
echo "4️⃣  检查 Next.js 前端..."
if lsof -ti:3000 > /dev/null 2>&1; then
    echo "   ✓ 前端服务已运行 (端口 3000)"
else
    echo "   启动前端服务..."
    nohup npm run dev > /tmp/nextjs.log 2>&1 &
    sleep 5
    echo "   ✓ 前端服务已启动"
fi

# 测试 API
echo ""
echo "5️⃣  测试 API 连通性..."
sleep 2

# 测试数据服务
if curl -s http://localhost:8000/health > /dev/null; then
    echo "   ✓ 数据服务 API: http://localhost:8000"
else
    echo "   ⚠️  数据服务 API 无响应"
fi

# 测试前端 API
if curl -s http://localhost:3000/api/graph/industries > /dev/null; then
    echo "   ✓ 前端 API: http://localhost:3000"
else
    echo "   ⚠️  前端 API 无响应"
fi

echo ""
echo "=========================================="
echo "✅ 启动完成!"
echo "=========================================="
echo ""
echo "📊 访问地址:"
echo "   前端应用: http://localhost:3000"
echo "   知识图谱: http://localhost:3000/graph"
echo "   Neo4j 浏览器: http://localhost:7474"
echo ""
echo "📝 日志文件:"
echo "   数据服务: /tmp/data-service.log"
echo "   前端服务: /tmp/nextjs.log"
echo ""
echo "🛑 停止服务:"
echo "   ./scripts/stop-services.sh"
echo ""
