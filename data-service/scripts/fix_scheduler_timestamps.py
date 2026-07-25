"""
修复 SchedulerJob 表中的错误时间戳
将没有时区信息的时间戳转换为正确的 UTC 时间
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

print("=== 修复 SchedulerJob 表中的时间戳 ===\n")

# 查询所有 SchedulerJob 记录
cursor.execute("""
    SELECT id, sourceId, lastRunAt, nextRunAt
    FROM SchedulerJob
""")
rows = cursor.fetchall()

print(f"找到 {len(rows)} 个调度器任务\n")

fixed_count = 0
for row in rows:
    job_id, source_id, last_run_str, next_run_str = row

    print(f"处理调度器: {source_id}")

    updates = []
    params = []

    # 处理 lastRunAt
    if last_run_str and '+' not in last_run_str and 'Z' not in last_run_str:
        try:
            # 解析为 naive datetime（本地时间）
            local_time = datetime.fromisoformat(last_run_str)
            # 假设是本地时间（CST），转换为 UTC
            utc_time = local_time - CST_OFFSET
            utc_time_str = utc_time.replace(tzinfo=timezone.utc).isoformat()

            print(f"  lastRunAt:")
            print(f"    原始: {last_run_str}")
            print(f"    修正: {utc_time_str}")

            updates.append('lastRunAt = ?')
            params.append(utc_time_str)
        except Exception as e:
            print(f"  lastRunAt 解析失败: {e}")

    # 处理 nextRunAt
    if next_run_str:
        try:
            # 检查是否有时区信息
            if '+08:00' in next_run_str:
                # 有 +08:00 时区标识，需要转换为 UTC
                # 移除 +08:00 并解析
                next_run_str_clean = next_run_str.replace('+08:00', '')
                local_time = datetime.fromisoformat(next_run_str_clean)
                # 这是北京时间，转换为 UTC
                utc_time = local_time - CST_OFFSET
                utc_time_str = utc_time.replace(tzinfo=timezone.utc).isoformat()

                print(f"  nextRunAt:")
                print(f"    原始: {next_run_str}")
                print(f"    修正: {utc_time_str}")

                updates.append('nextRunAt = ?')
                params.append(utc_time_str)
            elif '+' not in next_run_str and 'Z' not in next_run_str:
                # 没有时区信息，假设是本地时间
                local_time = datetime.fromisoformat(next_run_str)
                utc_time = local_time - CST_OFFSET
                utc_time_str = utc_time.replace(tzinfo=timezone.utc).isoformat()

                print(f"  nextRunAt:")
                print(f"    原始: {next_run_str}")
                print(f"    修正: {utc_time_str}")

                updates.append('nextRunAt = ?')
                params.append(utc_time_str)
        except Exception as e:
            print(f"  nextRunAt 解析失败: {e}")

    # 更新数据库
    if updates:
        sql = f"UPDATE SchedulerJob SET {', '.join(updates)} WHERE id = ?"
        params.append(job_id)
        cursor.execute(sql, params)
        fixed_count += 1

    print()

# 提交更改
conn.commit()
conn.close()

print(f"✅ 修复完成！共修复 {fixed_count} 个调度器的时间戳")
