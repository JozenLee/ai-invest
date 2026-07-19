#!/bin/bash

echo "================================"
echo "R5: 采集日志和监控 - 功能测试"
echo "================================"
echo ""

BASE_URL="http://localhost:3000"

echo "测试 1: 获取采集日志列表"
echo "----------------------------"
curl -s "${BASE_URL}/api/datasources/logs?limit=5" | jq '.success, .data.total, .data.items | length'
echo ""

echo "测试 2: 按状态筛选日志"
echo "----------------------------"
curl -s "${BASE_URL}/api/datasources/logs?status=success&limit=3" | jq '.success, .data.total'
echo ""

echo "测试 3: 获取统计仪表盘数据"
echo "----------------------------"
curl -s "${BASE_URL}/api/stats/dashboard" | jq '.success, .data.dataSources, .data.articles.total'
echo ""

echo "测试 4: 检查数据源详情页路由"
echo "----------------------------"
# 获取第一个数据源ID
SOURCE_ID=$(curl -s "${BASE_URL}/api/datasources" | jq -r '.data[0].id // empty')

if [ -n "$SOURCE_ID" ]; then
  echo "找到数据源 ID: $SOURCE_ID"
  curl -s "${BASE_URL}/api/datasources/${SOURCE_ID}" | jq '.success, .data.name, .data.fetchCount'
else
  echo "没有找到数据源，请先创建数据源"
fi
echo ""

echo "================================"
echo "测试完成！"
echo "================================"
echo ""
echo "前端页面："
echo "- 数据源详情页: ${BASE_URL}/events/sources/[id]"
echo "- 日志查看器: LogViewer 组件已集成"
echo "- 健康监控: HealthMonitor 组件已集成"
echo ""
echo "请启动开发服务器后访问："
echo "  npm run dev"
echo ""
