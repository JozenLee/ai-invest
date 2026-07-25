"""
修复数据库中错误的时间戳
将本地时间格式的时间戳转换为正确的UTC时间戳
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import sqlite3
from datetime import datetime, timezone, timedelta

# 连接数据库
db_path = "../../prisma/dev.db"
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# 中国时区偏移（UTC+8）
CST_OFFSET = timedelta(hours=8)

# 查询所有有 lastFetchAt 的数据源
cursor.execute("SELECT id, name, lastFetchAt FROM DataSource WHERE lastFetchAt IS NOT NULL")
rows = cursor.fetchall()

print(f"找到 {len(rows)} 个需要修复的数据源\n")

fixed_count = 0
for row in rows:
    source_id, name, last_fetch_str = row

    # 解析时间戳（假设存储的是本地时间CST，但没有时区信息）
    try:
        # 移除微秒后的部分
        if '.' in last_fetch_str:
            last_fetch_str = last_fetch_str.split('.')[0] + '.' + last_fetch_str.split('.')[1][:6]

        # 解析为naive datetime（本地时间）
        local_time = datetime.fromisoformat(last_fetch_str.replace('Z', ''))

        # 转换为UTC时间（减去8小时）
        utc_time = local_time - CST_OFFSET

        # 格式化为ISO格式
        utc_time_str = utc_time.isoformat()

        print(f"修复: {name}")
        print(f"  原始: {last_fetch_str}")
        print(f"  修正: {utc_time_str}")

        # 更新数据库
        cursor.execute(
            "UPDATE DataSource SET lastFetchAt = ? WHERE id = ?",
            (utc_time_str, source_id)
        )

        fixed_count += 1
        print()

    except Exception as e:
        print(f"错误: {name} - {e}\n")

# 提交更改
conn.commit()
conn.close()

print(f"\n✅ 修复完成！共修复 {fixed_count} 个数据源的时间戳")
