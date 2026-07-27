#!/usr/bin/env python3
"""
初始化平台配置到数据库
"""
import asyncio
import sys
import json
from datetime import datetime

sys.path.insert(0, '/Users/jozen.lee/ai-softwares/ai-invest/data-service')

from database import Database

async def init_bilibili_config():
    """初始化 Bilibili 平台配置"""
    db = Database()

    platform = "bilibili"
    display_name = "Bilibili（B站）"

    config_data = {
        "cookie_str": "buvid3=51FA823E-7AF3-5F7D-BB07-B72C22363B5339905infoc; b_nut=1785051839; __at_once=6570465386960595609; buvid4=A7EE7D8E-6695-27CD-EF62-40F0AEB7225A41926-026072615-HrqsLcwFLziVgdqSzm6v2w%3D%3D; buvid_fp=eb3b101611ad74070a3f9321e03ba2fd; _uuid=33257183-699F-19A10-298D-F5710910622D10232768infoc; CURRENT_FNVAL=2000; PVID=1; SESSDATA=63c74f32%2C1800631301%2Cb7b28%2A72CjAIHi-ky1LS1QmPLNz_av5UZPOyKdA0hhDs0P3d8Bv2HaDUHgftiP0AxFPWp4NK7CMSVmNmTUs0TTlZMlZsalhxUlNMUU9Va1hhd0JSU3JtdnQ0VGdfTlEtZTRyNjY5anlkenlGbVA1MDZ3MXdfTlY3WDVPd3A1ajh6cWRFWnVuUWczRDRFSzBnIIEC; bili_jct=115cb7c7474c92016269ebfd93caa63b; DedeUserID=472453800; DedeUserID__ckMd5=d1e673059caf9ff3; sid=7f78oa66; theme-tip-show=SHOWED; hit-dyn-v2=1; bili_ticket=eyJhbGciOiJIUzI1NiIsImtpZCI6InMwMyIsInR5cCI6IkpXVCJ9.eyJleHAiOjE3ODUzNDY0OTEsImlhdCI6MTc4NTA4NzIzMSwicGx0IjotMX0.e2sBClQLW-zJh96igfWi7koTnGDkOn44cYocXru7-BQ; bili_ticket_expires=1785346431; theme-avatar-tip-show=SHOWED; bp_t_offset_472453800=1229437575345733632; b_lsid=21F55550_19F9F9AE1E1",
        "retry_delay": 2,
        "max_retries": 3
    }

    print("=" * 60)
    print("初始化 Bilibili 平台配置")
    print("=" * 60)
    print()

    try:
        # 检查是否已存在
        async with db.get_connection() as conn:
            cursor = await conn.execute(
                "SELECT id FROM PlatformConfig WHERE platform = ?",
                (platform,)
            )
            existing = await cursor.fetchone()

        if existing:
            print(f"⚠️  平台配置已存在，将更新配置...")

            now = datetime.now().isoformat()
            config_data_json = json.dumps(config_data, ensure_ascii=False)

            async with db.get_connection() as conn:
                await conn.execute(
                    """
                    UPDATE PlatformConfig SET
                        displayName = ?,
                        configData = ?,
                        lastUpdatedAt = ?,
                        updatedAt = ?
                    WHERE platform = ?
                    """,
                    (display_name, config_data_json, now, now, platform)
                )
                await conn.commit()

            print(f"✅ 配置已更新")
        else:
            print(f"创建新的平台配置...")

            config_id = f"pc_{int(datetime.now().timestamp())}"
            now = datetime.now().isoformat()
            config_data_json = json.dumps(config_data, ensure_ascii=False)

            async with db.get_connection() as conn:
                await conn.execute(
                    """
                    INSERT INTO PlatformConfig (
                        id, platform, displayName, configData, isActive,
                        lastUpdatedAt, expiresAt, autoRefresh, createdAt, updatedAt
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        config_id,
                        platform,
                        display_name,
                        config_data_json,
                        1,  # isActive
                        now,
                        None,  # expiresAt
                        0,  # autoRefresh
                        now,
                        now
                    )
                )
                await conn.commit()

            print(f"✅ 配置已创建: {config_id}")

        print()
        print("配置详情:")
        print(f"  - 平台: {platform}")
        print(f"  - 显示名称: {display_name}")
        print(f"  - Cookie 长度: {len(config_data['cookie_str'])} 字符")
        print(f"  - 重试延迟: {config_data['retry_delay']} 秒")
        print(f"  - 最大重试: {config_data['max_retries']} 次")
        print()
        print("=" * 60)
        print("初始化完成")
        print("=" * 60)

    except Exception as e:
        print(f"❌ 初始化失败: {e}")
        import traceback
        traceback.print_exc()
        return False

    return True

if __name__ == '__main__':
    success = asyncio.run(init_bilibili_config())
    sys.exit(0 if success else 1)
