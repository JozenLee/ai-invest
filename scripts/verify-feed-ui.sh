#!/bin/bash

echo "================================"
echo "验证咨询流页面筛选功能"
echo "================================"
echo ""

# 测试情感筛选
echo "1. 测试情感筛选 API 参数"
echo "-----------------------------------"
echo "测试: 全部情感 (all)"
curl -s "http://localhost:3000/api/events/feed?limit=5&sentiment=all" > /dev/null && echo "✓ 全部情感 - OK" || echo "✗ 全部情感 - FAILED"

echo "测试: 利好 (bullish)"
curl -s "http://localhost:3000/api/events/feed?limit=5&sentiment=bullish" > /dev/null && echo "✓ 利好 - OK" || echo "✗ 利好 - FAILED"

echo "测试: 中性 (neutral)"
curl -s "http://localhost:3000/api/events/feed?limit=5&sentiment=neutral" > /dev/null && echo "✓ 中性 - OK" || echo "✗ 中性 - FAILED"

echo "测试: 利空 (bearish)"
curl -s "http://localhost:3000/api/events/feed?limit=5&sentiment=bearish" > /dev/null && echo "✓ 利空 - OK" || echo "✗ 利空 - FAILED"

echo ""
echo "2. 测试排序筛选 API 参数"
echo "-----------------------------------"
echo "测试: 最新发布 (publishTime)"
curl -s "http://localhost:3000/api/events/feed?limit=5&sortBy=publishTime" > /dev/null && echo "✓ 最新发布 - OK" || echo "✗ 最新发布 - FAILED"

echo "测试: 情感最强 (sentiment)"
curl -s "http://localhost:3000/api/events/feed?limit=5&sortBy=sentiment" > /dev/null && echo "✓ 情感最强 - OK" || echo "✗ 情感最强 - FAILED"

echo "测试: 影响力最高 (impact)"
curl -s "http://localhost:3000/api/events/feed?limit=5&sortBy=impact" > /dev/null && echo "✓ 影响力最高 - OK" || echo "✗ 影响力最高 - FAILED"

echo ""
echo "3. 检查页面元素"
echo "-----------------------------------"
PAGE_CONTENT=$(curl -s http://localhost:3000/events/feed)

if echo "$PAGE_CONTENT" | grep -q "事件资讯"; then
    echo "✓ 页面标题正确"
else
    echo "✗ 页面标题未找到"
fi

echo ""
echo "================================"
echo "验证完成"
echo "================================"
echo ""
echo "请手动检查以下内容："
echo "1. 访问 http://localhost:3000/events/feed"
echo "2. 检查情感筛选下拉框显示: '全部情感', '利好', '中性', '利空'"
echo "3. 检查领域筛选下拉框显示: '全部领域' + 各领域名称"
echo "4. 检查排序下拉框显示: '最新发布', '情感最强', '影响力最高'"
echo "5. 选择不同选项，确认显示的都是中文，没有 'all', 'bullish' 等英文"
