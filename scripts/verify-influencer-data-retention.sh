#!/bin/bash

# 验证大V数据保留期限修复
# 检查 postCount 和实际动态列表是否一致

set -e

API_BASE="http://localhost:8000"
DB_PATH="prisma/dev.db"

echo "=========================================="
echo "大V数据保留期限修复验证"
echo "=========================================="
echo ""

# 1. 检查数据库中的数据
echo "1. 检查数据库中的数据统计..."
sqlite3 "$DB_PATH" <<EOF
.headers on
.mode column
SELECT
    i.id,
    i.name,
    i.dataRetentionDays,
    COUNT(ip.id) as total_posts,
    SUM(CASE WHEN ip.publishTime >= datetime('now', '-' || i.dataRetentionDays || ' days') THEN 1 ELSE 0 END) as recent_posts,
    MIN(ip.publishTime) as oldest_post,
    MAX(ip.publishTime) as newest_post
FROM Influencer i
LEFT JOIN InfluencerPost ip ON i.id = ip.influencerId
GROUP BY i.id, i.name, i.dataRetentionDays;
EOF

echo ""
echo "2. 测试API一致性..."

# 获取所有大V的ID
influencer_ids=$(sqlite3 "$DB_PATH" "SELECT id FROM Influencer;")

for id in $influencer_ids; do
    echo ""
    echo "检查大V: $id"

    # 获取详情API返回的postCount
    detail_response=$(curl -s "$API_BASE/api/influencers/$id")
    post_count=$(echo "$detail_response" | python3 -c "import sys, json; print(json.load(sys.stdin).get('postCount', 0))" 2>/dev/null || echo "0")

    # 获取动态列表API返回的total
    posts_response=$(curl -s "$API_BASE/api/influencers/$id/posts?limit=100")
    posts_total=$(echo "$posts_response" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('data', {}).get('total', 0))" 2>/dev/null || echo "0")
    posts_items=$(echo "$posts_response" | python3 -c "import sys, json; data=json.load(sys.stdin); print(len(data.get('data', {}).get('items', [])))" 2>/dev/null || echo "0")

    echo "  - 详情API postCount: $post_count"
    echo "  - 列表API total: $posts_total"
    echo "  - 列表API 实际返回: $posts_items 条"

    if [ "$post_count" = "$posts_total" ]; then
        echo "  ✅ postCount 和列表总数一致"
    else
        echo "  ❌ postCount ($post_count) 和列表总数 ($posts_total) 不一致"
    fi
done

echo ""
echo "3. 测试采集时间范围..."

# 手动触发采集并检查日志
for id in $influencer_ids; do
    echo ""
    echo "触发采集: $id"
    fetch_result=$(curl -s -X POST "$API_BASE/api/influencers/$id/fetch")
    echo "$fetch_result" | python3 -m json.tool

    # 检查最近的采集日志
    echo "检查采集日志中的时间范围..."
    tail -50 ../data-service.log | grep -E "Fetching posts since.*retention" | tail -1
    break  # 只测试第一个
done

echo ""
echo "=========================================="
echo "验证完成"
echo "=========================================="
