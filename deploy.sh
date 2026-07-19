#!/bin/bash
# 一键部署脚本 - AI 投资分析系统
# 适用于生产环境部署

set -e  # 遇到错误立即退出

echo "========================================"
echo "AI 投资分析系统 - 生产环境部署"
echo "========================================"
echo ""

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查命令是否存在
check_command() {
    if ! command -v $1 &> /dev/null; then
        log_error "$1 未安装，请先安装"
        exit 1
    fi
}

# Step 0: 环境检查
echo "步骤 0: 环境检查"
echo "----------------"

log_info "检查必需的命令..."
check_command "node"
check_command "npm"
check_command "python3"
check_command "pip3"
check_command "sqlite3"

log_info "检查版本..."
node --version
npm --version
python3 --version
sqlite3 --version

echo ""

# Step 1: 检查环境变量
echo "步骤 1: 检查环境变量配置"
echo "------------------------"

if [ ! -f ".env.production" ]; then
    log_warn ".env.production 文件不存在"

    if [ -f ".env.production.example" ]; then
        log_info "从示例文件创建 .env.production..."
        cp .env.production.example .env.production
        log_warn "请编辑 .env.production 并填写实际配置"
        log_warn "特别是 ANTHROPIC_API_KEY"
        read -p "按回车继续（确保已配置）..."
    else
        log_error "找不到 .env.production.example"
        exit 1
    fi
else
    log_info "✓ .env.production 已存在"
fi

# 检查关键环境变量
if grep -q "sk-ant-api03-" .env.production 2>/dev/null; then
    log_info "✓ 检测到 ANTHROPIC_API_KEY 配置"
else
    log_warn "未检测到有效的 ANTHROPIC_API_KEY"
    log_warn "AI 功能将不可用"
fi

echo ""

# Step 2: 安装依赖
echo "步骤 2: 安装依赖"
echo "----------------"

log_info "安装 Node.js 依赖..."
npm install --production

log_info "安装 Python 依赖..."
cd data-service
pip3 install -r requirements.txt
cd ..

log_info "✓ 依赖安装完成"
echo ""

# Step 3: 数据库初始化
echo "步骤 3: 数据库初始化"
echo "--------------------"

log_info "生成 Prisma Client..."
npx prisma generate

if [ ! -f "prisma/dev.db" ]; then
    log_info "创建数据库..."
    npx prisma migrate deploy

    log_info "初始化种子数据..."
    npx prisma db seed || log_warn "种子数据初始化失败（可忽略）"
else
    log_info "✓ 数据库已存在"
fi

log_info "执行性能优化脚本..."
sqlite3 prisma/dev.db < prisma/migrations/add_performance_indexes.sql 2>/dev/null || log_warn "索引可能已存在"
sqlite3 prisma/dev.db < prisma/migrations/create_fts5_index.sql 2>/dev/null || log_warn "FTS5 索引可能已存在"

log_info "✓ 数据库初始化完成"
echo ""

# Step 4: 构建前端
echo "步骤 4: 构建前端应用"
echo "--------------------"

log_info "清理旧构建..."
rm -rf .next

log_info "构建生产版本..."
npm run build

log_info "✓ 前端构建完成"
echo ""

# Step 5: 启动服务
echo "步骤 5: 启动服务"
echo "----------------"

# 检查是否已安装 PM2
if command -v pm2 &> /dev/null; then
    log_info "使用 PM2 启动服务..."

    # 停止旧服务
    pm2 delete ai-invest-data 2>/dev/null || true
    pm2 delete ai-invest-web 2>/dev/null || true

    # 启动 Python 数据服务
    log_info "启动 Python 数据服务..."
    cd data-service
    pm2 start main.py --name ai-invest-data --interpreter python3
    cd ..

    # 启动 Next.js 服务
    log_info "启动 Next.js 服务..."
    pm2 start npm --name ai-invest-web -- start

    # 保存 PM2 配置
    pm2 save

    log_info "✓ 服务已启动"
    echo ""

    log_info "查看服务状态:"
    pm2 status

else
    log_warn "PM2 未安装，使用手动启动方式"
    echo ""
    log_info "请在两个终端中分别执行:"
    echo "  终端 1: cd data-service && python3 main.py"
    echo "  终端 2: npm start"
fi

echo ""

# Step 6: 验证部署
echo "步骤 6: 验证部署"
echo "----------------"

log_info "等待服务启动..."
sleep 5

# 验证 Python 服务
log_info "检查 Python 数据服务..."
if curl -s http://localhost:8000/health | grep -q "healthy"; then
    log_info "✓ Python 数据服务正常"
else
    log_warn "⚠ Python 数据服务可能未正常启动"
fi

# 验证 Next.js 服务
log_info "检查 Next.js 服务..."
if curl -s http://localhost:3000 | grep -q "html"; then
    log_info "✓ Next.js 服务正常"
else
    log_warn "⚠ Next.js 服务可能未正常启动"
fi

# 验证 AI 服务
log_info "检查 AI 服务..."
if curl -s http://localhost:8000/api/ai/health | grep -q "model"; then
    log_info "✓ AI 服务正常"
else
    log_warn "⚠ AI 服务可能未配置（需要 ANTHROPIC_API_KEY）"
fi

# 验证搜索服务
log_info "检查搜索服务..."
if curl -s http://localhost:8000/api/search/stats | grep -q "indexed_documents"; then
    log_info "✓ 搜索服务正常"
else
    log_warn "⚠ 搜索服务可能未正常启动"
fi

# 验证缓存服务
log_info "检查缓存服务..."
if curl -s http://localhost:8000/api/cache/health | grep -q "backend"; then
    log_info "✓ 缓存服务正常"
else
    log_warn "⚠ 缓存服务可能未正常启动"
fi

echo ""

# Step 7: 完成
echo "========================================"
echo "✅ 部署完成！"
echo "========================================"
echo ""

log_info "服务访问地址:"
echo "  前端应用: http://localhost:3000"
echo "  数据 API: http://localhost:8000"
echo "  API 文档: http://localhost:8000/docs"
echo ""

log_info "管理命令:"
if command -v pm2 &> /dev/null; then
    echo "  查看状态: pm2 status"
    echo "  查看日志: pm2 logs"
    echo "  重启服务: pm2 restart all"
    echo "  停止服务: pm2 stop all"
    echo ""

    log_info "设置开机自启:"
    echo "  pm2 startup"
    echo "  pm2 save"
fi

echo ""
log_info "下一步:"
echo "  1. 访问 http://localhost:3000 验证前端"
echo "  2. 访问 http://localhost:8000/docs 查看 API 文档"
echo "  3. 配置 Nginx 反向代理（可选）"
echo "  4. 配置 SSL 证书（可选）"
echo "  5. 设置定期备份"
echo ""

log_info "详细文档: DEPLOYMENT.md"
echo ""
