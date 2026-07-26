#!/bin/bash
# KOL监控系统最终验收测试

echo "🎯 KOL监控系统 - 最终验收测试"
echo "========================================"
echo ""

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

PASS=0
FAIL=0

check() {
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓${NC} $1"
        PASS=$((PASS + 1))
    else
        echo -e "${RED}✗${NC} $1"
        FAIL=$((FAIL + 1))
    fi
}

# 1. 服务健康检查
echo -e "${BLUE}1. 服务健康检查${NC}"
echo "----------------------------------------"

curl -sf http://localhost:8000/health > /dev/null
check "后端服务运行正常"

curl -sf http://localhost:3000 > /dev/null
check "前端服务运行正常"

echo ""

# 2. API接口测试
echo -e "${BLUE}2. API接口测试${NC}"
echo "----------------------------------------"

# 列表接口
RESULT=$(curl -sf 'http://localhost:8000/api/influencers/?page=1&pageSize=10')
echo "$RESULT" | python3 -c "import sys, json; d=json.load(sys.stdin); exit(0 if 'items' in d else 1)" 2>/dev/null
check "GET /api/influencers/ - 列表查询"

# 统计接口
RESULT=$(curl -sf 'http://localhost:8000/api/influencers/stats')
echo "$RESULT" | python3 -c "import sys, json; json.load(sys.stdin)" 2>/dev/null
check "GET /api/influencers/stats - 统计信息"

echo ""

# 3. 数据库完整性检查
echo -e "${BLUE}3. 数据库完整性检查${NC}"
echo "----------------------------------------"

# 检查表是否存在
sqlite3 prisma/dev.db "SELECT name FROM sqlite_master WHERE type='table' AND name='Influencer';" | grep -q "Influencer"
check "Influencer 表存在"

sqlite3 prisma/dev.db "SELECT name FROM sqlite_master WHERE type='table' AND name='InfluencerPost';" | grep -q "InfluencerPost"
check "InfluencerPost 表存在"

sqlite3 prisma/dev.db "SELECT name FROM sqlite_master WHERE type='table' AND name='InfluencerOpinion';" | grep -q "InfluencerOpinion"
check "InfluencerOpinion 表存在"

sqlite3 prisma/dev.db "SELECT name FROM sqlite_master WHERE type='table' AND name='InfluencerFetchLog';" | grep -q "InfluencerFetchLog"
check "InfluencerFetchLog 表存在"

sqlite3 prisma/dev.db "SELECT name FROM sqlite_master WHERE type='table' AND name='InfluencerAnalysisLog';" | grep -q "InfluencerAnalysisLog"
check "InfluencerAnalysisLog 表存在"

echo ""

# 4. 核心文件检查
echo -e "${BLUE}4. 核心文件检查${NC}"
echo "----------------------------------------"

test -f "data-service/providers/weibo_provider.py"
check "WeiboProvider 实现文件"

test -f "data-service/providers/bilibili_provider.py"
check "BilibiliProvider 实现文件"

test -f "data-service/services/influencer_fetch_service.py"
check "InfluencerFetchService 实现文件"

test -f "data-service/services/influencer_analysis_service.py"
check "InfluencerAnalysisService 实现文件"

test -f "data-service/services/opinion_aggregation_service.py"
check "OpinionAggregationService 实现文件"

test -f "data-service/workers/influencer_ai_queue.py"
check "InfluencerAIQueue 实现文件"

test -f "data-service/routers/influencers.py"
check "Influencers Router 实现文件"

test -f "src/app/(dashboard)/events/influencers/page.tsx"
check "前端列表页面"

test -f "src/app/(dashboard)/events/influencers/new/page.tsx"
check "前端添加页面"

echo ""

# 5. 文档检查
echo -e "${BLUE}5. 文档检查${NC}"
echo "----------------------------------------"

test -f "docs/kol-monitoring-system.md"
check "完整系统文档"

test -f "docs/kol-quickstart.md"
check "快速开始指南"

test -f "docs/kol-deployment-report.md"
check "部署完成报告"

echo ""

# 6. 测试脚本检查
echo -e "${BLUE}6. 部署工具检查${NC}"
echo "----------------------------------------"

test -x "scripts/deploy-kol-system.sh"
check "部署脚本可执行"

test -f "scripts/test-kol-system.sh"
check "集成测试脚本"

echo ""

# 7. 功能完整性检查
echo -e "${BLUE}7. 功能完整性检查${NC}"
echo "----------------------------------------"

# 检查Provider是否注册
grep -q "WeiboAPIProvider" data-service/services/influencer_fetch_service.py
check "微博Provider已注册"

grep -q "BilibiliAPIProvider" data-service/services/influencer_fetch_service.py
check "B站Provider已注册"

# 检查API路由注册
grep -q "influencers.router" data-service/main.py
check "API路由已注册"

# 检查前端API集成
grep -q "/api/influencers" "src/app/(dashboard)/events/influencers/page.tsx"
check "前端API集成正确"

echo ""

# 8. 环境变量检查
echo -e "${BLUE}8. 环境配置检查${NC}"
echo "----------------------------------------"

test -f ".env"
check ".env 文件存在"

if [ -f ".env" ]; then
    grep -q "ANTHROPIC_API_KEY" .env
    check "ANTHROPIC_API_KEY 已配置"
fi

echo ""

# 总结
echo "========================================"
echo -e "${BLUE}📊 验收测试总结${NC}"
echo "========================================"
echo -e "通过: ${GREEN}$PASS${NC}"
echo -e "失败: ${RED}$FAIL${NC}"
echo "总计: $((PASS + FAIL))"
echo ""

if [ $FAIL -eq 0 ]; then
    echo -e "${GREEN}✅ 所有验收测试通过！系统可以交付使用。${NC}"
    echo ""
    echo "📚 下一步操作："
    echo "  1. 访问大V监控页面: http://localhost:3000/events/influencers"
    echo "  2. 添加第一个KOL开始监控"
    echo "  3. 查看API文档: http://localhost:8000/docs"
    echo ""
    exit 0
else
    echo -e "${RED}❌ 部分验收测试失败，请检查系统配置${NC}"
    exit 1
fi
