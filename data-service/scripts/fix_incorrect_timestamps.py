"""
修复被错误减去8小时的时间戳
将没有时区标识的时间戳加回8小时，使其成为正确的UTC时间
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

# 查询所有没有时区标识的 lastFetchAt 记录
cursor.execute("""
    SELECT id, name, lastFetchAt
    FROM DataSource
    WHERE lastFetchAt IS NOT NULL
    AND lastFetchAt NOT LIKE '%+00:00'
    AND lastFetchAt NOT LIKE '%Z'
""")
rows = cursor.fetchall()

print(f"找到 {len(rows)} 个需要修复的时间戳（没有时区标识）\n")

fixed_count = 0
for row in rows:
    source_id, name, last_fetch_str = row

    try:
        # 解析时间戳（当前存储的是被错误减去8小时后的UTC时间）
        if '.' in last_fetch_str:
            # 移除多余的微秒位数
            parts = last_fetch_str.split('.')
            if len(parts) == 2:
                last_fetch_str = parts[0] + '.' + parts[1][:6]

        # 解析为naive datetime
        incorrect_utc_time = datetime.fromisoformat(last_fetch_str.replace('Z', ''))

        # 加回8小时，得到正确的UTC时间
        correct_utc_time = incorrect_utc_time + CST_OFFSET

        # 格式化为带时区的ISO格式
        correct_utc_time_str = correct_utc_time.replace(tzinfo=timezone.utc).isoformat()

        print(f"修复: {name}")
        print(f"  错误时间: {last_fetch_str}")
        print(f"  正确时间: {correct_utc_time_str}")

        # 更新数据库
        cursor.execute(
            "UPDATE DataSource SET lastFetchAt = ? WHERE id = ?",
            (correct_utc_time_str, source_id)
        )

        fixed_count += 1
        print()

    except Exception as e:
        print(f"错误: {name} - {e}\n")

# 提交更改
conn.commit()
conn.close()

print(f"\n✅ 修复完成！共修复 {fixed_count} 个时间戳")
