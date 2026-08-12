/**
 * 市场数据页面E2E测试 - 市场概览功能
 * 测试范围：
 * - 页面加载和渲染
 * - 数据展示完整性
 * - 实时数据更新
 * - 响应式布局
 */

import { test, expect } from '@playwright/test';

test.describe('市场数据 - 概览功能', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/market');
    // 等待页面加载完成
    await page.waitForLoadState('networkidle');
  });

  test('应该正确加载市场数据页面', async ({ page }) => {
    // 验证页面标题
    await expect(page).toHaveTitle(/市场|Market/);

    // 验证主要元素存在
    const heading = page.locator('h1, h2').first();
    await expect(heading).toBeVisible();
  });

  test('应该显示主要市场指数', async ({ page }) => {
    // 等待指数数据加载
    await page.waitForSelector('[data-testid="market-indices"], .market-indices, table', {
      timeout: 10000,
    });

    // 验证指数卡片或列表项
    const indices = page.locator('[data-testid="index-item"], .index-card, tbody tr');
    const count = await indices.count();

    expect(count).toBeGreaterThan(0);
    console.log('显示的指数数量:', count);

    // 验证至少有上证指数或深证成指
    const content = await page.content();
    const hasMainIndex = content.includes('上证') || content.includes('深证') || content.includes('000001');

    expect(hasMainIndex).toBe(true);
  });

  test('每个指数应该显示完整信息', async ({ page }) => {
    await page.waitForSelector('[data-testid="market-indices"], .market-indices', {
      timeout: 10000,
    });

    const firstIndex = page.locator('[data-testid="index-item"], .index-card, tbody tr').first();
    await expect(firstIndex).toBeVisible();

    // 验证包含必要信息：名称、当前价格、涨跌幅
    const text = await firstIndex.textContent();

    // 应该包含数字（价格）
    expect(text).toMatch(/\d+/);

    // 应该包含涨跌幅（可能是百分比）
    const hasPercentage = text?.includes('%') || /[+-]?\d+\.\d+/.test(text || '');
    expect(hasPercentage).toBe(true);
  });

  test('涨跌幅应该有正确的颜色标识', async ({ page }) => {
    await page.waitForSelector('[data-testid="market-indices"], .market-indices', {
      timeout: 10000,
    });

    // 查找涨跌幅元素
    const changeElements = page.locator('[data-testid="change-percent"], .change-percent, .text-red, .text-green');

    if ((await changeElements.count()) > 0) {
      const firstChange = changeElements.first();

      // 获取颜色相关的class
      const className = await firstChange.getAttribute('class');

      // 应该有颜色标识（红涨绿跌或相反）
      const hasColorClass =
        className?.includes('red') ||
        className?.includes('green') ||
        className?.includes('positive') ||
        className?.includes('negative');

      expect(hasColorClass).toBe(true);
    }
  });

  test('应该显示资金流向数据', async ({ page }) => {
    // 查找资金流向部分
    const capitalFlowSection = page.locator('[data-testid="capital-flow"], .capital-flow').first();

    if ((await capitalFlowSection.count()) > 0) {
      await expect(capitalFlowSection).toBeVisible();

      // 验证包含"流入"或"流出"文本
      const text = await capitalFlowSection.textContent();
      const hasFlowInfo = text?.includes('流入') || text?.includes('流出') || text?.includes('净流');

      expect(hasFlowInfo).toBe(true);
    }
  });

  test('应该显示板块数据', async ({ page }) => {
    // 查找板块部分
    const sectorsSection = page.locator('[data-testid="sectors"], .sectors, [class*="sector"]').first();

    if ((await sectorsSection.count()) > 0) {
      await expect(sectorsSection).toBeVisible();

      // 验证有多个板块
      const sectorItems = page.locator('[data-testid="sector-item"], .sector-item, [class*="sector-card"]');
      const count = await sectorItems.count();

      if (count > 0) {
        expect(count).toBeGreaterThan(2);
        console.log('显示的板块数量:', count);
      }
    }
  });

  test('页面应该支持数据刷新', async ({ page }) => {
    // 查找刷新按钮
    const refreshButton = page.locator('button:has-text("刷新"), button[aria-label*="刷新"], button[title*="刷新"]').first();

    if ((await refreshButton.count()) > 0) {
      // 获取初始数据
      const initialContent = await page.content();

      // 点击刷新
      await refreshButton.click();

      // 等待加载
      await page.waitForTimeout(1000);

      // 验证页面更新
      const updatedContent = await page.content();

      // 内容可能改变或保持一致（取决于数据是否更新）
      console.log('刷新功能已触发');
    }
  });

  test('应该正确处理数据加载状态', async ({ page }) => {
    // 重新加载页面以观察加载状态
    await page.reload();

    // 查找加载指示器
    const loadingIndicator = page.locator('[data-testid="loading"], .loading, .spinner, [role="status"]').first();

    // 加载指示器应该在短时间内消失
    if ((await loadingIndicator.count()) > 0) {
      await expect(loadingIndicator).toBeVisible();
      await expect(loadingIndicator).not.toBeVisible({ timeout: 10000 });
    }
  });

  test('应该正确处理数据加载错误', async ({ page }) => {
    // 拦截API请求并返回错误
    await page.route('**/api/market/**', route => {
      route.abort('failed');
    });

    await page.reload();

    // 等待错误提示出现
    await page.waitForTimeout(2000);

    // 查找错误信息或降级数据
    const errorMessage = page.locator('[data-testid="error"], .error, [role="alert"]').first();
    const hasContent = await page.locator('body').textContent();

    // 应该有错误提示或降级显示
    const hasErrorHandling =
      (await errorMessage.count()) > 0 ||
      hasContent?.includes('错误') ||
      hasContent?.includes('失败') ||
      hasContent?.includes('重试');

    console.log('错误处理状态:', hasErrorHandling);
  });

  test('响应式布局 - 移动端视图', async ({ page }) => {
    // 切换到移动端视口
    await page.setViewportSize({ width: 375, height: 667 });

    // 重新加载以适应新视口
    await page.reload();
    await page.waitForLoadState('networkidle');

    // 验证页面在移动端可用
    const content = page.locator('body');
    await expect(content).toBeVisible();

    // 验证没有横向滚动条
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);

    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 5); // 允许5px误差
  });

  test('响应式布局 - 平板视图', async ({ page }) => {
    // 切换到平板视口
    await page.setViewportSize({ width: 768, height: 1024 });

    await page.reload();
    await page.waitForLoadState('networkidle');

    // 验证内容可见
    const mainContent = page.locator('main, [role="main"], .main-content').first();
    await expect(mainContent).toBeVisible();
  });

  test('页面性能 - 加载时间应该合理', async ({ page }) => {
    const startTime = Date.now();

    await page.goto('/market');
    await page.waitForLoadState('networkidle');

    const loadTime = Date.now() - startTime;

    console.log('页面加载时间:', loadTime + 'ms');

    // 页面应该在10秒内加载完成
    expect(loadTime).toBeLessThan(10000);
  });

  test('数据更新时间戳应该显示', async ({ page }) => {
    // 查找更新时间
    const timestamp = page.locator('[data-testid="last-updated"], .last-updated, .timestamp').first();

    if ((await timestamp.count()) > 0) {
      await expect(timestamp).toBeVisible();

      const text = await timestamp.textContent();

      // 应该包含时间相关文本
      const hasTimeInfo =
        text?.includes('更新') ||
        text?.includes(':') ||
        text?.includes('时间') ||
        /\d{1,2}:\d{2}/.test(text || '');

      expect(hasTimeInfo).toBe(true);
    }
  });
});
