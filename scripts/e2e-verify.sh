#!/bin/bash
# 前后端闭环验证脚本
# 用途：自动化启动服务、验证API、检查页面、清理环境
# 使用：bash scripts/e2e-verify.sh

set -e  # 遇到错误立即退出

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[✓]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[⚠]${NC} $1"
}

log_error() {
    echo -e "${RED}[✗]${NC} $1"
}

# 检查命令是否存在
check_command() {
    if ! command -v $1 &> /dev/null; then
        log_error "$1 未安装，请先安装"
        exit 1
    fi
}

# ========================================
# 1. 环境检查
# ========================================
log_info "=== 步骤1: 环境检查 ==="
check_command curl
check_command node
check_command npm
check_command python3

if [ -f "package.json" ]; then
    log_success "package.json 存在"
else
    log_error "请在项目根目录运行此脚本"
    exit 1
fi

# ========================================
# 2. 清理环境
# ========================================
log_info "=== 步骤2: 清理环境 ==="

# 停止PM2管理的服务
if command -v pm2 &> /dev/null; then
    log_info "停止PM2管理的服务..."
    pm2 stop ai-invest-data ai-invest-web ai-invest-web-dev 2>/dev/null || true
    log_success "PM2服务已停止"
fi

# 清理残留进程
log_info "清理残留进程..."
pkill -f "next dev" 2>/dev/null || true
pkill -f "python.*main.py" 2>/dev/null || true
sleep 2

# 验证端口已释放
if lsof -i:3000 | grep LISTEN > /dev/null 2>&1; then
    log_warning "端口3000仍被占用，尝试强制清理..."
    lsof -ti:3000 | xargs kill -9 2>/dev/null || true
    sleep 1
fi

if lsof -i:8000 | grep LISTEN > /dev/null 2>&1; then
    log_warning "端口8000仍被占用，尝试强制清理..."
    lsof -ti:8000 | xargs kill -9 2>/dev/null || true
    sleep 1
fi

log_success "环境清理完成"

# ========================================
# 3. 启动后端服务
# ========================================
log_info "=== 步骤3: 启动后端服务 ==="

cd data-service
python3 main.py > ../logs/backend.log 2>&1 &
BACKEND_PID=$!
cd ..

log_info "后端服务启动中... (PID: $BACKEND_PID)"
sleep 5  # 等待后端服务启动

