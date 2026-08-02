#!/bin/bash

echo "🚀 启动Neo4j容器..."
docker-compose -f docker-compose.neo4j.yml up -d

echo "⏳ 等待Neo4j启动..."
sleep 20

echo "📊 创建索引和约束..."
docker exec -i ai-invest-neo4j cypher-shell -u neo4j -p ai-invest-neo4j-2024 < data-service/config/neo4j_indexes.cypher

echo "✅ Neo4j设置完成！"
echo "🌐 访问 http://localhost:7474 查看Neo4j Browser"
echo "📝 用户名: neo4j"
echo "🔑 密码: ai-invest-neo4j-2024"
