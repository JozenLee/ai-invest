"""
NewsNow数据时间修复方案

由于NewsNow网站使用客户端渲染（React），我们需要使用浏览器自动化工具。
这里提供两个方案供选择。
"""

# 方案1：使用Playwright批量爬取真实时间（推荐用于一次性修复）
async def fix_newsnow_times_with_playwright():
    """
    使用Playwright爬取NewsNow文章的真实发布时间并更新数据库

    优点：
    - 能获取真实的发布时间
    - 一次性修复所有历史数据

    缺点：
    - 需要安装Playwright和浏览器
    - 速度较慢（每篇文章约2-3秒）
    - 增加系统复杂度
    """
    from playwright.async_api import async_playwright
    from db import db
    import asyncio

    # 1. 获取所有NewsNow来源的文章
    articles = await db.get_articles_by_source_pattern("%NewsNow%")

    print(f"找到 {len(articles)} 条NewsNow文章")

    async with async_playwright() as p:
        # 使用无头浏览器
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context()
        page = await context.new_page()

        updated_count = 0

        for i, article in enumerate(articles):
            try:
                url = article['url']
                print(f"[{i+1}/{len(articles)}] 处理: {url[:50]}...")

                # 访问页面
                await page.goto(url, timeout=10000)

                # 等待time标签加载
                time_elem = await page.wait_for_selector('time', timeout=5000)

                if time_elem:
                    real_time = await time_elem.get_attribute('datetime')

                    if real_time:
                        # 更新数据库
                        await db.update_article_publish_time(article['id'], real_time)
                        updated_count += 1
                        print(f"  ✅ 更新时间: {real_time}")
                    else:
                        print(f"  ⚠️  未找到datetime属性")
                else:
                    print(f"  ⚠️  未找到time标签")

                # 避免请求过快
                await asyncio.sleep(1)

            except Exception as e:
                print(f"  ❌ 失败: {e}")
                continue

        await browser.close()

    print(f"\n完成！成功更新 {updated_count}/{len(articles)} 条数据")


# 方案2：在采集时同步爬取真实时间（推荐用于新数据）
async def enrich_newsnow_time_on_fetch(items):
    """
    在采集NewsNow数据时，同步爬取每篇文章的真实发布时间

    优点：
    - 新采集的数据直接有真实时间
    - 不需要后期修复

    缺点：
    - 采集速度变慢（每条新闻+2秒）
    - 需要在采集流程中集成Playwright
    """
    from playwright.async_api import async_playwright

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context()
        page = await context.new_page()

        enriched_items = []

        for item in items:
            try:
                url = item.get('url')

                if url and 'wallstreetcn.com' in url:
                    # 访问页面
                    await page.goto(url, timeout=10000)

                    # 获取真实时间
                    time_elem = await page.wait_for_selector('time', timeout=5000)
                    real_time = await time_elem.get_attribute('datetime')

                    if real_time:
                        item['publishTime'] = real_time  # 替换为真实时间
                        item['_timeSource'] = 'scraped'  # 标记时间来源

                enriched_items.append(item)

            except Exception as e:
                # 失败时使用原始时间
                enriched_items.append(item)
                continue

        await browser.close()

    return enriched_items


# 方案3：简化方案 - 标注时间类型（最简单）
def add_time_type_label():
    """
    在前端标注时间的类型，让用户理解

    优点：
    - 无需修改后端
    - 实施最简单
    - 性能无影响

    缺点：
    - NewsNow数据仍然是采集时间
    """
    # 在前端显示时添加说明
    # 详见下面的前端代码示例
    pass


if __name__ == "__main__":
    print(__doc__)
    print("\n推荐方案:")
    print("1. 立即使用：方案3（标注时间类型）")
    print("2. 长期改进：方案2（采集时爬取）+ 方案1（修复历史数据）")
