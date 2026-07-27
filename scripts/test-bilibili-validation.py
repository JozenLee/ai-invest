#!/usr/bin/env python3
"""
测试B站账号验证功能
测试ID: 21262795
"""
import asyncio
import aiohttp
import json

async def test_validate():
    url = "http://localhost:8000/api/influencers/validate"
    data = {
        "platform": "bilibili",
        "accountId": "21262795"
    }

    print(f"🧪 测试B站账号验证: {data['accountId']}")
    print("-" * 60)

    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=data, timeout=aiohttp.ClientTimeout(total=30)) as response:
                result = await response.json()

                print(f"📊 HTTP状态码: {response.status}")
                print(f"📦 响应数据:")
                print(json.dumps(result, indent=2, ensure_ascii=False))

                if response.status == 200 and result.get('success'):
                    print("\n✅ 验证成功！")
                    user_data = result.get('data', {})
                    print(f"   - 名称: {user_data.get('name')}")
                    print(f"   - 分类: {user_data.get('category')}")
                    print(f"   - 粉丝数: {user_data.get('followersCount')}")
                    print(f"   - 认证: {'是' if user_data.get('verified') else '否'}")
                else:
                    print("\n❌ 验证失败")
                    print(f"   错误信息: {result.get('detail', '未知错误')}")

    except asyncio.TimeoutError:
        print("❌ 请求超时")
    except Exception as e:
        print(f"❌ 请求异常: {e}")

if __name__ == "__main__":
    asyncio.run(test_validate())
