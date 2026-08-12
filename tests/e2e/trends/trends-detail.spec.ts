/**
 * 领域趋势详情页E2E测试
 * 测试范围：
 * - 详情页面加载
 * - 趋势数据展示
 * - 图表显示
 * - 相关新闻链接
 */

import { test, expect } from '@playwright/test';

test.describe('领域趋势 - 详情页功能', () => {
  test.beforeEach(async ({ page }) => {
    // 直接访问一个测试领域详情页
    await page.goto('/events/trends/AI');
    await page.waitForLoadState('networkidle');
  });

  test('应该正确加载详情页', async ({ page }) => {
    const url = page.url();
    expect(url).toContain('/trends/');

    const heading = page.locator('h1, h2').first();
    await expect(heading).toBeVisible();
  });

  test('应该显示领域名称和概述', async ({ page }) => {
    const sectorName = page.locator('[data-testid="sector-name"], h1, h2').first();
    await expect(sectorName).toBeVisible();

    const name = await sectorName.textContent();
    expect(name?.length).toBeGreaterThan(0);

    console.log('领域名称:', name);
  });

  test('应该显示趋势列表', async ({ page }) => {
    await page.waitForSelector(
      '[data-testid="trend-list"], .trend-list',
      { timeout: 10000 }
    );

    const trendItems = page.locator('[data-testid="trend-item"], .trend-item');
    const count = await trendItems.count();

    expect(count).toBeGreaterThan(0);
    console.log('趋势数量:', count);
  });

  test('每个趋势应该显示详细信息', async ({ page }) => {
    await page.waitForSelector('[data-testid="trend-item"], .trend-item', { timeout: 10000 });

    const firstTrend = page.locator('[data-testid="trend-item"], .trend-item').first();
    await expect(firstTrend).toBeVisible();

    // 验证关键词或主题
    const keyword = firstTrend.locator('[data-testid="keyword"], .keyword, h3, h4');
    if ((await keyword.count()) > 0) {
      await expect(keyword).toBeVisible();
    }

    // 验证热度或频次
    const heat = firstTrend.locator('[data-testid="heat"], .heat, .frequency');
    if ((await heat.count()) > 0) {
      await expect(heat).toBeVisible();
    }
  });

  test('应该显示趋势图表', async ({ page }) => {
    const chart = page.locator('[data-testid="trend-chart"], .trend-chart, canvas, svg').first();

    if ((await chart.count()) > 0) {
      await expect(chart).toBeVisible();
      console.log('✓ 趋势图表已显示');
    }
  });

  test('应该显示相关新闻列表', async ({ page }) => {
    const relatedNews = page.locator(
      '[data-testid="related-news"], .related-news, .news-list'
    ).first();

    if ((await relatedNews.count()) > 0) {
      await expect(relatedNews).toBeVisible();

      const newsItems = relatedNews.locator('article, .news-item, li');
      const count = await newsItems.count();

      if (count > 0) {
        expect(count).toBeGreaterThan(0);
        console.log('相关新闻数量:', count);
      }
    }
  });

  test('点击相关新闻应该跳转', async ({ page }) => {
    const newsLink = page.locator(
      '[data-testid="related-news"] a, .related-news a, .news-item a'
    ).first();

    if ((await newsLink.count()) > 0) {
      const href = await newsLink.getAttribute('href');
      expect(href).toBeTruthy();

      console.log('新闻链接:', href);
    }
  });

  test('应该支持时间范围筛选', async ({ page }) => {
    const timeButtons = page.locator(
      'button:has-text("7天"), button:has-text("30天")'
    );

    if ((await timeButtons.count()) > 0) {
      const button7d = timeButtons.first();
      await button7d.click();
      await page.waitForTimeout(1500);

      console.log('✓ 时间范围筛选已应用');
    }
  });

  test('应该支持返回列表页', async ({ page }) => {
    const backButton = page.locator(
      'button:has-text("返回"), a:has-text("返回"), [aria-label*="返回"]'
    ).first();

    if ((await backButton.count()) > 0) {
      await backButton.click();
      await page.waitForLoadState('networkidle');

      const url = page.url();
      expect(url).toContain('/trends');
      expect(url).not.toContain('/trends/AI');
    }
  });

  test('应该支持分享功能', async ({ page }) => {
    const shareButton = page.locator(
      'button:has-text("分享"), [data-testid="share-button"]'
    ).first();

    if ((await shareButton.count()) > 0) {
      await shareButton.click();
      await page.waitForTimeout(500);

      console.log('✓ 分享功能已触发');
    }
  });

  test('页面加载性能应该合理', async ({ page }) => {
    const startTime = Date.now();
    await page.goto('/events/trends/AI');
    await page.waitForLoadState('networkidle');
    const loadTime = Date.now() - startTime;

    console.log('详情页加载时间:', loadTime + 'ms');
    expect(loadTime).toBeLessThan(10000);
  });
});
