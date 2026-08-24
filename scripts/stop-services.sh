#!/bin/bash
# 知识图谱与资讯流联动 - 停止服务脚本

echo "=========================================="
echo "停止 AI投资分析系统服务"
echo "=========================================="
echo ""

if command -v pm2 >/dev/null 2>&1; then
    pm2 delete ai-invest-web-dev 2>/dev/null || true
fi

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 从 PID 文件读取进程 ID
if [ -f "logs/data-service.pid" ]; then
    DATA_SERVICE_PID=$(cat logs/data-service.pid)
    echo -n "停止数据服务 (PID: $DATA_SERVICE_PID) ... "
    if kill $DATA_SERVICE_PID 2>/dev/null; then
        echo -e "${GREEN}✓${NC}"
    else
        echo -e "${RED}✗ 进程不存在${NC}"
    fi
    rm -f logs/data-service.pid
fi

if [ -f "logs/nextjs.pid" ]; then
    NEXTJS_PID=$(cat logs/nextjs.pid)
    echo -n "停止 Next.js 服务 (PID: $NEXTJS_PID) ... "
    if kill $NEXTJS_PID 2>/dev/null; then
        echo -e "${GREEN}✓${NC}"
    else
        echo -e "${RED}✗ 进程不存在${NC}"
    fi
    rm -f logs/nextjs.pid
fi

# 如果 PID 文件不存在，尝试通过端口查找进程
if [ ! -f "logs/data-service.pid" ] && [ ! -f "logs/nextjs.pid" ]; then
    echo "未找到 PID 文件，尝试通过端口查找进程..."

    # 查找端口 8000 (Python 服务)
    PID_8000=$(lsof -ti:8000)
    if [ -n "$PID_8000" ]; then
        echo -n "停止端口 8000 的进程 ... "
        kill $PID_8000 2>/dev/null && echo -e "${GREEN}✓${NC}" || echo -e "${RED}✗${NC}"
    fi

    # 查找端口 3000 (Next.js)
    PID_3000=$(lsof -ti:3000)
    if [ -n "$PID_3000" ]; then
        echo -n "停止端口 3000 的进程 ... "
        kill $PID_3000 2>/dev/null && echo -e "${GREEN}✓${NC}" || echo -e "${RED}✗${NC}"
    fi
fi

echo ""
echo -e "${GREEN}✓ 服务已停止${NC}"
