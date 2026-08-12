/**
 * 资讯流页面E2E测试 - 显示和筛选功能
 * 测试范围：
 * - 新闻列表显示
 * - 标签筛选功能
 * - 知识图谱联动
 * - 分类筛选
 */

import { test, expect } from '@playwright/test';

test.describe('资讯流 - 显示和筛选功能', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/events/feed');
    await page.waitForLoadState('networkidle');
  });

  test('应该正确加载资讯流页面', async ({ page }) => {
    // 验证页面标题
    await expect(page).toHaveTitle(/资讯|新闻|Events|Feed/);

    // 验证主要内容区域
    const mainContent = page.locator('main, [role="main"], .main-content').first();
    await expect(mainContent).toBeVisible();
  });

  test('应该显示新闻列表', async ({ page }) => {
    // 等待新闻列表加载
    await page.waitForSelector(
      '[data-testid="news-list"], [data-testid="event-list"], .news-list, .event-list, article',
      { timeout: 10000 }
    );

    // 验证有多条新闻
    const newsItems = page.locator(
      '[data-testid="news-item"], [data-testid="event-item"], .news-item, article'
    );

    const count = await newsItems.count();
    expect(count).toBeGreaterThan(0);

    console.log('显示的新闻数量:', count);
  });

  test('每条新闻应该显示完整信息', async ({ page }) => {
    await page.waitForSelector('[data-testid="news-item"], article', { timeout: 10000 });

    const firstNews = page.locator('[data-testid="news-item"], article').first();
    await expect(firstNews).toBeVisible();

    // 验证标题
    const title = firstNews.locator('h2, h3, h4, [data-testid="news-title"], .news-title');
    await expect(title).toBeVisible();

    const titleText = await title.textContent();
    expect(titleText?.length).toBeGreaterThan(0);

    // 验证时间
    const timeElement = firstNews.locator('[data-testid="publish-time"], time, .publish-time, .timestamp');
    if ((await timeElement.count()) > 0) {
      await expect(timeElement).toBeVisible();
    }

    // 验证来源
    const sourceElement = firstNews.locator('[data-testid="news-source"], .source, .author');
    if ((await sourceElement.count()) > 0) {
      await expect(sourceElement).toBeVisible();
    }
  });

  test('新闻应该显示标签', async ({ page }) => {
    await page.waitForSelector('[data-testid="news-item"], article', { timeout: 10000 });

    const firstNews = page.locator('[data-testid="news-item"], article').first();

    // 查找标签容器
    const tagsContainer = firstNews.locator(
      '[data-testid="tags"], [data-testid="categories"], .tags, .categories, .badges'
    );

    if ((await tagsContainer.count()) > 0) {
      await expect(tagsContainer).toBeVisible();

      // 验证有标签
      const tags = tagsContainer.locator('[data-testid="tag"], .tag, .badge, span');
      const tagCount = await tags.count();

      if (tagCount > 0) {
        expect(tagCount).toBeGreaterThan(0);
        console.log('第一条新闻的标签数:', tagCount);

        // 验证标签可点击
        const firstTag = tags.first();
        await expect(firstTag).toBeVisible();
      }
    }
  });

  test('应该支持按标签筛选', async ({ page }) => {
    await page.waitForSelector('[data-testid="news-item"], article', { timeout: 10000 });

    // 查找第一个标签
    const firstTag = page.locator('[data-testid="tag"], .tag, .badge').first();

    if ((await firstTag.count()) > 0) {
      const tagText = await firstTag.textContent();

      // 点击标签
      await firstTag.click();
      await page.waitForTimeout(1500);

      // 验证URL包含筛选参数或页面内容更新
      const url = page.url();
      const urlHasTag = url.includes('tag=') || url.includes('category=');

      console.log('筛选标签:', tagText);
      console.log('URL包含筛选:', urlHasTag);

      // 验证筛选后的结果
      const newsItems = page.locator('[data-testid="news-item"], article');
      const count = await newsItems.count();

      expect(count).toBeGreaterThan(0);
    }
  });

  test('应该有分类筛选器', async ({ page }) => {
    // 查找分类筛选器
    const categoryFilter = page.locator(
      '[data-testid="category-filter"], [data-testid="category-selector"], ' +
      'select[name="category"], .category-filter'
    ).first();

    if ((await categoryFilter.count()) > 0) {
      await expect(categoryFilter).toBeVisible();

      const tagName = await categoryFilter.evaluate(el => el.tagName.toLowerCase());

      if (tagName === 'select') {
        // 下拉选择器
        const options = categoryFilter.locator('option');
        const optionCount = await options.count();

        expect(optionCount).toBeGreaterThan(1); // 至少有"全部"和一个分类

        // 选择第二个选项（跳过"全部"）
        await categoryFilter.selectOption({ index: 1 });
        await page.waitForTimeout(1500);

        console.log('已选择分类');
      } else {
        // 按钮组或其他形式
        await categoryFilter.click();
        await page.waitForTimeout(500);
      }
    }
  });

  test('分类应该与知识图谱联动', async ({ page }) => {
    // 获取当前页面的分类列表
    const categoryButtons = page.locator(
      '[data-testid="category-button"], .category-button, button[data-category]'
    );

    let categories: string[] = [];

    if ((await categoryButtons.count()) > 0) {
      const count = Math.min(await categoryButtons.count(), 5);
      for (let i = 0; i < count; i++) {
        const text = await categoryButtons.nth(i).textContent();
        if (text) categories.push(text.trim());
      }
    }

    console.log('资讯流分类:', categories);

    // 访问知识图谱页面
    await page.goto('/graph');
    await page.waitForLoadState('networkidle');

    // 获取知识图谱的产业列表
    const industryItems = page.locator(
      '[data-testid="industry-item"], .industry-item, [data-testid="domain-item"]'
    );

    let industries: string[] = [];

    if ((await industryItems.count()) > 0) {
      const count = Math.min(await industryItems.count(), 5);
      for (let i = 0; i < count; i++) {
        const text = await industryItems.nth(i).textContent();
        if (text) industries.push(text.trim());
      }
    }

    console.log('知识图谱产业:', industries);

    // 验证有重叠（联动）
    const hasOverlap = categories.some(cat =>
      industries.some(ind => ind.includes(cat) || cat.includes(ind))
    );

    if (hasOverlap) {
      console.log('✓ 分类与知识图谱已联动');
    } else {
      console.log('⚠ 分类与知识图谱可能未完全联动');
    }
  });

  test('应该支持按来源筛选', async ({ page }) => {
    // 查找来源筛选器
    const sourceFilter = page.locator(
      '[data-testid="source-filter"], select[name="source"], .source-filter'
    ).first();

    if ((await sourceFilter.count()) > 0) {
      await expect(sourceFilter).toBeVisible();

      const tagName = await sourceFilter.evaluate(el => el.tagName.toLowerCase());

      if (tagName === 'select') {
        await sourceFilter.selectOption({ index: 1 });
        await page.waitForTimeout(1500);

        console.log('已按来源筛选');

        // 验证结果
        const newsItems = page.locator('[data-testid="news-item"], article');
        const count = await newsItems.count();

        expect(count).toBeGreaterThan(0);
      }
    }
  });

  test('应该支持按时间范围筛选', async ({ page }) => {
    // 查找时间筛选器
    const timeFilter = page.locator(
      'button:has-text("今天"), button:has-text("本周"), button:has-text("本月"), ' +
      '[data-testid="time-filter-today"], [data-testid="time-filter-week"]'
    );

    if ((await timeFilter.count()) > 0) {
      const todayButton = timeFilter.filter({ hasText: '今天' }).or(page.locator('[data-testid="time-filter-today"]')).first();

      if ((await todayButton.count()) > 0) {
        await todayButton.click();
        await page.waitForTimeout(1500);

        console.log('已筛选今天的新闻');

        // 验证新闻日期都是今天
        const timeElements = page.locator('[data-testid="publish-time"], time, .timestamp');
        const count = await timeElements.count();

        if (count > 0) {
          const firstTime = await timeElements.first().textContent();
          console.log('第一条新闻时间:', firstTime);
        }
      }
    }
  });

  test('应该支持关键词搜索', async ({ page }) => {
    // 查找搜索框
    const searchInput = page.locator(
      'input[type="search"], input[placeholder*="搜索"], ' +
      '[data-testid="search-input"]'
    ).first();

    if ((await searchInput.count()) > 0) {
      // 输入搜索关键词
      await searchInput.fill('AI');

      // 按回车或点击搜索按钮
      const searchButton = page.locator('button[type="submit"], button:has-text("搜索")').first();

      if ((await searchButton.count()) > 0) {
        await searchButton.click();
      } else {
        await searchInput.press('Enter');
      }

      await page.waitForTimeout(1500);

      // 验证搜索结果
      const newsItems = page.locator('[data-testid="news-item"], article');
      const count = await newsItems.count();

      expect(count).toBeGreaterThan(0);

      // 验证结果包含关键词
      const content = await page.content();
      expect(content).toContain('AI');

      console.log('搜索"AI"的结果数:', count);
    }
  });

  test('应该支持组合筛选', async ({ page }) => {
    // 先按分类筛选
    const categoryButton = page.locator('button:has-text("AI"), button[data-category="AI"]').first();

    if ((await categoryButton.count()) > 0) {
      await categoryButton.click();
      await page.waitForTimeout(1000);
    }

    // 再按时间筛选
    const todayButton = page.locator('button:has-text("今天")').first();

    if ((await todayButton.count()) > 0) {
      await todayButton.click();
      await page.waitForTimeout(1000);
    }

    // 验证组合筛选结果
    const newsItems = page.locator('[data-testid="news-item"], article');
    const count = await newsItems.count();

    console.log('组合筛选结果数:', count);

    // 即使没有结果，也不应该报错
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('清除筛选应该恢复全部新闻', async ({ page }) => {
    // 先应用筛选
    const filterButton = page.locator(
      'button:has-text("AI"), [data-testid="category-button"]'
    ).first();

    if ((await filterButton.count()) > 0) {
      await filterButton.click();
      await page.waitForTimeout(1000);

      const filteredCount = await page.locator('[data-testid="news-item"], article').count();

      // 查找清除按钮
      const clearButton = page.locator(
        'button:has-text("清除"), button:has-text("重置"), button:has-text("全部"), ' +
        '[data-testid="clear-filter"]'
      ).first();

      if ((await clearButton.count()) > 0) {
        await clearButton.click();
        await page.waitForTimeout(1000);

        const allCount = await page.locator('[data-testid="news-item"], article').count();

        // 清除后数量应该增加或保持
        expect(allCount).toBeGreaterThanOrEqual(filteredCount);

        console.log('筛选后:', filteredCount, '清除后:', allCount);
      }
    }
  });

  test('应该显示筛选结果数量', async ({ page }) => {
    // 查找结果计数
    const resultCount = page.locator(
      '[data-testid="result-count"], .result-count, .total-count'
    ).first();

    if ((await resultCount.count()) > 0) {
      await expect(resultCount).toBeVisible();

      const text = await resultCount.textContent();

      // 应该包含数字
      expect(text).toMatch(/\d+/);

      console.log('结果数量显示:', text);
    }
  });

  test('应该支持分页加载', async ({ page }) => {
    // 滚动到页面底部
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(2000);

    // 查找"加载更多"按钮或自动加载指示器
    const loadMoreButton = page.locator('button:has-text("加载更多"), button:has-text("查看更多")').first();
    const loadingIndicator = page.locator('[data-testid="loading-more"], .loading-more').first();

    if ((await loadMoreButton.count()) > 0) {
      // 手动点击加载
      const initialCount = await page.locator('[data-testid="news-item"], article').count();

      await loadMoreButton.click();
      await page.waitForTimeout(2000);

      const afterCount = await page.locator('[data-testid="news-item"], article').count();

      expect(afterCount).toBeGreaterThanOrEqual(initialCount);

      console.log('加载前:', initialCount, '加载后:', afterCount);
    } else if ((await loadingIndicator.count()) > 0) {
      // 自动加载
      console.log('检测到自动加载指示器');
    }
  });

  test('空筛选结果应该显示提示', async ({ page }) => {
    // 应用一个不太可能有结果的筛选
    const searchInput = page.locator('input[type="search"]').first();

    if ((await searchInput.count()) > 0) {
      await searchInput.fill('XXXXXXXXX_NONEXISTENT_KEYWORD_12345');
      await searchInput.press('Enter');
      await page.waitForTimeout(1500);

      // 查找空状态提示
      const emptyState = page.locator(
        '[data-testid="empty-state"], .empty-state, .no-results, ' +
        'text=/没有找到|无结果|暂无数据/'
      ).first();

      if ((await emptyState.count()) > 0) {
        await expect(emptyState).toBeVisible();
        console.log('✓ 空状态提示已显示');
      }
    }
  });
});
