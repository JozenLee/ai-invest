#!/bin/bash
# 停止E2E验证服务
# 用途：清理e2e-verify.sh启动的前后端服务
# 使用：bash scripts/stop-e2e.sh

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

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

log_info "=== 停止E2E验证服务 ==="

# 从PID文件读取进程ID
if [ -f ".runtime/backend.pid" ]; then
    BACKEND_PID=$(cat .runtime/backend.pid)
    if kill -0 $BACKEND_PID 2>/dev/null; then
        kill $BACKEND_PID
        log_success "后端服务已停止 (PID: $BACKEND_PID)"
    else
        log_warning "后端服务已不存在 (PID: $BACKEND_PID)"
    fi
    rm .runtime/backend.pid
else
    log_warning "未找到后端服务PID文件"
fi

if [ -f ".runtime/frontend.pid" ]; then
    FRONTEND_PID=$(cat .runtime/frontend.pid)
    if kill -0 $FRONTEND_PID 2>/dev/null; then
        kill $FRONTEND_PID
        log_success "前端服务已停止 (PID: $FRONTEND_PID)"
    else
        log_warning "前端服务已不存在 (PID: $FRONTEND_PID)"
    fi
    rm .runtime/frontend.pid
else
    log_warning "未找到前端服务PID文件"
fi

# 清理可能残留的进程
log_info "清理残留进程..."
pkill -f "next dev" 2>/dev/null || true
pkill -f "python.*main.py" 2>/dev/null || true

# 验证端口已释放
sleep 2
if lsof -i:3000 | grep LISTEN > /dev/null 2>&1; then
    log_warning "端口3000仍被占用，强制清理..."
    lsof -ti:3000 | xargs kill -9 2>/dev/null || true
fi

if lsof -i:8000 | grep LISTEN > /dev/null 2>&1; then
    log_warning "端口8000仍被占用，强制清理..."
    lsof -ti:8000 | xargs kill -9 2>/dev/null || true
fi

log_success "所有服务已停止，端口已释放"
