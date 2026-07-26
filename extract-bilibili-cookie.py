#!/usr/bin/env python3
"""
Bilibili Cookie 自动提取工具（需要浏览器支持）

功能：
1. 尝试从浏览器 Cookie 存储中读取 Bilibili Cookie
2. 自动配置到系统中
3. 验证有效性

支持的浏览器：
- Chrome/Chromium
- Firefox
- Safari
- Edge
"""

import sys
import os
import json
import sqlite3
import platform
from pathlib import Path

def get_chrome_cookie_path():
    """获取 Chrome Cookie 数据库路径"""
    system = platform.system()

    if system == "Darwin":  # macOS
        paths = [
            Path.home() / "Library/Application Support/Google/Chrome/Default/Cookies",
            Path.home() / "Library/Application Support/Chromium/Default/Cookies",
            Path.home() / "Library/Application Support/Microsoft Edge/Default/Cookies",
        ]
    elif system == "Windows":
        paths = [
            Path(os.environ.get("LOCALAPPDATA", "")) / "Google/Chrome/User Data/Default/Cookies",
            Path(os.environ.get("LOCALAPPDATA", "")) / "Microsoft/Edge/User Data/Default/Cookies",
        ]
    elif system == "Linux":
        paths = [
            Path.home() / ".config/google-chrome/Default/Cookies",
            Path.home() / ".config/chromium/Default/Cookies",
        ]
    else:
        return None

    for path in paths:
        if path.exists():
            return path

    return None


def get_firefox_cookie_path():
    """获取 Firefox Cookie 数据库路径"""
    system = platform.system()

    if system == "Darwin":  # macOS
        profile_dir = Path.home() / "Library/Application Support/Firefox/Profiles"
    elif system == "Windows":
        profile_dir = Path(os.environ.get("APPDATA", "")) / "Mozilla/Firefox/Profiles"
    elif system == "Linux":
        profile_dir = Path.home() / ".mozilla/firefox"
    else:
        return None

    if not profile_dir.exists():
        return None

    # 查找默认配置文件
    for profile in profile_dir.iterdir():
        if profile.is_dir() and "default" in profile.name.lower():
            cookie_file = profile / "cookies.sqlite"
            if cookie_file.exists():
                return cookie_file

    return None


def extract_bilibili_cookies_chrome(cookie_path):
    """从 Chrome Cookie 数据库提取 Bilibili Cookie"""
    try:
        # Chrome Cookie 数据库通常被锁定，需要复制
        import shutil
        import tempfile

        temp_dir = tempfile.mkdtemp()
        temp_cookie = Path(temp_dir) / "cookies.db"
        shutil.copy2(cookie_path, temp_cookie)

        conn = sqlite3.connect(temp_cookie)
        cursor = conn.cursor()

        # Chrome Cookie 表结构
        cursor.execute("""
            SELECT name, value, encrypted_value
            FROM cookies
            WHERE host_key LIKE '%bilibili.com%'
            AND name IN ('SESSDATA', 'bili_jct', 'DedeUserID')
        """)

        cookies = {}
        for name, value, encrypted_value in cursor.fetchall():
            # Chrome 可能加密 Cookie，需要解密
            if value:
                cookies[name] = value
            elif encrypted_value:
                # 解密逻辑（需要额外的库）
                print(f"⚠️  {name} 已加密，需要手动获取")

        conn.close()

        # 清理临时文件
        os.remove(temp_cookie)
        os.rmdir(temp_dir)

        return cookies

    except Exception as e:
        print(f"❌ Chrome Cookie 提取失败: {e}")
        return {}


