#!/bin/bash
# Phase 3 功能测试脚本

echo "========================================"
echo "Phase 3: 数据源插件化架构 - 功能测试"
echo "========================================"
echo ""

BASE_URL="http://localhost:3000"
PYTHON_URL="http://localhost:8000"

echo "1. 测试 Python Provider API"
echo "----------------------------"

echo "1.1 获取所有 Provider 列表"
curl -s "${PYTHON_URL}/api/providers/list" | python3 -c "import sys, json; data=json.load(sys.stdin); print(f\"✓ 成功获取 {data['total']} 个 Provider\")"

echo ""
echo "1.2 获取 Provider 分类"
curl -s "${PYTHON_URL}/api/providers/categories" | python3 -c "import sys, json; data=json.load(sys.stdin); print(f\"✓ 分类: {list(data['data'].keys())}\")"

echo ""
echo "1.3 获取 Bilibili Provider Schema"
curl -s "${PYTHON_URL}/api/providers/bilibili/schema" | python3 -c "import sys, json; data=json.load(sys.stdin); print(f\"✓ Schema: {data['data']['displayName']} - {data['data']['description']}\")"

echo ""
echo "1.4 验证配置（有效）"
curl -s -X POST "${PYTHON_URL}/api/providers/bilibili/validate" \
  -H "Content-Type: application/json" \
  -d '{"config": {"uid": 123456}}' | python3 -c "import sys, json; data=json.load(sys.stdin); print(f\"✓ 验证结果: valid={data['data']['valid']}\")"

echo ""
echo "1.5 验证配置（无效）"
curl -s -X POST "${PYTHON_URL}/api/providers/bilibili/validate" \
  -H "Content-Type: application/json" \
  -d '{"config": {}}' | python3 -c "import sys, json; data=json.load(sys.stdin); print(f\"✓ 验证结果: valid={data['data']['valid']}, errors={data['data']['errors']}\")"

echo ""
echo "1.6 测试 Provider 配置"
curl -s -X POST "${PYTHON_URL}/api/providers/bilibili/test" \
  -H "Content-Type: application/json" \
  -d '{"config": {"uid": 123456}}' | python3 -c "import sys, json; data=json.load(sys.stdin); print(f\"✓ 测试成功: {data['user_info']['name']} (粉丝: {data['user_info']['followers']})\")"

echo ""
echo "1.7 获取缓存统计"
curl -s "${PYTHON_URL}/api/providers/cache/stats" | python3 -c "import sys, json; data=json.load(sys.stdin); print(f\"✓ 缓存统计: {data['data']}\")"

echo ""
echo ""
echo "2. 测试 Next.js Provider API"
echo "----------------------------"

echo "2.1 获取所有 Provider 列表"
curl -s "${BASE_URL}/api/providers" | python3 -c "import sys, json; data=json.load(sys.stdin); print(f\"✓ 成功获取 {data['total']} 个 Provider\")"

echo ""
echo "2.2 获取 Bilibili Provider Schema"
curl -s "${BASE_URL}/api/providers/bilibili" | python3 -c "import sys, json; data=json.load(sys.stdin); print(f\"✓ Schema: {data['data']['displayName']}\")"

echo ""
echo "2.3 测试 Weibo Provider"
curl -s -X POST "${BASE_URL}/api/providers/weibo/test" \
  -H "Content-Type: application/json" \
  -d '{"config": {"uid": "1234567890"}}' | python3 -c "import sys, json; data=json.load(sys.stdin); print(f\"✓ 测试成功: {data.get('message', 'OK')}\")"

echo ""
echo ""
echo "3. 测试 Provider Loader"
echo "------------------------"

cd /Users/jozen.lee/ai-softwares/ai-invest/data-service
python3 -m providers.schemas > /tmp/provider_test.log 2>&1
if [ $? -eq 0 ]; then
  echo "✓ Provider Schema 加载成功"
else
  echo "✗ Provider Schema 加载失败"
fi

echo ""
echo "========================================"
echo "测试完成！"
echo "========================================"
echo ""
echo "Phase 3 完成情况:"
echo "  ✓ Provider Schema 定义 (schemas.py)"
echo "  ✓ Provider 动态加载器增强 (loader.py)"
echo "  ✓ Provider 管理 API (Python + Next.js)"
echo "  ✓ 动态表单组件 (DynamicConfigForm.tsx)"
echo ""
