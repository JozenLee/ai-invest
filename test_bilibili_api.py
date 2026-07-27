#!/usr/bin/env python3
"""
Test Bilibili API to see the actual dynamic ID structure
"""
import aiohttp
import asyncio
import json

async def fetch_dynamics(uid: str):
    """Fetch dynamics and print raw structure"""
    url = "https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/space"
    params = {'host_mid': uid}

    # Load cookie from config
    try:
        with open('data-service/config/bilibili_config.json', 'r') as f:
            config = json.load(f)
            cookie_str = config.get('cookie_str', '')
    except:
        cookie_str = ''

    cookies = {}
    if cookie_str:
        for item in cookie_str.split('; '):
            if '=' in item:
                key, value = item.split('=', 1)
                cookies[key.strip()] = value.strip()

    headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': f'https://space.bilibili.com/{uid}',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    }

    async with aiohttp.ClientSession(cookies=cookies) as session:
        await asyncio.sleep(1.5)
        async with session.get(url, params=params, headers=headers, timeout=aiohttp.ClientTimeout(total=10)) as response:
            print(f"HTTP Status: {response.status}")
            if response.status == 200:
                result = await response.json()
                code = result.get('code')
                print(f"API Code: {code}")

                if code == 0:
                    items = result.get('data', {}).get('items', [])
                    print(f"\nFound {len(items)} dynamics\n")

                    for i, item in enumerate(items[:3], 1):
                        print(f"{'='*60}")
                        print(f"Dynamic {i}")
                        print(f"{'='*60}")

                        # Key IDs
                        print(f"id_str: {item.get('id_str')}")
                        print(f"type: {item.get('type')}")

                        basic = item.get('basic', {})
                        print(f"basic.rid_str: {basic.get('rid_str')}")
                        print(f"basic.comment_id_str: {basic.get('comment_id_str')}")

                        # Get content
                        modules = item.get('modules', {})
                        module_dynamic = modules.get('module_dynamic', {})
                        desc = module_dynamic.get('desc')
                        if desc and isinstance(desc, dict):
                            content = desc.get('text', '')[:50]
                            print(f"content: {content}...")

                        # Try to construct different URLs
                        dynamic_id = item.get('id_str', '')
                        rid_str = basic.get('rid_str', '')
                        comment_id = basic.get('comment_id_str', '')

                        print(f"\nPossible URLs:")
                        print(f"1. opus format: https://www.bilibili.com/opus/{dynamic_id}")
                        print(f"2. t.bilibili format: https://t.bilibili.com/{dynamic_id}")
                        print(f"3. using rid_str: https://t.bilibili.com/{rid_str}")
                        print(f"4. using comment_id: https://t.bilibili.com/{comment_id}")
                        print()
                else:
                    print(f"API Error: {result.get('message')}")
            else:
                text = await response.text()
                print(f"Error: {text[:200]}")

if __name__ == '__main__':
    # Test with 钞能力毛毛
    asyncio.run(fetch_dynamics('21262795'))
