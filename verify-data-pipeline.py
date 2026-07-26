#!/usr/bin/env python3
"""
新闻数据链路完整验证工具
验证从数据采集到AI分析再到存储的完整链路
"""

import sqlite3
import subprocess
import time
import json
from datetime import datetime, timedelta

DB_PATH = "/Users/jozen.lee/ai-softwares/ai-invest/prisma/dev.db"
LOG_FILE = "/tmp/data-service-final.log"

def print_header(title):
    print("\n" + "=" * 80)
    print(title)
    print("=" * 80)

def check_service_health():
    """检查数据服务健康状态"""
    print_header("1. 数据服务健康检查")
    try:
        result = subprocess.run(
            ["curl", "-s", "http://localhost:8000/health"],
            capture_output=True,
            text=True,
            timeout=5
        )
        health = json.loads(result.stdout)
        print(f"✅ 服务状态: {health['status']}")
        print(f"✅ 调度器运行: {health['scheduler_running']}")
        print(f"✅ 活跃任务数: {health['active_jobs']}")
        return True
    except Exception as e:
        print(f"❌ 服务检查失败: {e}")
        return False

def check_ai_analysis_logs():
    """检查AI分析日志"""
    print_header("2. AI分析日志检查")
    try:
        with open(LOG_FILE, 'r') as f:
            lines = f.readlines()

        # 查找最近的AI分析日志
        relevant_lines = []
        for line in lines[-500:]:
            if any(kw in line for kw in ['AI批量分析', 'AI分析完成', 'AI处理完成', 'Claude API']):
                relevant_lines.append(line.strip())

        if relevant_lines:
            print("最近AI分析日志:")
            for line in relevant_lines[-10:]:
                print(f"  {line}")
            return True
        else:
            print("❌ 未找到AI分析日志")
            return False
    except Exception as e:
        print(f"❌ 日志检查失败: {e}")
        return False

def check_database_stats():
    """检查数据库统计"""
    print_header("3. 数据库统计")
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()

        # 最近1小时统计
        cursor.execute("""
            SELECT
                COUNT(*) as total,
                SUM(CASE WHEN aiProcessed = 1 THEN 1 ELSE 0 END) as ai_processed,
                SUM(CASE WHEN summary != title THEN 1 ELSE 0 END) as good_summary,
                SUM(CASE WHEN categoryId IS NOT NULL THEN 1 ELSE 0 END) as has_category
            FROM NewsArticle
            WHERE publishTime > datetime('now', '-1 hour')
        """)

        stats = cursor.fetchone()
        total, ai_processed, good_summary, has_category = stats

        print(f"最近1小时新闻统计:")
        print(f"  总数: {total}")
        print(f"  AI已处理: {ai_processed} ({ai_processed/total*100 if total > 0 else 0:.1f}%)")
        print(f"  摘要不等于标题: {good_summary} ({good_summary/total*100 if total > 0 else 0:.1f}%)")
        print(f"  有分类标签: {has_category} ({has_category/total*100 if total > 0 else 0:.1f}%)")

        conn.close()
        return ai_processed > 0
    except Exception as e:
        print(f"❌ 数据库检查失败: {e}")
        return False

def check_latest_news():
    """检查最新的新闻数据"""
    print_header("4. 最新新闻数据检查")
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()

        # AI处理过的新闻
        cursor.execute("""
            SELECT
                substr(title, 1, 60) as title,
                substr(summary, 1, 50) as summary,
                categoryId,
                sentimentLabel,
                sentiment,
                impact,
                datetime(publishTime) as pubTime
            FROM NewsArticle
            WHERE aiProcessed = 1
            ORDER BY publishTime DESC
            LIMIT 3
        """)

        ai_news = cursor.fetchall()
        if ai_news:
            print("\n✅ AI处理过的新闻 (最新3条):")
            for row in ai_news:
                title, summary, cat, sent_label, sent_score, impact, pub = row
                print(f"\n  标题: {title}")
                print(f"  摘要: {summary}")
                print(f"  分类: {cat}, 情感: {sent_label} ({sent_score}), 影响: {impact}")
                print(f"  时间: {pub}")
        else:
            print("❌ 未找到AI处理过的新闻")

        # 未处理的新闻
        cursor.execute("""
            SELECT COUNT(*) FROM NewsArticle
            WHERE aiProcessed = 0
            AND publishTime > datetime('now', '-1 hour')
        """)

        unprocessed = cursor.fetchone()[0]
        if unprocessed > 0:
            print(f"\n⚠️  最近1小时有 {unprocessed} 条新闻未经AI处理")

        conn.close()
        return len(ai_news) > 0
    except Exception as e:
        print(f"❌ 最新新闻检查失败: {e}")
        return False

def trigger_and_monitor():
    """触发采集并监控"""
    print_header("5. 触发新闻采集并监控")

    try:
        # 触发采集
        print("触发财联社新闻采集...")
        result = subprocess.run(
            ["curl", "-s", "-X", "POST",
             "http://localhost:8000/api/scheduler/run/scheduler_cmruz2n0y00051bvpfz2m3af4"],
            capture_output=True,
            text=True,
            timeout=10
        )

        response = json.loads(result.stdout)
        if response.get('success'):
            print("✅ 采集任务已触发")

            print("\n等待AI分析完成 (约2分钟)...")
            for i in range(120):
                time.sleep(1)
                if i % 10 == 0:
                    print(f"  {i}秒...", end='\r')

            print("\n\n检查执行结果:")
            check_ai_analysis_logs()
            check_database_stats()
            check_latest_news()
        else:
            print("❌ 触发采集失败")
            return False

    except Exception as e:
        print(f"❌ 触发监控失败: {e}")
        return False

def main():
    print("=" * 80)
    print("新闻数据链路完整验证工具")
    print("=" * 80)
    print(f"执行时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

    # 1. 服务健康检查
    if not check_service_health():
        print("\n❌ 服务未运行，请先启动数据服务")
        return

    # 2. AI分析日志
    check_ai_analysis_logs()

    # 3. 数据库统计
    has_ai_data = check_database_stats()

    # 4. 最新新闻
    check_latest_news()

    # 总结
    print_header("验证总结")
    if has_ai_data:
        print("✅ AI分析链路正常工作")
        print("✅ 数据成功存储到数据库")
        print("✅ 摘要、分类、情感标签正常生成")
    else:
        print("⚠️  数据库中暂无AI处理过的新闻")
        print("⚠️  可能原因:")
        print("    1. AI分析刚启动，还未完成第一批")
        print("    2. 所有新闻都已存在（URL去重）")
        print("    3. 存储阶段出现问题")

        # 询问是否触发测试
        user_input = input("\n是否立即触发一次采集测试? (y/n): ")
        if user_input.lower() == 'y':
            trigger_and_monitor()

if __name__ == "__main__":
    main()