def extract_bilibili_cookies_firefox(cookie_path):
    """从 Firefox Cookie 数据库提取 Bilibili Cookie"""
    try:
        import shutil
        import tempfile

        temp_dir = tempfile.mkdtemp()
        temp_cookie = Path(temp_dir) / "cookies.db"
        shutil.copy2(cookie_path, temp_cookie)

        conn = sqlite3.connect(temp_cookie)
        cursor = conn.cursor()

        # Firefox Cookie 表结构
        cursor.execute("""
            SELECT name, value
            FROM moz_cookies
            WHERE host LIKE '%bilibili.com%'
            AND name IN ('SESSDATA', 'bili_jct', 'DedeUserID')
        """)

        cookies = {}
        for name, value in cursor.fetchall():
            cookies[name] = value

        conn.close()

        # 清理临时文件
        os.remove(temp_cookie)
        os.rmdir(temp_dir)

        return cookies

    except Exception as e:
        print(f"❌ Firefox Cookie 提取失败: {e}")
        return {}


def main():
    print("=" * 60)
    print("Bilibili Cookie 自动提取工具")
    print("=" * 60)
    print()

    print("⚠️  重要提醒:")
    print("  • 请确保浏览器已关闭（避免数据库锁定）")
    print("  • 请确保已登录 Bilibili")
    print("  • Chrome Cookie 可能被加密，需要手动获取")
    print()

    cookies = {}

    # 尝试 Chrome
    print("🔍 查找 Chrome Cookie...")
    chrome_path = get_chrome_cookie_path()
    if chrome_path:
        print(f"  ✓ 找到: {chrome_path}")
        cookies = extract_bilibili_cookies_chrome(chrome_path)
    else:
        print("  ✗ 未找到 Chrome Cookie")

    # 如果 Chrome 失败，尝试 Firefox
    if not cookies:
        print()
        print("🔍 查找 Firefox Cookie...")
        firefox_path = get_firefox_cookie_path()
        if firefox_path:
            print(f"  ✓ 找到: {firefox_path}")
            cookies = extract_bilibili_cookies_firefox(firefox_path)
        else:
            print("  ✗ 未找到 Firefox Cookie")

    print()
    print("=" * 60)
    print("提取结果")
    print("=" * 60)

    if cookies:
        print()
        for name in ['SESSDATA', 'bili_jct', 'DedeUserID']:
            if name in cookies:
                value = cookies[name]
                masked = value[:8] + "..." + value[-8:] if len(value) > 16 else value
                print(f"✓ {name}: {masked}")
            else:
                print(f"✗ {name}: 未找到")

        # 检查是否完整
        if all(name in cookies for name in ['SESSDATA', 'bili_jct', 'DedeUserID']):
            print()
            print("✅ Cookie 完整！正在配置...")

            # 调用配置工具
            sys.path.insert(0, 'data-service')
            import asyncio
            from db import db

            async def save_config():
                config = {
                    'cookies': cookies,
                    'retry_delay': 3,
                    'max_retries': 3
                }

                async with db.get_connection() as conn:
                    await conn.execute(
                        'UPDATE Influencer SET providerConfig = ?, updatedAt = datetime("now") WHERE platform = "bilibili"',
                        (json.dumps(config),)
                    )

                print("✓ Cookie 已保存到数据库")

            asyncio.run(save_config())

            print()
            print("🚀 下一步: 运行测试")
            print("  python3 test-bilibili-influencer.py")

        else:
            print()
            print("⚠️  Cookie 不完整，请手动配置:")
            print("  python3 configure-bilibili-cookie.py")

    else:
        print()
        print("❌ 无法自动提取 Cookie")
        print()
        print("可能的原因:")
        print("  • 浏览器未关闭（数据库被锁定）")
        print("  • 未登录 Bilibili")
        print("  • Cookie 被加密（Chrome）")
        print("  • 浏览器不支持")
        print()
        print("📖 请使用手动配置:")
        print("  python3 configure-bilibili-cookie.py")
        print()
        print("或查看详细指南:")
        print("  docs/bilibili-cookie-setup.md")


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print()
        print("已取消")
    except Exception as e:
        print(f"❌ 错误: {e}", file=sys.stderr)
        sys.exit(1)
