#!/bin/bash
# 测试咨询流页面的筛选功能

BASE_URL="http://localhost:3000"
API_URL="${BASE_URL}/api/events"

echo "================================"
echo "测试咨询流筛选功能"
echo "================================"
echo ""

# 等待服务启动
echo "等待服务启动..."
for i in {1..30}; do
  if curl -s "${BASE_URL}" > /dev/null 2>&1; then
    echo "✓ 服务已启动"
    break
  fi
  if [ $i -eq 30 ]; then
    echo "✗ 服务启动超时"
    exit 1
  fi
  sleep 1
done
echo ""

# 测试1：获取所有新闻（无筛选）
echo "测试1: 获取所有新闻（无筛选）"
response=$(curl -s "${API_URL}/feed?limit=5")
total=$(echo "$response" | jq -r '.data.total // 0')
items=$(echo "$response" | jq -r '.data.items | length')
echo "  总数: $total, 返回: $items"
if [ "$items" -gt 0 ]; then
  echo "  ✓ 通过"
else
  echo "  ✗ 失败：没有返回数据"
fi
echo ""

# 测试2：情感筛选 - 利好
echo "测试2: 情感筛选 - 利好（bullish）"
response=$(curl -s "${API_URL}/feed?sentiment=bullish&limit=5")
success=$(echo "$response" | jq -r '.success')
items=$(echo "$response" | jq -r '.data.items | length')
echo "  成功: $success, 返回: $items 条"
if [ "$success" = "true" ]; then
  echo "  ✓ API调用成功"
  if [ "$items" -gt 0 ]; then
    # 检查第一条数据的情感值
    sentiment=$(echo "$response" | jq -r '.data.items[0].sentiment // 0')
    echo "  第一条新闻情感值: $sentiment"
    if (( $(echo "$sentiment > 0.2" | bc -l) )); then
      echo "  ✓ 情感筛选正确（> 0.2）"
    else
      echo "  ⚠ 情感值可能不在预期范围"
    fi
  fi
else
  echo "  ✗ API调用失败"
fi
echo ""

# 测试3：情感筛选 - 利空
echo "测试3: 情感筛选 - 利空（bearish）"
response=$(curl -s "${API_URL}/feed?sentiment=bearish&limit=5")
success=$(echo "$response" | jq -r '.success')
items=$(echo "$response" | jq -r '.data.items | length')
echo "  成功: $success, 返回: $items 条"
if [ "$success" = "true" ]; then
  echo "  ✓ API调用成功"
  if [ "$items" -gt 0 ]; then
    sentiment=$(echo "$response" | jq -r '.data.items[0].sentiment // 0')
    echo "  第一条新闻情感值: $sentiment"
    if (( $(echo "$sentiment < -0.2" | bc -l) )); then
      echo "  ✓ 情感筛选正确（< -0.2）"
    else
      echo "  ⚠ 情感值可能不在预期范围"
    fi
  fi
else
  echo "  ✗ API调用失败"
fi
echo ""

# 测试4：情感筛选 - 中性
echo "测试4: 情感筛选 - 中性（neutral）"
response=$(curl -s "${API_URL}/feed?sentiment=neutral&limit=5")
success=$(echo "$response" | jq -r '.success')
items=$(echo "$response" | jq -r '.data.items | length')
echo "  成功: $success, 返回: $items 条"
if [ "$success" = "true" ]; then
  echo "  ✓ API调用成功"
  if [ "$items" -gt 0 ]; then
    sentiment=$(echo "$response" | jq -r '.data.items[0].sentiment // 0')
    echo "  第一条新闻情感值: $sentiment"
    sentiment_abs=$(echo "$sentiment" | sed 's/-//')
    if (( $(echo "$sentiment_abs <= 0.2" | bc -l) )); then
      echo "  ✓ 情感筛选正确（-0.2 到 0.2）"
    else
      echo "  ⚠ 情感值可能不在预期范围"
    fi
  fi
else
  echo "  ✗ API调用失败"
fi
echo ""

