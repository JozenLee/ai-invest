"""
调试 NewsNow API 响应格式
"""

import requests
import json

BASE_URL = "https://newsnow.busiyi.world/api/s"

headers = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    "Referer": "https://newsnow.busiyi.world/",
}

platforms = ["wallstreetcn-hot", "cls-hot", "thepaper"]

for platform_id in platforms:
    print(f"\n{'=' * 80}")
    print(f"测试平台: {platform_id}")
    print("=" * 80)

    try:
        params = {"id": platform_id}

        response = requests.get(BASE_URL, params=params, headers=headers, timeout=10)
        print(f"状态码: {response.status_code}")

        if response.status_code == 200:
            data = response.json()
            print(f"响应类型: {type(data)}")

            if isinstance(data, dict):
                print(f"响应keys: {list(data.keys())}")

                # 检查可能的数据位置
                if "data" in data:
                    print(f"data字段类型: {type(data['data'])}")
                    if isinstance(data['data'], list) and len(data['data']) > 0:
                        print(f"data条目数: {len(data['data'])}")
                        print(f"第一条数据keys: {list(data['data'][0].keys()) if isinstance(data['data'][0], dict) else 'N/A'}")

            print(f"\n完整响应 (前800字符):")
            print(json.dumps(data, ensure_ascii=False, indent=2)[:800])
        else:
            print(f"请求失败: {response.status_code}")
            print(f"响应内容: {response.text[:200]}")

    except Exception as e:
        print(f"错误: {str(e)}")
        import traceback
        traceback.print_exc()

