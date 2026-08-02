#!/bin/bash
# AI智能节点创建测试脚本

echo "=================================================="
echo "        AI智能节点创建功能测试"
echo "=================================================="
echo ""

BASE_URL="http://localhost:3000"
API_ENDPOINT="$BASE_URL/api/graph/ai/create-node"

echo "📝 测试1: 创建液冷散热节点"
echo "---"

curl -X POST "$API_ENDPOINT" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "液冷散热",
    "description": "用于AI服务器的液冷散热解决方案",
    "context": "随着AI算力需求增长，高性能GPU产生大量热量，液冷技术成为数据中心的重要解决方案"
  }' | jq '.'

echo ""
echo "---"
echo ""

echo "📝 测试2: 创建HBM存储节点"
echo "---"

curl -X POST "$API_ENDPOINT" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "HBM高带宽存储",
    "description": "高带宽存储器，用于AI加速芯片",
    "context": "HBM是AI芯片的关键组件，提供高速数据传输能力"
  }' | jq '.'

echo ""
echo "---"
echo ""

echo "📝 测试3: 创建CPO光模块节点"
echo "---"

curl -X POST "$API_ENDPOINT" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "CPO共封装光学",
    "description": "将光模块与交换芯片共同封装的新技术",
    "context": "CPO技术大幅降低数据中心互连功耗和延迟"
  }' | jq '.'

echo ""
echo "=================================================="
echo "              测试完成"
echo "=================================================="
echo ""
echo "💡 提示："
echo "   - 查看创建的节点: $BASE_URL/graph/explore"
echo "   - 查看节点详情: 点击图谱中的节点"
echo "   - 验证ETF匹配: 检查节点的市场数据面板"
echo ""
