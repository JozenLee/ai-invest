#!/bin/bash
# Bilibili Cookie 简易配置脚本
# 使用方法: ./simple-cookie-config.sh

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║     Bilibili Cookie 简易配置                                  ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "请按照以下步骤操作："
echo ""
echo "【步骤 1】获取 Cookie"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "1. 打开浏览器，访问: https://www.bilibili.com"
echo "2. 登录你的账号（建议使用专用小号）"
echo "3. 按 F12 打开开发者工具"
echo "4. 点击顶部 'Application' 标签（Firefox 是 'Storage'）"
echo "5. 左侧展开 'Cookies' → 点击 'https://www.bilibili.com'"
echo "6. 在右侧列表中找到并复制以下三个值："
echo ""
echo "   • SESSDATA   (约40-50个字符的长字符串)"
echo "   • bili_jct   (32个字符)"
echo "   • DedeUserID (纯数字)"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "【步骤 2】输入 Cookie"
echo ""

# 读取 Cookie 值
read -p "请输入 SESSDATA: " SESSDATA
read -p "请输入 bili_jct: " BILI_JCT
read -p "请输入 DedeUserID: " DEDEUSERID

# 验证输入
if [ -z "$SESSDATA" ] || [ -z "$BILI_JCT" ] || [ -z "$DEDEUSERID" ]; then
    echo ""
    echo "❌ 错误: Cookie 值不能为空"
    exit 1
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "【步骤 3】保存配置"
echo ""

# 保存到数据库
python3 << PYTHON_SCRIPT
import sys
sys.path.insert(0, 'data-service')
import asyncio
import json
from db import db

async def save():
    config = {
        'cookies': {
            'SESSDATA': '$SESSDATA',
            'bili_jct': '$BILI_JCT',
            'DedeUserID': '$DEDEUSERID'
        },
        'retry_delay': 3,
        'max_retries': 3
    }

    async with db.get_connection() as conn:
        result = await conn.execute(
            'UPDATE Influencer SET providerConfig = ?, updatedAt = datetime("now") WHERE platform = "bilibili"',
            (json.dumps(config),)
        )
        count = result.rowcount

    if count > 0:
        print(f'✓ 已更新 {count} 个 Bilibili 大V 的配置')
        return True
    else:
        print('⚠️  未找到 Bilibili 大V记录')
        return False

success = asyncio.run(save())
sys.exit(0 if success else 1)
PYTHON_SCRIPT

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ 配置成功！"
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "【下一步】测试采集功能"
    echo ""
    echo "运行测试脚本:"
    echo "  python3 test-bilibili-influencer.py"
    echo ""
    echo "或手动触发采集:"
    echo "  curl -X POST http://localhost:8000/api/influencers/inf_bilibili_72844725/fetch"
    echo ""
else
    echo ""
    echo "❌ 配置失败，请检查错误信息"
fi