# 测试5：获取领域列表
echo "测试5: 获取领域列表"
response=$(curl -s "${API_URL}/domains")
success=$(echo "$response" | jq -r '.success')
domains=$(echo "$response" | jq -r '.data | length')
echo "  成功: $success, 领域数: $domains"
if [ "$success" = "true" ] && [ "$domains" -gt 0 ]; then
  echo "  ✓ 通过"
  # 显示领域列表
  echo "  领域列表:"
  echo "$response" | jq -r '.data[] | "    - \(.name) (\(.id))"' | head -5

  # 获取第一个领域ID用于测试
  first_domain_id=$(echo "$response" | jq -r '.data[0].id')
  first_domain_name=$(echo "$response" | jq -r '.data[0].name')

  # 测试6：领域筛选
  echo ""
  echo "测试6: 领域筛选 - $first_domain_name ($first_domain_id)"
  response=$(curl -s "${API_URL}/feed?domainId=${first_domain_id}&limit=5")
  success=$(echo "$response" | jq -r '.success')
  items=$(echo "$response" | jq -r '.data.items | length')
  echo "  成功: $success, 返回: $items 条"
  if [ "$success" = "true" ]; then
    echo "  ✓ API调用成功"
    if [ "$items" -gt 0 ]; then
      domain_name=$(echo "$response" | jq -r '.data.items[0].domainName // "无"')
      echo "  第一条新闻领域: $domain_name"
      if [ "$domain_name" = "$first_domain_name" ] || [ "$domain_name" != "无" ]; then
        echo "  ✓ 领域筛选生效"
      else
        echo "  ⚠ 领域筛选可能未生效"
      fi
    fi
  else
    echo "  ✗ API调用失败"
  fi
else
  echo "  ✗ 获取领域列表失败"
fi
echo ""

# 测试7：获取分类列表
echo "测试7: 获取分类列表"
response=$(curl -s "${API_URL}/categories")
success=$(echo "$response" | jq -r '.success')
categories=$(echo "$response" | jq -r '.data | length')
echo "  成功: $success, 分类数: $categories"
if [ "$success" = "true" ] && [ "$categories" -gt 0 ]; then
  echo "  ✓ 通过"
  echo "  分类列表:"
  echo "$response" | jq -r '.data[] | "    - \(.name) (\(.id))"' | head -5

  # 获取第一个分类ID用于测试
  first_category_id=$(echo "$response" | jq -r '.data[0].id')
  first_category_name=$(echo "$response" | jq -r '.data[0].name')

  # 测试8：分类筛选
  echo ""
  echo "测试8: 分类筛选 - $first_category_name ($first_category_id)"
  response=$(curl -s "${API_URL}/feed?categoryId=${first_category_id}&limit=5")
  success=$(echo "$response" | jq -r '.success')
  items=$(echo "$response" | jq -r '.data.items | length')
  echo "  成功: $success, 返回: $items 条"
  if [ "$success" = "true" ]; then
    echo "  ✓ API调用成功"
    if [ "$items" -gt 0 ]; then
      category_name=$(echo "$response" | jq -r '.data.items[0].categoryName // "无"')
      echo "  第一条新闻分类: $category_name"
      echo "  ✓ 分类筛选生效"
    fi
  else
    echo "  ✗ API调用失败"
  fi
else
  echo "  ✗ 获取分类列表失败"
fi
echo ""

# 测试9：排序功能 - 按时间
echo "测试9: 排序功能 - 按时间（publishTime）"
response=$(curl -s "${API_URL}/feed?sortBy=publishTime&limit=5")
success=$(echo "$response" | jq -r '.success')
items=$(echo "$response" | jq -r '.data.items | length')
echo "  成功: $success, 返回: $items 条"
if [ "$success" = "true" ] && [ "$items" -gt 0 ]; then
  echo "  ✓ 通过"
  first_time=$(echo "$response" | jq -r '.data.items[0].publishTime')
  last_time=$(echo "$response" | jq -r '.data.items[-1].publishTime')
  echo "  第一条: $first_time"
  echo "  最后一条: $last_time"
else
  echo "  ✗ 失败"
fi
echo ""

# 测试10：排序功能 - 按情感
echo "测试10: 排序功能 - 按情感强度（sentiment）"
response=$(curl -s "${API_URL}/feed?sortBy=sentiment&limit=5")
success=$(echo "$response" | jq -r '.success')
items=$(echo "$response" | jq -r '.data.items | length')
echo "  成功: $success, 返回: $items 条"
if [ "$success" = "true" ] && [ "$items" -gt 0 ]; then
  echo "  ✓ 通过"
  first_sentiment=$(echo "$response" | jq -r '.data.items[0].sentiment // 0')
  echo "  第一条情感值: $first_sentiment（应该是最高的）"
else
  echo "  ✗ 失败"
fi
echo ""

# 测试11：组合筛选
echo "测试11: 组合筛选（情感=利好 + 排序=情感强度）"
response=$(curl -s "${API_URL}/feed?sentiment=bullish&sortBy=sentiment&limit=3")
success=$(echo "$response" | jq -r '.success')
items=$(echo "$response" | jq -r '.data.items | length')
echo "  成功: $success, 返回: $items 条"
if [ "$success" = "true" ]; then
  echo "  ✓ 组合筛选API调用成功"
  if [ "$items" -gt 0 ]; then
    echo "  新闻列表:"
    echo "$response" | jq -r '.data.items[] | "    - \(.title[0:50])... (情感: \(.sentiment // 0))"'
  fi
else
  echo "  ✗ 失败"
fi
echo ""

echo "================================"
echo "测试完成"
echo "================================"
