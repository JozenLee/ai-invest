"""
批量修复NewsNow文章的真实发布时间

使用Playwright爬取页面获取真实的发布时间，并更新数据库
"""
import asyncio
from datetime import datetime
from playwright.async_api import async_playwright
import requests


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

    # 1. 获取所有NewsNow来源的文章
    print("\n步骤1: 查询NewsNow文章...")

    # 通过API获取NewsNow文章
    import requests
    response = requests.get('http://localhost:3000/api/events/feed?limit=500')
    data = response.json()

    if not data['success']:
        print("❌ 获取文章列表失败")
        return

    all_articles = data['data']['items']

    # 筛选NewsNow来源的文章
    newsnow_articles = [
        a for a in all_articles
        if 'NewsNow' in a.get('source', '')
    ]

    if limit:
        newsnow_articles = newsnow_articles[:limit]

    print(f"找到 {len(newsnow_articles)} 条NewsNow文章")

    if len(newsnow_articles) == 0:
        print("没有需要处理的文章")
        return

    # 2. 启动浏览器
    print("\n步骤2: 启动浏览器...")

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

        print(f"\n步骤3: 开始处理文章（每{batch_size}条暂停1秒）...")
        print("-" * 80)

        for i, article in enumerate(newsnow_articles):
            try:
                article_id = article['id']
                url = article.get('url', '')
                title = article.get('title', '')[:40]
                current_time = article.get('publishTime', '')

                print(f"\n[{i+1}/{len(newsnow_articles)}] {title}...")
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
                        formatted_time = dt.strftime('%Y-%m-%d %H:%M:%S')

                        print(f"  ✅ 真实时间: {formatted_time}")

                        # 更新数据库
                        update_result = requests.put(
                            f'http://localhost:3000/api/events/{article_id}',
                            json={'publishTime': real_time}
                        )

                        if update_result.status_code == 200:
                            updated_count += 1
                            print(f"  ✅ 已更新数据库")
                        else:
                            print(f"  ❌ 更新失败: {update_result.status_code}")
                            failed_count += 1

                    except Exception as e:
                        print(f"  ❌ 时间解析失败: {e}")
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

    # 3. 总结
    print("\n" + "=" * 80)
    print("处理完成！")
    print("=" * 80)
    print(f"总数: {len(newsnow_articles)}条")
    print(f"✅ 成功更新: {updated_count}条")
    print(f"❌ 失败: {failed_count}条")
    print(f"⚠️  跳过: {skipped_count}条")
    print("=" * 80)

    return {
        'total': len(newsnow_articles),
        'updated': updated_count,
        'failed': failed_count,
        'skipped': skipped_count
    }


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description='修复NewsNow文章的真实发布时间')
    parser.add_argument('--limit', type=int, default=None, help='限制处理的文章数量')
    parser.add_argument('--batch-size', type=int, default=10, help='每批处理的数量')

    args = parser.parse_args()

    asyncio.run(fix_newsnow_times(limit=args.limit, batch_size=args.batch_size))
