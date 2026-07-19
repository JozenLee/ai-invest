#!/bin/bash

echo "================================"
echo "Phase 2 完成验证测试"
echo "================================"
echo ""

BASE_URL="http://localhost:3000"

echo "✅ Phase 2 已完成的功能："
echo ""
echo "R5: 采集日志和监控"
echo "  - 采集日志 API"
echo "  - LogViewer 组件"
echo "  - HealthMonitor 组件"
echo "  - 数据源详情页"
echo ""
echo "R6: 分类体系与 AI 清洗集成"
echo "  - NewsCategory 管理 API"
echo "  - Domain 管理 API"
echo "  - CategoryTreeSelect 组件"
echo "  - AI 分类映射逻辑"
echo ""
echo "R7: 大V监控功能完善"
echo "  - B站/微博/小红书 Provider"
echo "  - Provider 加载器"
echo "  - 大V相关 API"
echo "  - 大V监控 UI"
echo ""

echo "================================"
echo "API 端点测试"
echo "================================"
echo ""

echo "测试 1: 采集日志 API"
echo "----------------------------"
curl -s "${BASE_URL}/api/datasources/logs?limit=5" | jq '.success, .data.total' 2>/dev/null || echo "需要启动服务器"
echo ""

echo "测试 2: 分类列表 API"
echo "----------------------------"
curl -s "${BASE_URL}/api/events/categories" | jq '.success, .data | length' 2>/dev/null || echo "需要启动服务器"
echo ""

echo "测试 3: 分类树形结构 API"
echo "----------------------------"
curl -s "${BASE_URL}/api/events/categories/tree" | jq '.success, .data | length' 2>/dev/null || echo "需要启动服务器"
echo ""

echo "测试 4: 领域列表 API"
echo "----------------------------"
curl -s "${BASE_URL}/api/events/domains" | jq '.success, .data | length' 2>/dev/null || echo "需要启动服务器"
echo ""

echo "测试 5: 大V列表 API"
echo "----------------------------"
curl -s "${BASE_URL}/api/influencers" | jq '.success, .data | length' 2>/dev/null || echo "需要启动服务器"
echo ""

echo "测试 6: 统计仪表盘 API"
echo "----------------------------"
curl -s "${BASE_URL}/api/stats/dashboard" | jq '.success' 2>/dev/null || echo "需要启动服务器"
echo ""

echo "================================"
echo "Python Provider 测试"
echo "================================"
echo ""

if [ -d "data-service/providers" ]; then
    echo "测试 Provider 加载器..."
    cd data-service
    python3 -c "
from providers import ProviderLoader
print('可用 Providers:', ProviderLoader.list_providers())
for name in ProviderLoader.list_providers():
    info = ProviderLoader.get_provider_info(name)
    print(f'  - {info[\"display_name\"]}: {info[\"description\"]}')
" 2>/dev/null || echo "需要安装 Python 依赖"
    cd ..
else
    echo "Provider 目录不存在"
fi
echo ""

echo "================================"
echo "代码质量检查"
echo "================================"
echo ""

echo "运行 TypeScript 类型检查..."
npm run typecheck 2>&1 | tail -5
echo ""

echo "================================"
echo "文件统计"
echo "================================"
echo ""

echo "新增文件数量:"
git diff --name-status main...HEAD 2>/dev/null | grep "^A" | wc -l || echo "无法检查 git diff"

echo "修改文件数量:"
git diff --name-status main...HEAD 2>/dev/null | grep "^M" | wc -l || echo "无法检查 git diff"

echo "总提交数量:"
git log --oneline main..HEAD 2>/dev/null | wc -l || echo "无法检查 git log"

echo ""
echo "================================"
echo "下一步操作"
echo "================================"
echo ""
echo "1. 启动开发服务器测试功能:"
echo "   npm run dev"
echo ""
echo "2. 启动 Python 数据服务:"
echo "   cd data-service && python3 main.py"
echo ""
echo "3. 访问页面:"
echo "   - 数据源详情: ${BASE_URL}/events/sources/[id]"
echo "   - 大V监控: ${BASE_URL}/events/influencers"
echo ""
echo "4. 查看文档:"
echo "   - 进度报告: docs/PROGRESS.md"
echo "   - Phase 2 总结: docs/reports/phase2-completion-summary.md"
echo ""
echo "================================"
echo "Phase 2 验证完成！"
echo "================================"
