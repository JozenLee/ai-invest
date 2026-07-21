#!/bin/bash

# 测试数据源API和前端集成
# 验证激活/禁用状态是否正确显示

echo "=========================================="
echo "测试数据源 API 状态显示"
echo "=========================================="
echo ""

# 1. 测试获取所有数据源
echo "1. 测试获取所有数据源 (GET /api/datasources)"
echo "----------------------------------------"
curl -s http://localhost:3000/api/datasources | jq '.data[] | {id, name, isActive, statusLabel, provider, category}' | head -50
echo ""

# 2. 测试仅获取激活的数据源
echo "2. 测试仅获取激活的数据源 (GET /api/datasources?isActive=true)"
echo "----------------------------------------"
curl -s "http://localhost:3000/api/datasources?isActive=true" | jq '{count: .count, sources: [.data[] | {name, provider, category}]}'
echo ""

# 3. 测试仅获取禁用的数据源
echo "3. 测试仅获取禁用的数据源 (GET /api/datasources?isActive=false)"
echo "----------------------------------------"
curl -s "http://localhost:3000/api/datasources?isActive=false" | jq '{count: .count, sources: [.data[] | {name, provider, category}]}'
echo ""

# 4. 按 provider 分组统计
echo "4. 按 Provider 分组统计"
echo "----------------------------------------"
curl -s http://localhost:3000/api/datasources | jq -r '.data | group_by(.provider) | map({provider: .[0].provider, count: length, active: ([.[] | select(.isActive == true)] | length)}) | .[]' | jq -s '.'
echo ""

# 5. NewsNow 数据源状态
echo "5. NewsNow 数据源状态"
echo "----------------------------------------"
curl -s http://localhost:3000/api/datasources | jq '.data[] | select(.provider == "newsnow") | {name, isActive, updateFrequency, lastFetchAt, lastFetchStatus}'
echo ""

echo "=========================================="
echo "测试完成"
echo "=========================================="
echo ""
echo "提示："
echo "- 如果看到 'Connection refused'，请先启动 Next.js 开发服务器: npm run dev"
echo "- 激活的数据源 isActive 应该为 true"
echo "- 禁用的数据源 isActive 应该为 false，且前端会显示为灰色"
echo ""
