#!/bin/bash
# Bilibili 大V数据采集快速配置脚本
# 使用方法: ./bilibili-quick-setup.sh

set -e

echo "================================================"
echo "  Bilibili 大V数据采集 - 快速配置向导"
echo "================================================"
echo ""

# 检查 Python 环境
if ! command -v python3 &> /dev/null; then
    echo "❌ 错误: 未找到 python3"
    exit 1
fi

# 检查数据库
if [ ! -f "prisma/dev.db" ]; then
    echo "❌ 错误: 数据库文件不存在"
    echo "请先运行: npm run db:migrate"
    exit 1
fi

echo "✓ 环境检查通过"
echo ""

# 检查大V记录是否存在
echo "检查大V记录..."
INFLUENCER_EXISTS=$(python3 -c "
import sys
sys.path.insert(0, 'data-service')
import asyncio
from db import db

async def check():
    async with db.get_connection() as conn:
        cursor = await conn.execute(
            'SELECT COUNT(*) as count FROM Influencer WHERE accountId = ?',
            ('72844725',)
        )
        row = await cursor.fetchone()
        print(row['count'] if row else 0)

asyncio.run(check())
" 2>/dev/null || echo "0")

if [ "$INFLUENCER_EXISTS" = "0" ]; then
    echo "❌ 大V记录不存在，正在创建..."
    python3 -c "
import sys
sys.path.insert(0, 'data-service')
import asyncio
from datetime import datetime
from db import db

async def create():
    async with db.get_connection() as conn:
        influencer_id = 'inf_bilibili_72844725'
        created_at = datetime.now().isoformat()

        await conn.execute('''
            INSERT INTO Influencer (
                id, name, platform, accountId, driverType,
                fetchInterval, priority, isActive,
                profileUrl, createdAt, updatedAt
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            influencer_id,
            '二狗学长好',
            'bilibili',
            '72844725',
            'api',
            180,  # 3小时采集一次
            'medium',
            1,
            'https://space.bilibili.com/72844725',
            created_at,
            created_at
        ))
        print('✓ 大V记录已创建')

asyncio.run(create())
"
else
    echo "✓ 大V记录已存在"
fi

echo ""
echo "================================================"
echo "  步骤 1: 获取 Bilibili Cookie"
echo "================================================"
echo ""
echo "请按照以下步骤操作："
echo ""
echo "1. 在浏览器中访问: https://www.bilibili.com"
echo "2. 登录你的 Bilibili 账号"
echo "3. 按 F12 打开开发者工具"
echo "4. 选择 Application (Chrome) 或 Storage (Firefox) 标签"
echo "5. 左侧展开 Cookies → https://www.bilibili.com"
echo "6. 找到并复制以下三个 Cookie 的值："
echo "   - SESSDATA"
echo "   - bili_jct"
echo "   - DedeUserID"
echo ""
echo "准备好后按回车继续..."
read

echo ""
echo "================================================"
echo "  步骤 2: 配置 Cookie"
echo "================================================"
echo ""

# 运行配置工具
python3 configure-bilibili-cookie.py

echo ""
echo "================================================"
echo "  配置完成!"
echo "================================================"
echo ""
echo "下一步操作："
echo ""
echo "1. 测试采集功能:"
echo "   python3 test-bilibili-influencer.py"
echo ""
echo "2. 启动数据服务:"
echo "   cd data-service && python main.py"
echo ""
echo "3. 手动触发采集:"
echo "   curl -X POST http://localhost:8000/api/influencers/inf_bilibili_72844725/fetch"
echo ""
echo "4. 查看大V列表:"
echo "   curl http://localhost:8000/api/influencers?platform=bilibili"
echo ""
echo "5. 验证 Cookie 有效性:"
echo "   python3 configure-bilibili-cookie.py --verify"
echo ""
echo "📖 详细文档请查看:"
echo "   - docs/bilibili-fix-summary.md"
echo "   - docs/bilibili-cookie-setup.md"
echo ""
