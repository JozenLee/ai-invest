#!/bin/bash

echo "=== 测试事件资讯多选筛选功能 ==="
echo ""

echo "1. 测试多选分类（科技类）"
curl -s "http://localhost:3000/api/events/feed?categoryIds=cat_tech,cat_ai&limit=5" | jq '.success, .data.total'
echo ""

echo "2. 测试多选领域"
curl -s "http://localhost:3000/api/events/feed?domainIds=domain_ai_chip,domain_ai_server&limit=5" | jq '.success, .data.total'
echo ""

echo "3. 测试多选情感"
curl -s "http://localhost:3000/api/events/feed?sentiments=bullish,neutral&limit=5" | jq '.success, .data.total'
echo ""

echo "4. 测试组合筛选（分类+情感+领域）"
curl -s "http://localhost:3000/api/events/feed?categoryIds=cat_tech,cat_ai&sentiments=bullish&domainIds=domain_ai_chip&limit=5" | jq '.success, .data.total, .data.items[0].title'
echo ""

echo "✅ 测试完成"
