#!/usr/bin/env python3
"""
测试 Bilibili Provider 是否能正确采集数据
"""
import asyncio
import sys
import json
sys.path.insert(0, '/Users/jozen.lee/ai-softwares/ai-invest/data-service')

from providers.bilibili_provider import BilibiliAPIProvider
from datetime import datetime, timedelta

async def test_bilibili_provider():
    # 配置
    config = {
        "cookie_str": "buvid3=51FA823E-7AF3-5F7D-BB07-B72C22363B5339905infoc; b_nut=1785051839; __at_once=6570465386960595609; buvid4=A7EE7D8E-6695-27CD-EF62-40F0AEB7225A41926-026072615-HrqsLcwFLziVgdqSzm6v2w%3D%3D; buvid_fp=eb3b101611ad74070a3f9321e03ba2fd; _uuid=33257183-699F-19A10-298D-F5710910622D10232768infoc; CURRENT_FNVAL=2000; PVID=1; SESSDATA=63c74f32%2C1800631301%2Cb7b28%2A72CjAIHi-ky1LS1QmPLNz_av5UZPOyKdA0hhDs0P3d8Bv2HaDUHgftiP0AxFPWp4NK7CMSVmNmTUs0TTlZMlZsalhxUlNMUU9Va1hhd0JSU3JtdnQ0VGdfTlEtZTRyNjY5anlkenlGbVA1MDZ3MXdfTlY3WDVPd3A1ajh6cWRFWnVuUWczRDRFSzBnIIEC; bili_jct=115cb7c7474c92016269ebfd93caa63b; DedeUserID=472453800; DedeUserID__ckMd5=d1e673059caf9ff3; sid=7f78oa66; theme-tip-show=SHOWED; hit-dyn-v2=1; bili_ticket=eyJhbGciOiJIUzI1NiIsImtpZCI6InMwMyIsInR5cCI6IkpXVCJ9.eyJleHAiOjE3ODUzNDY0OTEsImlhdCI6MTc4NTA4NzIzMSwicGx0IjotMX0.e2sBClQLW-zJh96igfWi7koTnGDkOn44cYocXru7-BQ; bili_ticket_expires=1785346431; theme-avatar-tip-show=SHOWED; bp_t_offset_472453800=1229437575345733632; b_lsid=21F55550_19F9F9AE1E1",
        "retry_delay": 2,
        "max_retries": 3
    }

    account_id = "72844725"

    print("=" * 60)
    print("测试 Bilibili Provider")
    print("=" * 60)
    print()

    # 初始化 provider
    provider = BilibiliAPIProvider(config)
    print(f"✅ Provider 已初始化")
    print(f"   - Cookies 数量: {len(provider.cookies)}")
    print()

    # 测试获取用户信息
    print("1. 测试获取用户信息...")
    user_info = await provider.fetch_user_info(account_id)
    if user_info:
        print(f"   ✅ 用户名: {user_info.get('name')}")
        print(f"   ✅ 粉丝数: {user_info.get('followers_count')}")
        print(f"   ✅ 分类: {user_info.get('category')}")
    else:
        print("   ❌ 获取用户信息失败")
    print()

    # 测试获取动态
    print("2. 测试获取最近30天的动态...")
    since = datetime.now() - timedelta(days=30)
    posts = await provider.fetch_user_posts(account_id, since=since, limit=100)

    print(f"   ✅ 获取到 {len(posts)} 条动态")
    print()

    if posts:
        print("3. 动态列表预览:")
        for i, post in enumerate(posts[:10]):
            pub_time = post.get('publish_time')
            content = post.get('content', '')[:50]
            print(f"   [{i+1}] {pub_time} - {content}")
    else:
        print("   ⚠️ 没有获取到任何动态")

    print()
    print("=" * 60)
    print("测试完成")
    print("=" * 60)

if __name__ == '__main__':
    asyncio.run(test_bilibili_provider())
