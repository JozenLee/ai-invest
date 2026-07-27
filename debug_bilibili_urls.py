#!/usr/bin/env python3
"""
Debug script to check Bilibili dynamic URLs
"""
import asyncio
import aiohttp
import json

async def fetch_bilibili_dynamics(uid: str):
    """Fetch dynamics and inspect URL structure"""
    url = "https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/space"
    params = {'host_mid': uid}
    headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Referer': f'https://space.bilibili.com/{uid}'
    }

    async with aiohttp.ClientSession() as session:
        await asyncio.sleep(1)
        async with session.get(url, params=params, headers=headers) as response:
            if response.status == 200:
                result = await response.json()
                if result.get('code') == 0:
                    items = result.get('data', {}).get('items', [])

                    print(f"Found {len(items)} dynamics\n")

                    for i, item in enumerate(items[:3], 1):
                        print(f"=== Dynamic {i} ===")
                        print(f"Type: {item.get('type')}")
                        print(f"ID (id_str): {item.get('id_str')}")

                        basic = item.get('basic', {})
                        print(f"RID (rid_str): {basic.get('rid_str')}")

                        # Check what URL we would generate
                        dynamic_id = item.get('id_str', '')
                        dynamic_type = item.get('type', '')
                        rid_str = basic.get('rid_str', '')

                        if dynamic_type == 'DYNAMIC_TYPE_AV':
                            url = f"https://www.bilibili.com/video/av{rid_str}" if rid_str else f"https://www.bilibili.com/opus/{dynamic_id}"
                        elif dynamic_type == 'DYNAMIC_TYPE_ARTICLE':
                            url = f"https://www.bilibili.com/read/cv{rid_str}" if rid_str else f"https://www.bilibili.com/opus/{dynamic_id}"
                        else:
                            url = f"https://www.bilibili.com/opus/{dynamic_id}"

                        print(f"Generated URL: {url}")

                        # Get content preview
                        modules = item.get('modules', {})
                        module_dynamic = modules.get('module_dynamic', {})
                        desc = module_dynamic.get('desc', {})
                        content = desc.get('text', '') if isinstance(desc, dict) else ''
                        print(f"Content: {content[:50]}...")
                        print()
                else:
                    print(f"API Error: {result.get('code')} - {result.get('message')}")
            else:
                print(f"HTTP Error: {response.status}")

if __name__ == '__main__':
    # Test with the account ID from database
    asyncio.run(fetch_bilibili_dynamics('19642026'))
