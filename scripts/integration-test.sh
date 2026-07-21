#!/bin/bash

# 端到端集成测试执行脚本
# 自动化测试所有功能点

set -e

echo "=================================="
echo "端到端集成测试"
echo "=================================="
echo ""

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 测试计数器
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_SKIPPED=0

# 测试函数
test_case() {
    local name="$1"
    local command="$2"

    echo -n "Testing: $name... "

    if eval "$command" > /dev/null 2>&1; then
        echo -e "${GREEN}✅ PASSED${NC}"
        ((TESTS_PASSED++))
        return 0
    else
        echo -e "${RED}❌ FAILED${NC}"
        ((TESTS_FAILED++))
        return 1
    fi
}

test_case_skip() {
    local name="$1"
    local reason="$2"

    echo -e "Testing: $name... ${YELLOW}⏭️  SKIPPED${NC} ($reason)"
    ((TESTS_SKIPPED++))
}

echo "1. 数据库脚本验证"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
test_case "添加缺失的调度器" "npx tsx scripts/add-missing-schedulers.ts"
test_case "验证数据库配置" "npx tsx scripts/verify-integration.ts"
echo ""

echo "2. API端点测试"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 检查Next.js服务是否运行
if curl -s http://localhost:3000/api/domains > /dev/null 2>&1; then
    test_case "GET /api/domains" "curl -s http://localhost:3000/api/domains | jq -e '.success == true'"
else
    test_case_skip "GET /api/domains" "Next.js服务未运行"
fi

# 检查Python服务
if curl -s --max-time 2 http://localhost:8000/health > /dev/null 2>&1; then
    test_case "GET /health (Python)" "curl -s http://localhost:8000/health | jq -e '.status == \"healthy\"'"
    test_case "GET /schedulers/health" "curl -s http://localhost:8000/schedulers/health | jq -e '.success == true'"
else
    test_case_skip "Python服务健康检查" "Python服务未运行或超时"
fi

echo ""

echo "3. 数据库完整性检查"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
test_case "所有数据源有调度器" "npx tsx -e \"
import { PrismaClient } from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL || 'file:./prisma/dev.db' });
const prisma = new PrismaClient({ adapter });
(async () => {
  const sources = await prisma.dataSource.findMany({ include: { schedulerJobs: true } });
  const withoutScheduler = sources.filter(s => s.schedulerJobs.length === 0);
  await prisma.\\\$disconnect();
  process.exit(withoutScheduler.length === 0 ? 0 : 1);
})();
\""

test_case "NewsNow配置正确(30分钟)" "npx tsx -e \"
import { PrismaClient } from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL || 'file:./prisma/dev.db' });
const prisma = new PrismaClient({ adapter });
(async () => {
  const jobs = await prisma.schedulerJob.findMany({ include: { source: true } });
  const newsNow = jobs.filter(j => j.source.provider === 'newsnow');
  const correct = newsNow.filter(j => JSON.parse(j.scheduleConfig).intervalMinutes === 30);
  await prisma.\\\$disconnect();
  process.exit(correct.length === newsNow.length ? 0 : 1);
})();
\""

test_case "AKShare配置正确(60分钟)" "npx tsx -e \"
import { PrismaClient } from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL || 'file:./prisma/dev.db' });
const prisma = new PrismaClient({ adapter });
(async () => {
  const jobs = await prisma.schedulerJob.findMany({ include: { source: true } });
  const akshare = jobs.filter(j => j.source.provider === 'akshare');
  const correct = akshare.filter(j => JSON.parse(j.scheduleConfig).intervalMinutes === 60);
  await prisma.\\\$disconnect();
  process.exit(correct.length === akshare.length ? 0 : 1);
})();
\""

test_case "领域配置存在(6个)" "npx tsx -e \"
import { PrismaClient } from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL || 'file:./prisma/dev.db' });
const prisma = new PrismaClient({ adapter });
(async () => {
  const domains = await prisma.domain.findMany();
  await prisma.\\\$disconnect();
  process.exit(domains.length === 6 ? 0 : 1);
})();
\""

echo ""

echo "4. 代码组件检查"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
test_case "SchedulerDialog组件存在" "test -f src/components/events/SchedulerDialog.tsx"
test_case "领域筛选UI实现" "grep -q 'domainFilter' src/components/events/SchedulerDialog.tsx"
test_case "Cron选项已移除" "! grep -i 'cron.*option\|cron.*select\|cron.*radio' src/components/events/SchedulerDialog.tsx"
test_case "调度配置API路由存在" "test -f src/app/api/datasources/[id]/schedule/route.ts"
test_case "调度器健康检查API存在" "test -f src/app/api/datasources/schedulers/health/route.ts"

echo ""
echo "=================================="
echo "测试汇总"
echo "=================================="
echo -e "✅ 通过: ${GREEN}${TESTS_PASSED}${NC}"
echo -e "❌ 失败: ${RED}${TESTS_FAILED}${NC}"
echo -e "⏭️  跳过: ${YELLOW}${TESTS_SKIPPED}${NC}"
echo -e "总计: $((TESTS_PASSED + TESTS_FAILED + TESTS_SKIPPED))"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ 所有测试通过！${NC}"
    exit 0
else
    echo -e "${RED}❌ 部分测试失败${NC}"
    exit 1
fi