# 验证后端健康
MAX_RETRY=10
RETRY=0
while [ $RETRY -lt $MAX_RETRY ]; do
    if curl -s http://localhost:8000/health > /dev/null 2>&1; then
        log_success "后端服务健康检查通过"
        HEALTH_RESPONSE=$(curl -s http://localhost:8000/health)
        echo "  $HEALTH_RESPONSE" | head -c 100
        echo ""
        break
    else
        RETRY=$((RETRY+1))
        log_warning "等待后端服务就绪... ($RETRY/$MAX_RETRY)"
        sleep 2
    fi
done

if [ $RETRY -eq $MAX_RETRY ]; then
    log_error "后端服务启动失败"
    cat logs/backend.log | tail -20
    kill $BACKEND_PID 2>/dev/null || true
    exit 1
fi

# ========================================
# 4. 启动前端服务
# ========================================
log_info "=== 步骤4: 启动前端服务 ==="

npm run dev > logs/frontend.log 2>&1 &
FRONTEND_PID=$!

log_info "前端服务启动中... (PID: $FRONTEND_PID)"
sleep 10  # 等待Next.js编译

# 验证前端服务
MAX_RETRY=15
RETRY=0
while [ $RETRY -lt $MAX_RETRY ]; do
    if curl -s http://localhost:3000 > /dev/null 2>&1; then
        log_success "前端服务启动成功"
        break
    else
        RETRY=$((RETRY+1))
        log_warning "等待前端服务就绪... ($RETRY/$MAX_RETRY)"
        sleep 2
    fi
done

if [ $RETRY -eq $MAX_RETRY ]; then
    log_error "前端服务启动失败"
    cat logs/frontend.log | tail -20
    kill $BACKEND_PID $FRONTEND_PID 2>/dev/null || true
    exit 1
fi

# ========================================
# 5. API接口验证
# ========================================
log_info "=== 步骤5: API接口验证 ==="

FAILED_APIS=()

# 测试市场概览API
log_info "测试 /api/market/overview ..."
RESPONSE=$(curl -s -w "\n%{http_code}" http://localhost:3000/api/market/overview)
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
if [ "$HTTP_CODE" = "200" ]; then
    log_success "/api/market/overview - 200 OK"
else
    log_error "/api/market/overview - $HTTP_CODE"
    FAILED_APIS+=("market/overview")
fi

# 测试资金流向API
log_info "测试 /api/market/capital-flow ..."
RESPONSE=$(curl -s -w "\n%{http_code}" http://localhost:3000/api/market/capital-flow)
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
if [ "$HTTP_CODE" = "200" ]; then
    log_success "/api/market/capital-flow - 200 OK"
else
    log_error "/api/market/capital-flow - $HTTP_CODE"
    FAILED_APIS+=("market/capital-flow")
fi

# 测试板块数据API
log_info "测试 /api/market/sectors ..."
RESPONSE=$(curl -s -w "\n%{http_code}" http://localhost:3000/api/market/sectors)
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
if [ "$HTTP_CODE" = "200" ]; then
    log_success "/api/market/sectors - 200 OK"
else
    log_error "/api/market/sectors - $HTTP_CODE"
    FAILED_APIS+=("market/sectors")
fi

# 测试用户配置API
log_info "测试 /api/settings/preferences ..."
RESPONSE=$(curl -s -w "\n%{http_code}" http://localhost:3000/api/settings/preferences)
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
if [ "$HTTP_CODE" = "200" ]; then
    log_success "/api/settings/preferences - 200 OK"
else
    log_error "/api/settings/preferences - $HTTP_CODE"
    FAILED_APIS+=("settings/preferences")
fi

# ========================================
# 6. 页面访问验证
# ========================================
log_info "=== 步骤6: 页面访问验证 ==="

# 测试首页
log_info "测试页面: / (重定向)"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/)
if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "307" ]; then
    log_success "首页访问正常 - $HTTP_CODE"
else
    log_error "首页访问失败 - $HTTP_CODE"
fi

# 测试市场数据页
log_info "测试页面: /market"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/market)
if [ "$HTTP_CODE" = "200" ]; then
    log_success "/market 页面加载正常 - 200"
else
    log_error "/market 页面加载失败 - $HTTP_CODE"
fi

# ========================================
# 7. 生成验证报告
# ========================================
log_info "=== 步骤7: 生成验证报告 ==="

echo ""
echo "=========================================="
echo "验证报告"
echo "=========================================="
echo "后端服务: http://localhost:8000 (PID: $BACKEND_PID)"
echo "前端服务: http://localhost:3000 (PID: $FRONTEND_PID)"
echo ""

if [ ${#FAILED_APIS[@]} -eq 0 ]; then
    log_success "所有API接口测试通过"
    echo ""
    echo -e "${GREEN}✓ 闭环验证成功 - 服务保持运行${NC}"
    echo ""
    echo "前端地址: http://localhost:3000"
    echo "后端地址: http://localhost:8000"
    echo "后端健康检查: http://localhost:8000/health"
    echo ""
    echo -e "${BLUE}服务将持续运行，可直接使用${NC}"
    echo ""
    echo "如需停止服务，运行以下命令:"
    echo "  bash scripts/stop-e2e.sh"
    echo "  或手动停止: kill $BACKEND_PID $FRONTEND_PID"
    echo ""
else
    log_error "以下API测试失败: ${FAILED_APIS[*]}"
    echo ""
    echo "查看日志:"
    echo "  后端: tail -f logs/backend.log"
    echo "  前端: tail -f logs/frontend.log"
    echo ""
    log_warning "验证失败，但服务仍在运行以便调试"
    echo "修复问题后可重新运行验证或停止服务: bash scripts/stop-e2e.sh"
    echo ""
fi

# 保存PID以便后续清理
mkdir -p .runtime
echo "$BACKEND_PID" > .runtime/backend.pid
echo "$FRONTEND_PID" > .runtime/frontend.pid

echo "=========================================="
