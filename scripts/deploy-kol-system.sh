#!/bin/bash
# KOL监控系统部署脚本

set -e

echo "🚀 KOL监控系统部署"
echo "================================"
echo ""

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 1. 环境检查
echo -e "${BLUE}📋 Step 1: 环境检查${NC}"
echo "--------------------------------"

# 检查Python版本
if command -v python3 &> /dev/null; then
    PYTHON_VERSION=$(python3 --version)
    echo -e "${GREEN}✓${NC} Python: $PYTHON_VERSION"
else
    echo -e "${RED}✗${NC} Python 3 not found"
    exit 1
fi

# 检查Node.js版本
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    echo -e "${GREEN}✓${NC} Node.js: $NODE_VERSION"
else
    echo -e "${RED}✗${NC} Node.js not found"
    exit 1
fi

# 检查SQLite
if command -v sqlite3 &> /dev/null; then
    SQLITE_VERSION=$(sqlite3 --version | cut -d' ' -f1)
    echo -e "${GREEN}✓${NC} SQLite: $SQLITE_VERSION"
else
    echo -e "${RED}✗${NC} SQLite not found"
    exit 1
fi

echo ""

# 2. 安装依赖
echo -e "${BLUE}📋 Step 2: 安装依赖${NC}"
echo "--------------------------------"

# Python依赖
if [ -f "data-service/requirements.txt" ]; then
    echo "Installing Python dependencies..."
    cd data-service
    pip3 install -q -r requirements.txt
    cd ..
    echo -e "${GREEN}✓${NC} Python dependencies installed"
else
    echo -e "${YELLOW}⚠${NC} requirements.txt not found"
fi

# Node.js依赖
if [ -f "package.json" ]; then
    echo "Checking Node.js dependencies..."
    if [ ! -d "node_modules" ]; then
        echo "Installing Node.js dependencies..."
        npm install --silent
    fi
    echo -e "${GREEN}✓${NC} Node.js dependencies ready"
fi

echo ""

# 3. 数据库设置
echo -e "${BLUE}📋 Step 3: 数据库设置${NC}"
echo "--------------------------------"

# 检查数据库是否存在
if [ -f "prisma/dev.db" ]; then
    echo -e "${GREEN}✓${NC} Database exists"

    # 检查KOL相关表
    TABLES=$(sqlite3 prisma/dev.db "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'Influencer%';" 2>/dev/null || echo "")

    if [ -z "$TABLES" ]; then
        echo -e "${YELLOW}⚠${NC} KOL tables not found, running migration..."
        npm run db:migrate
    else
        echo -e "${GREEN}✓${NC} KOL tables found:"
        echo "$TABLES" | while read -r table; do
            echo "  - $table"
        done
    fi
else
    echo -e "${YELLOW}⚠${NC} Database not found, creating..."
    npm run db:migrate
fi

echo ""

# 4. 运行单元测试
echo -e "${BLUE}📋 Step 4: 运行单元测试${NC}"
echo "--------------------------------"

cd data-service

# Provider测试
echo "Testing providers..."
python3 -m pytest tests/test_weibo_provider.py -v --tb=short 2>&1 | tail -5
python3 -m pytest tests/test_bilibili_provider.py -v --tb=short 2>&1 | tail -5

# Service测试
echo "Testing services..."
python3 -m pytest tests/test_influencer_fetch_service.py -v --tb=short 2>&1 | tail -5
python3 -m pytest tests/test_influencer_analysis_service.py -v --tb=short 2>&1 | tail -5
python3 -m pytest tests/test_opinion_aggregation_service.py -v --tb=short 2>&1 | tail -5

# Worker测试
echo "Testing workers..."
python3 -m pytest tests/test_influencer_ai_queue.py -v --tb=short 2>&1 | tail -5

# Router测试
echo "Testing routers..."
python3 -m pytest tests/test_influencer_router.py -v --tb=short 2>&1 | tail -5

cd ..

echo -e "${GREEN}✓${NC} Unit tests completed"
echo ""

# 5. 启动服务检查
echo -e "${BLUE}📋 Step 5: 服务健康检查${NC}"
echo "--------------------------------"

# 检查后端服务
if curl -s http://localhost:8000/health > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} Backend service is running"
    HEALTH=$(curl -s http://localhost:8000/health | python3 -c "import sys, json; d=json.load(sys.stdin); print(f\"Version: {d['version']}, Scheduler: {d['scheduler_running']}\")")
    echo "  $HEALTH"
else
    echo -e "${YELLOW}⚠${NC} Backend service not running"
    echo "  Start with: cd data-service && python main.py"
fi

# 检查前端服务
if curl -s http://localhost:3000 > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} Frontend service is running"
else
    echo -e "${YELLOW}⚠${NC} Frontend service not running"
    echo "  Start with: npm run dev"
fi

echo ""

# 6. 功能验证
echo -e "${BLUE}📋 Step 6: 功能验证${NC}"
echo "--------------------------------"

if curl -s http://localhost:8000/health > /dev/null 2>&1; then
    # 测试API端点
    echo "Testing API endpoints..."

    # 列表接口
    LIST_RESULT=$(curl -s 'http://localhost:8000/api/influencers/?page=1&pageSize=10')
    if echo "$LIST_RESULT" | python3 -c "import sys, json; json.load(sys.stdin)" > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} GET /api/influencers/"
    else
        echo -e "${RED}✗${NC} GET /api/influencers/"
    fi

    # 统计接口
    STATS_RESULT=$(curl -s 'http://localhost:8000/api/influencers/stats')
    if echo "$STATS_RESULT" | python3 -c "import sys, json; json.load(sys.stdin)" > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} GET /api/influencers/stats"
    else
        echo -e "${RED}✗${NC} GET /api/influencers/stats"
    fi
else
    echo -e "${YELLOW}⚠${NC} Backend service not available, skipping API tests"
fi

echo ""

# 7. 部署总结
echo "================================"
echo -e "${GREEN}✅ 部署完成${NC}"
echo "================================"
echo ""
echo "📚 快速开始："
echo "  1. 启动后端服务: cd data-service && python main.py"
echo "  2. 启动前端服务: npm run dev"
echo "  3. 访问大V监控: http://localhost:3000/events/influencers"
echo ""
echo "🧪 运行测试："
echo "  - 单元测试: cd data-service && python -m pytest tests/"
echo "  - 集成测试: bash scripts/test-kol-system.sh"
echo ""
echo "📖 API文档："
echo "  - Swagger UI: http://localhost:8000/docs"
echo "  - Health Check: http://localhost:8000/health"
echo ""
