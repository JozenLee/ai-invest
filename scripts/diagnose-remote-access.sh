#!/bin/bash

echo "=================================================="
echo "AI投资系统 - 远程访问诊断脚本"
echo "=================================================="
echo ""

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 1. 检查服务监听状态
echo "1. 检查服务监听状态"
echo "-------------------"

NEXTJS_PORT=$(lsof -nP -iTCP:3000 -sTCP:LISTEN 2>/dev/null | grep LISTEN)
if [ -n "$NEXTJS_PORT" ]; then
    echo -e "${GREEN}✓ Next.js (3000端口)${NC}"
    echo "$NEXTJS_PORT" | awk '{print "  进程:", $1, "PID:", $2, "监听:", $9}'
else
    echo -e "${RED}✗ Next.js (3000端口) - 未运行${NC}"
fi

PYTHON_PORT=$(lsof -nP -iTCP:8000 -sTCP:LISTEN 2>/dev/null | grep LISTEN)
if [ -n "$PYTHON_PORT" ]; then
    echo -e "${GREEN}✓ Python服务 (8000端口)${NC}"
    echo "$PYTHON_PORT" | awk '{print "  进程:", $1, "PID:", $2, "监听:", $9}'
else
    echo -e "${RED}✗ Python服务 (8000端口) - 未运行${NC}"
fi

echo ""

# 2. 检查网络接口
echo "2. 网络接口和IP地址"
echo "-------------------"
ifconfig | grep -A 1 "inet " | grep -v "127.0.0.1" | grep "inet" | awk '{print "  ", $1, $2}'
echo ""

# 3. 测试本地API
echo "3. 测试本地API访问"
echo "-------------------"

# 测试Next.js
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 2>/dev/null)
if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "307" ]; then
    echo -e "${GREEN}✓ Next.js服务响应正常 (HTTP $HTTP_CODE)${NC}"
else
    echo -e "${RED}✗ Next.js服务响应异常 (HTTP $HTTP_CODE)${NC}"
fi

# 测试Python服务
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/health 2>/dev/null)
if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✓ Python服务响应正常 (HTTP $HTTP_CODE)${NC}"
else
    echo -e "${RED}✗ Python服务响应异常 (HTTP $HTTP_CODE)${NC}"
fi

# 测试市场API
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/market/overview 2>/dev/null)
if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✓ 市场概览API正常 (HTTP $HTTP_CODE)${NC}"
else
    echo -e "${RED}✗ 市场概览API异常 (HTTP $HTTP_CODE)${NC}"
fi

echo ""

# 4. 测试内网IP访问
echo "4. 测试内网IP访问 (100.80.210.104)"
echo "-----------------------------------"

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://100.80.210.104:3000 2>/dev/null)
if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "307" ]; then
    echo -e "${GREEN}✓ Next.js内网访问正常 (HTTP $HTTP_CODE)${NC}"
else
    echo -e "${RED}✗ Next.js内网访问异常 (HTTP $HTTP_CODE)${NC}"
fi

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://100.80.210.104:8000/health 2>/dev/null)
if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✓ Python服务内网访问正常 (HTTP $HTTP_CODE)${NC}"
else
    echo -e "${RED}✗ Python服务内网访问异常 (HTTP $HTTP_CODE)${NC}"
fi

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://100.80.210.104:3000/api/market/overview 2>/dev/null)
if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✓ 市场API内网访问正常 (HTTP $HTTP_CODE)${NC}"
else
    echo -e "${RED}✗ 市场API内网访问异常 (HTTP $HTTP_CODE)${NC}"
fi

echo ""

# 5. 检查CORS配置
echo "5. 检查CORS配置"
echo "---------------"

CORS_HEADER=$(curl -s -I -H "Origin: http://100.80.210.104:3000" http://100.80.210.104:8000/health 2>/dev/null | grep -i "access-control-allow-origin")
if [ -n "$CORS_HEADER" ]; then
    echo -e "${GREEN}✓ CORS配置正常${NC}"
    echo "  $CORS_HEADER"
else
    echo -e "${RED}✗ CORS配置可能有问题${NC}"
fi

echo ""

# 6. Python服务日志
echo "6. Python服务最近日志"
echo "---------------------"
if [ -f /tmp/python-service.log ]; then
    echo "最近10行日志："
    tail -10 /tmp/python-service.log | grep -v "httpx\|anthropic"
else
    echo -e "${YELLOW}⚠ 日志文件不存在${NC}"
fi

echo ""

# 7. 进程信息
echo "7. 服务进程信息"
echo "---------------"
ps aux | grep -E "next-server|python.*main.py" | grep -v grep | awk '{print "  PID:", $2, "CPU:", $3"%", "MEM:", $4"%", "CMD:", $11, $12, $13}'

echo ""
echo "=================================================="
echo "诊断完成！"
echo ""
echo "测试页面: http://100.80.210.104:3000/test-network.html"
echo "文档: docs/remote-access-troubleshooting.md"
echo "=================================================="
