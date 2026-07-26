#!/usr/bin/env python3
"""
Bilibili Cookie 配置和验证工具

用法:
    # 交互式配置
    python3 configure-bilibili-cookie.py

    # 命令行配置
    python3 configure-bilibili-cookie.py --sessdata "xxx" --bili-jct "yyy" --dedeuserid "zzz"

    # 验证现有配置
    python3 configure-bilibili-cookie.py --verify
"""
import sys
import asyncio
import json
import argparse
import logging

sys.path.insert(0, 'data-service')

from db import db
from providers.bilibili_provider import BilibiliAPIProvider

logging.basicConfig(
    level=logging.INFO,
    format='%(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


async def get_current_config(influencer_id: str) -> dict:
    """获取当前配置"""
    async with db.get_connection() as conn:
        cursor = await conn.execute(
            "SELECT providerConfig FROM Influencer WHERE id = ?",
            (influencer_id,)
        )
        row = await cursor.fetchone()

        if row and row['providerConfig']:
            return json.loads(row['providerConfig'])
        return {}


async def update_cookie_config(
    influencer_id: str,
    sessdata: str,
    bili_jct: str,
    dedeuserid: str
) -> bool:
    """更新 Cookie 配置"""
    try:
        config = {
            "cookies": {
                "SESSDATA": sessdata.strip(),
                "bili_jct": bili_jct.strip(),
                "DedeUserID": dedeuserid.strip()
            },
            "retry_delay": 3,
            "max_retries": 3
        }

        async with db.get_connection() as conn:
            await conn.execute(
                """UPDATE Influencer
                   SET providerConfig = ?, updatedAt = datetime('now')
                   WHERE id = ?""",
                (json.dumps(config), influencer_id)
            )

        logger.info(f"✓ Cookie 配置已更新: {influencer_id}")
        return True

    except Exception as e:
        logger.error(f"✗ 更新失败: {e}")
        return False


async def verify_cookie(
    sessdata: str,
    bili_jct: str,
    dedeuserid: str,
    test_uid: str = "72844725"
) -> bool:
    """验证 Cookie 是否有效"""
    logger.info("验证 Cookie 有效性...")

    config = {
        "cookies": {
            "SESSDATA": sessdata.strip(),
            "bili_jct": bili_jct.strip(),
            "DedeUserID": dedeuserid.strip()
        },
        "retry_delay": 2,
        "max_retries": 2
    }

    provider = BilibiliAPIProvider(config)

    # 测试获取用户信息
    user_info = await provider.fetch_user_info(test_uid)

    if user_info and user_info.get('name'):
        logger.info(f"✓ Cookie 有效!")
        logger.info(f"  测试账号: {user_info.get('name')}")
        logger.info(f"  粉丝数: {user_info.get('followers_count')}")
        return True
    else:
        logger.error("✗ Cookie 无效或已过期")
        return False


async def interactive_configure():
    """交互式配置"""
    print("=" * 60)
    print("Bilibili Cookie 配置向导")
    print("=" * 60)
    print()
    print("请按照以下步骤获取 Cookie:")
    print("1. 浏览器登录 https://www.bilibili.com")
    print("2. 按 F12 打开开发者工具")
    print("3. 点击 Application (Chrome) 或 Storage (Firefox)")
    print("4. 左侧展开 Cookies → https://www.bilibili.com")
    print("5. 复制以下三个 Cookie 的值")
    print()

    # 输入 Cookie
    sessdata = input("请输入 SESSDATA: ").strip()
    if not sessdata:
        logger.error("SESSDATA 不能为空")
        return False

    bili_jct = input("请输入 bili_jct: ").strip()
    if not bili_jct:
        logger.error("bili_jct 不能为空")
        return False

    dedeuserid = input("请输入 DedeUserID: ").strip()
    if not dedeuserid:
        logger.error("DedeUserID 不能为空")
        return False

    print()
    logger.info("正在验证 Cookie...")

    # 验证 Cookie
    is_valid = await verify_cookie(sessdata, bili_jct, dedeuserid)

    if not is_valid:
        print()
        choice = input("Cookie 验证失败，是否仍要保存配置? (y/N): ").strip().lower()
        if choice != 'y':
            logger.info("已取消配置")
            return False

    print()
    logger.info("正在保存配置...")

    # 更新所有 Bilibili 大V 的配置
    async with db.get_connection() as conn:
        cursor = await conn.execute(
            "SELECT id, name FROM Influencer WHERE platform = 'bilibili'"
        )
        influencers = await cursor.fetchall()

    if not influencers:
        logger.warning("未找到 Bilibili 大V 记录")
        return False

    success_count = 0
    for inf in influencers:
        success = await update_cookie_config(
            inf['id'],
            sessdata,
            bili_jct,
            dedeuserid
        )
        if success:
            success_count += 1
            logger.info(f"  ✓ {inf['name']} ({inf['id']})")

    print()
    logger.info(f"配置完成! 已更新 {success_count}/{len(influencers)} 个大V")

    # 询问是否测试采集
    print()
    choice = input("是否运行采集测试? (y/N): ").strip().lower()
    if choice == 'y':
        logger.info("运行测试脚本...")
        import subprocess
        subprocess.run([sys.executable, "test-bilibili-influencer.py"])

    return True


async def verify_existing_config():
    """验证现有配置"""
    logger.info("检查现有 Bilibili 大V 配置...")

    async with db.get_connection() as conn:
        cursor = await conn.execute(
            "SELECT id, name, accountId, providerConfig FROM Influencer WHERE platform = 'bilibili'"
        )
        influencers = await cursor.fetchall()

    if not influencers:
        logger.warning("未找到 Bilibili 大V 记录")
        return False

    logger.info(f"找到 {len(influencers)} 个 Bilibili 大V:")
    print()

    for inf in influencers:
        print(f"大V: {inf['name']} (UID: {inf['accountId']})")

        if not inf['providerConfig']:
            print("  ✗ 未配置 Cookie")
            continue

        try:
            config = json.loads(inf['providerConfig'])
            cookies = config.get('cookies', {})

            if not cookies:
                print("  ✗ 未配置 Cookie")
                continue

            # 检查 Cookie 字段
            has_sessdata = bool(cookies.get('SESSDATA'))
            has_bili_jct = bool(cookies.get('bili_jct'))
            has_dedeuserid = bool(cookies.get('DedeUserID'))

            if has_sessdata and has_bili_jct and has_dedeuserid:
                print("  ✓ Cookie 已配置")

                # 验证有效性
                is_valid = await verify_cookie(
                    cookies['SESSDATA'],
                    cookies['bili_jct'],
                    cookies['DedeUserID'],
                    inf['accountId']
                )

                if is_valid:
                    print("  ✓ Cookie 有效")
                else:
                    print("  ✗ Cookie 无效或已过期")
            else:
                print("  ✗ Cookie 配置不完整")
                if not has_sessdata:
                    print("    缺少 SESSDATA")
                if not has_bili_jct:
                    print("    缺少 bili_jct")
                if not has_dedeuserid:
                    print("    缺少 DedeUserID")

        except Exception as e:
            print(f"  ✗ 配置解析失败: {e}")

        print()

    return True


async def main():
    parser = argparse.ArgumentParser(description="Bilibili Cookie 配置工具")
    parser.add_argument("--sessdata", help="SESSDATA cookie 值")
    parser.add_argument("--bili-jct", help="bili_jct cookie 值")
    parser.add_argument("--dedeuserid", help="DedeUserID cookie 值")
    parser.add_argument("--verify", action="store_true", help="验证现有配置")
    parser.add_argument("--influencer-id", default="inf_bilibili_72844725", help="大V ID")

    args = parser.parse_args()

    try:
        # 验证模式
        if args.verify:
            await verify_existing_config()
            return 0

        # 命令行模式
        if args.sessdata and args.bili_jct and args.dedeuserid:
            logger.info("使用命令行参数配置...")

            # 验证 Cookie
            is_valid = await verify_cookie(
                args.sessdata,
                args.bili_jct,
                args.dedeuserid
            )

            if not is_valid:
                logger.warning("Cookie 验证失败，但仍将保存配置")

            # 更新配置
            success = await update_cookie_config(
                args.influencer_id,
                args.sessdata,
                args.bili_jct,
                args.dedeuserid
            )

            return 0 if success else 1

        # 交互式模式
        success = await interactive_configure()
        return 0 if success else 1

    except KeyboardInterrupt:
        print()
        logger.info("已取消操作")
        return 1
    except Exception as e:
        logger.error(f"操作失败: {e}", exc_info=True)
        return 1


if __name__ == '__main__':
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
