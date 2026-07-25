"""
批量修复NewsNow文章的真实发布时间 - 直接更新数据库版本

使用Playwright爬取页面获取真实的发布时间，并直接更新SQLite数据库
"""
import asyncio
from datetime import datetime
from playwright.async_api import async_playwright
import sqlite3
import os


async def extract_real_time(page, url):
    """从页面提取真实发布时间"""
    try:
        # 访问页面
        await page.goto(url, timeout=15000, wait_until='domcontentloaded')

        # 等待time标签加载（最多等待5秒）
        try:
            time_elem = await page.wait_for_selector('time[datetime]', timeout=5000)
            if time_elem:
                real_time = await time_elem.get_attribute('datetime')
                return real_time
        except:
            pass

        # 如果没找到，尝试查找meta标签
        try:
            meta_elem = await page.query_selector('meta[property="article:published_time"]')
            if meta_elem:
                real_time = await meta_elem.get_attribute('content')
                return real_time
        except:
            pass

        return None

    except Exception as e:
        print(f"    提取失败: {str(e)[:50]}")
        return None


def get_db_connection():
    """获取数据库连接"""
    # Prisma数据库位置
    db_path = os.path.join(os.path.dirname(__file__), 'prisma', 'dev.db')

    if not os.path.exists(db_path):
        # 尝试备用路径
        db_path = os.path.join(os.path.dirname(__file__), 'dev.db')

    if not os.path.exists(db_path):
        print(f"❌ 数据库文件不存在: {db_path}")
        return None

    print(f"使用数据库: {db_path}")
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row  # 允许按列名访问
    return conn


async def fix_newsnow_times(limit=None, batch_size=10):
    """
    批量修复NewsNow文章的时间

    Args:
        limit: 限制处理的文章数量（None=全部）
        batch_size: 每批处理的数量
    """
    print("=" * 80)
    print("NewsNow文章真实时间修复工具")
    print("=" * 80)

    # 1. 连接数据库
    print("\n步骤1: 连接数据库...")
    conn = get_db_connection()

    if not conn:
        print("❌ 无法连接数据库")
        return

    cursor = conn.cursor()

    # 2. 查询NewsNow文章
    print("\n步骤2: 查询NewsNow文章...")

    query = """
    SELECT id, title, url, publishTime, source, sourceId
    FROM NewsArticle
    WHERE sourceId LIKE '%newsnow%'
    ORDER BY createdAt DESC
    """

    if limit:
        query += f" LIMIT {limit}"

    cursor.execute(query)
    articles = cursor.fetchall()

    print(f"找到 {len(articles)} 条NewsNow文章")

    if len(articles) == 0:
        print("没有需要处理的文章")
        conn.close()
        return

    # 3. 启动浏览器
    print("\n步骤3: 启动浏览器...")

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=['--disable-blink-features=AutomationControlled']
        )
        context = await browser.new_context(
            user_agent='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        )
        page = await context.new_page()

        updated_count = 0
        failed_count = 0
        skipped_count = 0

        print(f"\n步骤4: 开始处理文章（每{batch_size}条暂停1秒）...")
        print("-" * 80)

        for i, article in enumerate(articles):
            try:
                article_id = article['id']
                url = article['url']
                title = article['title'][:40]
                current_time = article['publishTime']

                print(f"\n[{i+1}/{len(articles)}] {title}...")
                print(f"  当前时间: {current_time}")
                print(f"  URL: {url[:60]}...")

                if not url:
                    print(f"  ⚠️  跳过: 没有URL")
                    skipped_count += 1
                    continue

                # 提取真实时间
                real_time = await extract_real_time(page, url)

                if real_time:
                    # 格式化时间
                    try:
                        dt = datetime.fromisoformat(real_time.replace('Z', '+00:00'))
                        formatted_time = dt.isoformat()

                        print(f"  ✅ 真实时间: {dt.strftime('%Y-%m-%d %H:%M:%S')}")

                        # 更新数据库
                        update_query = """
                        UPDATE NewsArticle
                        SET publishTime = ?
                        WHERE id = ?
                        """

                        cursor.execute(update_query, (formatted_time, article_id))
                        conn.commit()

                        updated_count += 1
                        print(f"  ✅ 已更新数据库")

                    except Exception as e:
                        print(f"  ❌ 时间解析/更新失败: {e}")
                        failed_count += 1
                else:
                    print(f"  ⚠️  未找到真实时间")
                    failed_count += 1

                # 每处理batch_size条暂停一下
                if (i + 1) % batch_size == 0:
                    print(f"\n  💤 已处理{i+1}条，暂停1秒...")
                    await asyncio.sleep(1)
                else:
                    await asyncio.sleep(0.3)  # 每条之间暂停300ms

            except Exception as e:
                print(f"  ❌ 处理失败: {e}")
                failed_count += 1
                continue

        await browser.close()

    conn.close()

    # 4. 总结
    print("\n" + "=" * 80)
    print("处理完成！")
    print("=" * 80)
    print(f"总数: {len(articles)}条")
    print(f"✅ 成功更新: {updated_count}条")
    print(f"❌ 失败: {failed_count}条")
    print(f"⚠️  跳过: {skipped_count}条")
    print("=" * 80)

    if updated_count > 0:
        print("\n提示: 刷新前端页面查看更新后的时间")

    return {
        'total': len(articles),
        'updated': updated_count,
        'failed': failed_count,
        'skipped': skipped_count
    }


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description='修复NewsNow文章的真实发布时间')
    parser.add_argument('--limit', type=int, default=None, help='限制处理的文章数量（默认全部）')
    parser.add_argument('--batch-size', type=int, default=10, help='每批处理的数量')

    args = parser.parse_args()

    asyncio.run(fix_newsnow_times(limit=args.limit, batch_size=args.batch_size))
