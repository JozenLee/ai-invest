#!/usr/bin/env python3
"""
调试 Bilibili API 响应格式
查看原始 API 返回的数据结构
"""

import asyncio
import json
import sys
import os
import aiohttp

# Add data-service to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'data-service'))

from db import db


async def debug_bilibili_api():
    """调试 Bilibili API"""

    account_id = "72844725"

    print("=" * 60)
    print("调试 Bilibili API 响应格式")
    print("=" * 60)

    # 获取平台配置
    async with db.get_connection() as conn:
        cursor = await conn.execute(
            "SELECT configData FROM PlatformConfig WHERE platform = 'bilibili' AND isActive = 1"
        )
        config_row = await cursor.fetchone()

    if config_row:
        config = json.loads(config_row['configData'])
        print(f"\n✓ 使用平台配置的 Cookie")
    else:
        print("\n✗ 未找到平台配置")
        config = {}

    # 解析 Cookie
    cookies = {}
    cookie_str = config.get('cookie_str', '')
    if cookie_str:
        for item in cookie_str.split('; '):
            if '=' in item:
                key, value = item.split('=', 1)
                cookies[key.strip()] = value.strip()

    # 调用 Bilibili API
    url = "https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/space"
    params = {'host_mid': account_id}
    headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Referer': f'https://space.bilibili.com/{account_id}',
        'Origin': 'https://space.bilibili.com'
    }

    print(f"\n请求 URL: {url}")
    print(f"参数: {params}")

    async with aiohttp.ClientSession(cookies=cookies) as session:
        await asyncio.sleep(1)

        async with session.get(url, params=params, headers=headers) as response:
            print(f"\nHTTP Status: {response.status}")

            if response.status == 200:
                result = await response.json()
                print(f"API Code: {result.get('code')}")
                print(f"API Message: {result.get('message')}")

                if result.get('code') == 0:
                    data = result.get('data', {})
                    items = data.get('items', [])
                    print(f"\n返回动态数: {len(items)}")

                    # 打印前2条动态的完整结构
                    for i, item in enumerate(items[:2], 1):
                        print(f"\n{'=' * 60}")
                        print(f"动态 #{i} 完整结构:")
                        print(f"{'=' * 60}")
                        print(json.dumps(item, indent=2, ensure_ascii=False))

                    # 分析结构
                    if items:
                        print(f"\n{'=' * 60}")
                        print("结构分析:")
                        print(f"{'=' * 60}")

                        first_item = items[0]
                        modules = first_item.get('modules', {})

                        print(f"\n可用的 modules 键:")
                        for key in modules.keys():
                            print(f"  - {key}")

                        # 检查 module_dynamic
                        module_dynamic = modules.get('module_dynamic', {})
                        print(f"\nmodule_dynamic 类型: {type(module_dynamic)}")
                        if module_dynamic:
                            print(f"module_dynamic 键: {list(module_dynamic.keys())}")

                            # 检查 desc
                            desc = module_dynamic.get('desc')
                            print(f"\ndesc 类型: {type(desc)}")
                            print(f"desc 值: {desc}")

                        # 检查 module_author
                        module_author = modules.get('module_author', {})
                        print(f"\nmodule_author: {module_author}")

                else:
                    print(f"\n✗ API 返回错误")
            else:
                print(f"\n✗ HTTP 请求失败")


if __name__ == "__main__":
    asyncio.run(debug_bilibili_api())
