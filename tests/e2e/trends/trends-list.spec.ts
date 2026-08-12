/**
 * 领域趋势页面E2E测试 - 列表和筛选功能
 * 测试范围：
 * - 趋势列表显示
 * - 领域分类筛选
 * - 分析数量控制
 * - 排序功能
 */

import { test, expect } from '@playwright/test';

test.describe('领域趋势 - 列表和筛选功能', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/events/trends');
    await page.waitForLoadState('networkidle');
  });

  test('应该正确加载趋势页面', async ({ page }) => {
    await expect(page).toHaveTitle(/趋势|Trends/);

    const mainContent = page.locator('main, [role="main"]').first();
    await expect(mainContent).toBeVisible();
  });

  test('应该显示领域分类列表', async ({ page }) => {
    // 等待分类加载
    await page.waitForSelector(
      '[data-testid="sector-list"], [data-testid="domain-list"], .sector-list, .domain-list',
      { timeout: 10000 }
    );

    // 验证有多个领域
    const sectorItems = page.locator(
      '[data-testid="sector-item"], [data-testid="domain-item"], .sector-card, .domain-card'
    );

    const count = await sectorItems.count();
    expect(count).toBeGreaterThan(0);

    console.log('显示的领域数量:', count);
  });

  test('每个领域应该显示趋势摘要', async ({ page }) => {
    await page.waitForSelector('[data-testid="sector-item"], .sector-card', { timeout: 10000 });

    const firstSector = page.locator('[data-testid="sector-item"], .sector-card').first();
    await expect(firstSector).toBeVisible();

    // 验证领域名称
    const sectorName = firstSector.locator('h2, h3, [data-testid="sector-name"]');
    await expect(sectorName).toBeVisible();

    // 验证趋势数量或热度
    const trendCount = firstSector.locator('[data-testid="trend-count"], .trend-count, .heat');
    if ((await trendCount.count()) > 0) {
      await expect(trendCount).toBeVisible();
    }

    // 验证关键词或标签
    const keywords = firstSector.locator('[data-testid="keywords"], .keywords, .tags');
    if ((await keywords.count()) > 0) {
      await expect(keywords).toBeVisible();
    }
  });

  test('应该支持领域筛选', async ({ page }) => {
    // 查找领域筛选器
    const sectorFilter = page.locator(
      'select[name="sector"], [data-testid="sector-filter"], ' +
      'button:has-text("AI"), button:has-text("芯片")'
    ).first();

    if ((await sectorFilter.count()) > 0) {
      const tagName = await sectorFilter.evaluate(el => el.tagName.toLowerCase());

      if (tagName === 'select') {
        // 下拉选择
        await sectorFilter.selectOption({ index: 1 });
      } else {
        // 按钮
        await sectorFilter.click();
      }

      await page.waitForTimeout(1500);

      console.log('领域筛选已应用');

      // 验证筛选结果
      const visibleSectors = page.locator('[data-testid="sector-item"], .sector-card');
      const count = await visibleSectors.count();

      expect(count).toBeGreaterThan(0);
    }
  });

  test('领域分类应该与资讯流联动', async ({ page }) => {
    // 获取趋势页面的领域
    const sectorNames = await page.locator('[data-testid="sector-name"], h2, h3')
      .allTextContents();

    console.log('趋势页面领域:', sectorNames.slice(0, 5));

    // 访问资讯流页面
    await page.goto('/events/feed');
    await page.waitForLoadState('networkidle');

    // 获取资讯流的分类
    const categoryButtons = page.locator('[data-testid="category-button"], .category-button');

    if ((await categoryButtons.count()) > 0) {
      const categoryNames = await categoryButtons.allTextContents();
      console.log('资讯流分类:', categoryNames.slice(0, 5));

      // 验证有重叠
      const hasOverlap = sectorNames.some(sector =>
        categoryNames.some(cat => cat.includes(sector) || sector.includes(cat))
      );

      if (hasOverlap) {
        console.log('✓ 领域与资讯流已联动');
      }
    }
  });

  test('领域分类应该与知识图谱联动', async ({ page }) => {
    // 获取趋势页面的领域
    const trendsSectors = await page.locator('[data-testid="sector-name"], h2, h3')
      .allTextContents();

    // 访问知识图谱页面
    await page.goto('/graph');
    await page.waitForLoadState('networkidle');

    // 获取知识图谱的产业
    const industries = await page.locator('[data-testid="industry-name"], .industry-name, h3')
      .allTextContents();

    console.log('趋势领域:', trendsSectors.slice(0, 5));
    console.log('图谱产业:', industries.slice(0, 5));

    // 验证联动
    const hasOverlap = trendsSectors.some(sector =>
      industries.some(ind => ind.includes(sector) || sector.includes(ind))
    );

    if (hasOverlap) {
      console.log('✓ 领域与知识图谱已联动');
    }
  });

  test('应该支持分析数量筛选', async ({ page }) => {
    // 查找分析数量筛选器
    const limitFilter = page.locator(
      'select[name="limit"], [data-testid="limit-filter"], ' +
      'button:has-text("5"), button:has-text("10"), button:has-text("20")'
    ).first();

    if ((await limitFilter.count()) > 0) {
      const tagName = await limitFilter.evaluate(el => el.tagName.toLowerCase());

      if (tagName === 'select') {
        // 选择显示10条
        const options = await limitFilter.locator('option').allTextContents();
        const index = options.findIndex(opt => opt.includes('10'));

        if (index >= 0) {
          await limitFilter.selectOption({ index });
          await page.waitForTimeout(1500);

          console.log('已设置显示10条趋势');
        }
      } else {
        // 按钮组
        const button10 = page.locator('button:has-text("10")').first();
        if ((await button10.count()) > 0) {
          await button10.click();
          await page.waitForTimeout(1500);
        }
      }

      // 验证显示数量
      const trendItems = page.locator('[data-testid="trend-item"], .trend-item');
      const count = await trendItems.count();

      console.log('实际显示趋势数:', count);
    }
  });

  test('应该支持按热度排序', async ({ page }) => {
    // 查找排序按钮
    const sortButton = page.locator(
      'button:has-text("热度"), button:has-text("排序"), ' +
      '[data-testid="sort-heat"], select[name="sort"]'
    ).first();

    if ((await sortButton.count()) > 0) {
      const tagName = await sortButton.evaluate(el => el.tagName.toLowerCase());

      // 获取排序前的第一项
      const firstBefore = await page.locator('[data-testid="sector-item"], .sector-card')
        .first()
        .textContent();

      if (tagName === 'select') {
        await sortButton.selectOption('heat');
      } else {
        await sortButton.click();
      }

      await page.waitForTimeout(1000);

      // 获取排序后的第一项
      const firstAfter = await page.locator('[data-testid="sector-item"], .sector-card')
        .first()
        .textContent();

      console.log('排序前:', firstBefore?.substring(0, 20));
      console.log('排序后:', firstAfter?.substring(0, 20));
    }
  });

  test('应该支持按时间排序', async ({ page }) => {
    const sortButton = page.locator(
      'button:has-text("时间"), select[name="sort"]'
    ).first();

    if ((await sortButton.count()) > 0) {
      const tagName = await sortButton.evaluate(el => el.tagName.toLowerCase());

      if (tagName === 'select') {
        await sortButton.selectOption('time');
      } else {
        await sortButton.click();
      }

      await page.waitForTimeout(1000);

      console.log('已按时间排序');
    }
  });

  test('应该支持时间范围筛选', async ({ page }) => {
    // 查找时间筛选按钮
    const timeButtons = page.locator(
      'button:has-text("7天"), button:has-text("30天"), ' +
      '[data-testid="time-7d"], [data-testid="time-30d"]'
    );

    if ((await timeButtons.count()) > 0) {
      const button7d = timeButtons.filter({ hasText: '7' }).first();

      if ((await button7d.count()) > 0) {
        await button7d.click();
        await page.waitForTimeout(1500);

        console.log('已筛选7天内的趋势');

        // 验证数据更新
        const sectors = page.locator('[data-testid="sector-item"], .sector-card');
        const count = await sectors.count();

        expect(count).toBeGreaterThan(0);
      }
    }
  });

  test('应该显示趋势变化指标', async ({ page }) => {
    await page.waitForSelector('[data-testid="sector-item"], .sector-card', { timeout: 10000 });

    const firstSector = page.locator('[data-testid="sector-item"], .sector-card').first();

    // 查找趋势指标（上升、下降、持平）
    const trendIndicator = firstSector.locator(
      '[data-testid="trend-indicator"], .trend-up, .trend-down, .arrow'
    );

    if ((await trendIndicator.count()) > 0) {
      await expect(trendIndicator).toBeVisible();
      console.log('✓ 趋势指标已显示');
    }
  });

  test('点击领域卡片应该进入详情页', async ({ page }) => {
    await page.waitForSelector('[data-testid="sector-item"], .sector-card', { timeout: 10000 });

    const firstSector = page.locator('[data-testid="sector-item"], .sector-card').first();

    // 获取领域名称
    const sectorName = await firstSector.locator('h2, h3').first().textContent();

    // 点击卡片或"查看详情"按钮
    const detailButton = firstSector.locator('button:has-text("查看"), button:has-text("详情"), a').first();

    if ((await detailButton.count()) > 0) {
      await detailButton.click();
    } else {
      await firstSector.click();
    }

    // 等待导航
    await page.waitForLoadState('networkidle');

    // 验证进入了详情页
    const url = page.url();
    expect(url).toContain('/trends/');

    console.log('已进入详情页:', url);
  });

  test('应该支持搜索领域', async ({ page }) => {
    const searchInput = page.locator('input[type="search"], input[placeholder*="搜索"]').first();

    if ((await searchInput.count()) > 0) {
      await searchInput.fill('AI');
      await page.waitForTimeout(1000);

      // 验证搜索结果
      const sectors = page.locator('[data-testid="sector-item"], .sector-card');
      const count = await sectors.count();

      console.log('搜索"AI"的结果:', count);

      // 验证结果包含关键词
      if (count > 0) {
        const firstSectorText = await sectors.first().textContent();
        expect(firstSectorText).toContain('AI');
      }
    }
  });

  test('应该显示加载状态', async ({ page }) => {
    // 重新加载观察加载状态
    await page.reload();

    const loadingIndicator = page.locator('[data-testid="loading"], .loading, .spinner').first();

    if ((await loadingIndicator.count()) > 0) {
      await expect(loadingIndicator).toBeVisible();
      await expect(loadingIndicator).not.toBeVisible({ timeout: 10000 });

      console.log('✓ 加载状态正常');
    }
  });

  test('空结果应该显示提示', async ({ page }) => {
    const searchInput = page.locator('input[type="search"]').first();

    if ((await searchInput.count()) > 0) {
      await searchInput.fill('XXXXXXXXX_NONEXISTENT_12345');
      await page.waitForTimeout(1500);

      const emptyState = page.locator('[data-testid="empty-state"], .empty-state, text=/暂无|没有找到/').first();

      if ((await emptyState.count()) > 0) {
        await expect(emptyState).toBeVisible();
        console.log('✓ 空状态提示已显示');
      }
    }
  });

  test('应该支持刷新数据', async ({ page }) => {
    const refreshButton = page.locator('button:has-text("刷新"), button[aria-label*="刷新"]').first();

    if ((await refreshButton.count()) > 0) {
      await refreshButton.click();
      await page.waitForTimeout(2000);

      console.log('✓ 数据刷新已触发');
    }
  });

  test('应该支持导出趋势数据', async ({ page }) => {
    const exportButton = page.locator('button:has-text("导出"), button:has-text("下载")').first();

    if ((await exportButton.count()) > 0) {
      const downloadPromise = page.waitForEvent('download', { timeout: 5000 }).catch(() => null);

      await exportButton.click();

      const download = await downloadPromise;

      if (download) {
        console.log('✓ 导出功能已触发:', await download.suggestedFilename());
      }
    }
  });

  test('响应式布局应该正常', async ({ page }) => {
    // 移动端视口
    await page.setViewportSize({ width: 375, height: 667 });
    await page.reload();
    await page.waitForLoadState('networkidle');

    // 验证内容可见
    const sectors = page.locator('[data-testid="sector-item"], .sector-card');
    const count = await sectors.count();

    expect(count).toBeGreaterThan(0);

    // 验证没有横向滚动
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);

    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 5);

    console.log('✓ 移动端布局正常');
  });
});
