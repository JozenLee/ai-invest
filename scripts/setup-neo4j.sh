#!/bin/bash

# Neo4j数据库初始化脚本
# 用途：启动Neo4j Docker容器并创建索引

set -e

echo "🚀 启动Neo4j容器..."
docker-compose -f docker-compose.neo4j.yml up -d

echo "⏳ 等待Neo4j启动（预计30秒）..."
sleep 30

# 检查Neo4j是否就绪
MAX_RETRIES=10
RETRY_COUNT=0
while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if docker exec ai-invest-neo4j cypher-shell -u neo4j -p ai-invest-neo4j-2024 "RETURN 1" > /dev/null 2>&1; then
        echo "✅ Neo4j已就绪"
        break
    fi
    RETRY_COUNT=$((RETRY_COUNT + 1))
    echo "   重试 $RETRY_COUNT/$MAX_RETRIES..."
    sleep 5
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    echo "❌ Neo4j启动超时"
    exit 1
fi

echo "📊 创建索引和约束..."
docker exec -i ai-invest-neo4j cypher-shell -u neo4j -p ai-invest-neo4j-2024 < data-service/config/neo4j_indexes.cypher

echo "✅ Neo4j初始化完成！"
echo ""
echo "访问地址："
echo "  - Neo4j Browser: http://localhost:7474"
echo "  - Bolt连接: bolt://localhost:7687"
echo "  - 用户名: neo4j"
echo "  - 密码: ai-invest-neo4j-2024"
