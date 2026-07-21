"""
调试NewsNow API实际响应格式
"""

import asyncio
import json
import requests


async def debug_newsnow_api():
    """调试NewsNow API返回的数据结构"""

    BASE_URL = "https://newsnow.busiyi.world/api/s"

    platforms = ["wallstreetcn-hot", "cls-hot", "thepaper"]

    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Accept": "application/json, text/plain, */*",
    }

    for platform_id in platforms:
        print(f"\n{'='*80}")
        print(f"平台: {platform_id}")
        print(f"{'='*80}")

        try:
            params = {"id": platform_id}
            response = requests.get(BASE_URL, params=params, headers=headers, timeout=10)
            response.raise_for_status()

            print(f"状态码: {response.status_code}")
            print(f"响应头 Content-Type: {response.headers.get('Content-Type')}")

            data = response.json()

            # 打印数据结构
            print(f"\n响应数据类型: {type(data)}")
            if isinstance(data, dict):
                print(f"顶级键: {list(data.keys())}")

                # 检查数据列表
                items = data.get("data", data.get("items", data.get("list", [])))
                if items and len(items) > 0:
                    print(f"\n数据列表长度: {len(items)}")
                    print(f"\n第一条数据的键: {list(items[0].keys())}")
                    print(f"\n第一条数据示例:")
                    print(json.dumps(items[0], ensure_ascii=False, indent=2))
                else:
                    print("\n未找到数据列表")

            elif isinstance(data, list):
                print(f"数组长度: {len(data)}")
                if len(data) > 0:
                    print(f"\n第一条数据的键: {list(data[0].keys())}")
                    print(f"\n第一条数据示例:")
                    print(json.dumps(data[0], ensure_ascii=False, indent=2))

        except Exception as e:
            print(f"请求失败: {e}")


if __name__ == "__main__":
    asyncio.run(debug_newsnow_api())
