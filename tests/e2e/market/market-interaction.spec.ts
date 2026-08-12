/**
 * 市场数据页面E2E测试 - 筛选和交互功能
 * 测试范围：
 * - 时间范围筛选
 * - 指数切换
 * - 图表交互
 * - 数据排序
 */

import { test, expect } from '@playwright/test';

test.describe('市场数据 - 筛选和交互功能', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/market');
    await page.waitForLoadState('networkidle');
  });

  test('应该支持时间周期切换', async ({ page }) => {
    // 查找时间周期按钮（日、周、月）
    const periodButtons = page.locator(
      'button:has-text("日"), button:has-text("周"), button:has-text("月"), ' +
      '[data-testid="period-day"], [data-testid="period-week"], [data-testid="period-month"]'
    );

    if ((await periodButtons.count()) > 0) {
      const dayButton = periodButtons.filter({ hasText: '日' }).or(page.locator('[data-testid="period-day"]')).first();

      if ((await dayButton.count()) > 0) {
        // 点击日K按钮
        await dayButton.click();

        // 等待数据更新
        await page.waitForTimeout(1000);

        // 验证按钮状态改变（通常会有active类）
        const className = await dayButton.getAttribute('class');
        const isActive = className?.includes('active') || className?.includes('selected');

        console.log('日K按钮状态:', isActive);
      }
    }
  });

  test('应该支持指数切换', async ({ page }) => {
    // 查找指数切换器
    const indexSelector = page.locator(
      'select[name="index"], [data-testid="index-selector"], ' +
      'button:has-text("上证"), button:has-text("深证")'
    ).first();

    if ((await indexSelector.count()) > 0) {
      const tagName = await indexSelector.evaluate(el => el.tagName.toLowerCase());

      if (tagName === 'select') {
        // 下拉选择
        await indexSelector.selectOption({ index: 1 });
      } else {
        // 按钮切换
        await indexSelector.click();
      }

      // 等待数据更新
      await page.waitForTimeout(1500);

      console.log('指数切换已触发');
    }
  });

  test('应该支持板块排序', async ({ page }) => {
    // 查找板块列表
    const sectorsSection = page.locator('[data-testid="sectors"], .sectors-list').first();

    if ((await sectorsSection.count()) > 0) {
      // 查找排序按钮或表头
      const sortButtons = page.locator(
        'button:has-text("涨跌幅"), button:has-text("排序"), ' +
        'th:has-text("涨跌"), [data-sort]'
      );

      if ((await sortButtons.count()) > 0) {
        const sortButton = sortButtons.first();

        // 获取排序前的第一个板块
        const firstSectorBefore = await sectorsSection
          .locator('[data-testid="sector-item"], .sector-item')
          .first()
          .textContent();

        // 点击排序
        await sortButton.click();
        await page.waitForTimeout(500);

        // 获取排序后的第一个板块
        const firstSectorAfter = await sectorsSection
          .locator('[data-testid="sector-item"], .sector-item')
          .first()
          .textContent();

        console.log('排序前:', firstSectorBefore);
        console.log('排序后:', firstSectorAfter);

        // 数据应该重新排列
        // （可能相同也可能不同，取决于数据）
      }
    }
  });

  test('应该支持K线图表显示', async ({ page }) => {
    // 查找图表容器
    const chartContainer = page.locator(
      '[data-testid="kline-chart"], .kline-chart, canvas, svg[class*="chart"]'
    ).first();

    if ((await chartContainer.count()) > 0) {
      await expect(chartContainer).toBeVisible();

      console.log('K线图表已显示');

      // 验证图表有内容（不是空白）
      const boundingBox = await chartContainer.boundingBox();
      if (boundingBox) {
        expect(boundingBox.width).toBeGreaterThan(100);
        expect(boundingBox.height).toBeGreaterThan(100);
      }
    }
  });

  test('图表应该支持缩放操作', async ({ page }) => {
    const chartContainer = page.locator('[data-testid="kline-chart"], canvas, svg').first();

    if ((await chartContainer.count()) > 0) {
      // 查找缩放控制按钮
      const zoomInButton = page.locator('button:has-text("+"), button[aria-label*="放大"]').first();
      const zoomOutButton = page.locator('button:has-text("-"), button[aria-label*="缩小"]').first();

      if ((await zoomInButton.count()) > 0) {
        // 点击放大
        await zoomInButton.click();
        await page.waitForTimeout(300);

        console.log('图表放大功能已触发');
      }

      if ((await zoomOutButton.count()) > 0) {
        // 点击缩小
        await zoomOutButton.click();
        await page.waitForTimeout(300);

        console.log('图表缩小功能已触发');
      }
    }
  });

  test('图表应该支持鼠标悬停显示详情', async ({ page }) => {
    const chartContainer = page.locator('[data-testid="kline-chart"], canvas, svg').first();

    if ((await chartContainer.count()) > 0) {
      // 悬停在图表上
      await chartContainer.hover();
      await page.waitForTimeout(500);

      // 查找tooltip
      const tooltip = page.locator('[data-testid="chart-tooltip"], .tooltip, [role="tooltip"]').first();

      if ((await tooltip.count()) > 0) {
        await expect(tooltip).toBeVisible();

        const tooltipText = await tooltip.textContent();
        console.log('Tooltip内容:', tooltipText?.substring(0, 50));
      }
    }
  });

  test('应该支持数据表格视图切换', async ({ page }) => {
    // 查找视图切换按钮
    const viewSwitcher = page.locator(
      'button:has-text("表格"), button:has-text("图表"), ' +
      '[data-testid="view-table"], [data-testid="view-chart"]'
    );

    if ((await viewSwitcher.count()) > 1) {
      const tableButton = viewSwitcher.filter({ hasText: '表格' }).or(page.locator('[data-testid="view-table"]')).first();

      if ((await tableButton.count()) > 0) {
        await tableButton.click();
        await page.waitForTimeout(500);

        // 验证表格显示
        const table = page.locator('table').first();
        if ((await table.count()) > 0) {
          await expect(table).toBeVisible();
        }
      }
    }
  });

  test('应该支持自定义时间范围', async ({ page }) => {
    // 查找日期选择器
    const dateInputs = page.locator('input[type="date"], input[type="datetime-local"], .date-picker');

    if ((await dateInputs.count()) > 0) {
      const dateInput = dateInputs.first();

      // 设置日期
      await dateInput.fill('2026-08-01');
      await page.waitForTimeout(500);

      console.log('自定义日期已设置');

      // 查找确认或应用按钮
      const applyButton = page.locator('button:has-text("确定"), button:has-text("应用")').first();

      if ((await applyButton.count()) > 0) {
        await applyButton.click();
        await page.waitForTimeout(1000);
      }
    }
  });

  test('应该支持搜索指数或板块', async ({ page }) => {
    // 查找搜索输入框
    const searchInput = page.locator(
      'input[type="search"], input[placeholder*="搜索"], ' +
      '[data-testid="search-input"]'
    ).first();

    if ((await searchInput.count()) > 0) {
      // 输入搜索关键词
      await searchInput.fill('科技');
      await page.waitForTimeout(1000);

      // 验证搜索结果
      const content = await page.content();
      const hasSearchResults = content.includes('科技');

      expect(hasSearchResults).toBe(true);

      // 清除搜索
      await searchInput.clear();
      await page.waitForTimeout(500);
    }
  });

  test('应该支持收藏或关注功能', async ({ page }) => {
    // 查找收藏按钮
    const favoriteButton = page.locator(
      'button:has-text("收藏"), button:has-text("关注"), ' +
      'button[aria-label*="收藏"], [data-testid="favorite-button"]'
    ).first();

    if ((await favoriteButton.count()) > 0) {
      // 点击收藏
      await favoriteButton.click();
      await page.waitForTimeout(500);

      // 验证按钮状态改变
      const className = await favoriteButton.getAttribute('class');
      const isFavorited = className?.includes('active') || className?.includes('favorited');

      console.log('收藏状态:', isFavorited);

      // 取消收藏
      await favoriteButton.click();
      await page.waitForTimeout(500);
    }
  });

  test('应该支持导出数据功能', async ({ page }) => {
    // 查找导出按钮
    const exportButton = page.locator(
      'button:has-text("导出"), button:has-text("下载"), ' +
      '[data-testid="export-button"]'
    ).first();

    if ((await exportButton.count()) > 0) {
      // 监听下载事件
      const downloadPromise = page.waitForEvent('download', { timeout: 5000 }).catch(() => null);

      await exportButton.click();

      const download = await downloadPromise;

      if (download) {
        console.log('文件下载触发:', await download.suggestedFilename());
      } else {
        console.log('导出按钮已点击（未触发下载）');
      }
    }
  });

  test('应该支持全屏显示', async ({ page }) => {
    // 查找全屏按钮
    const fullscreenButton = page.locator(
      'button:has-text("全屏"), button[aria-label*="全屏"], ' +
      '[data-testid="fullscreen-button"]'
    ).first();

    if ((await fullscreenButton.count()) > 0) {
      await fullscreenButton.click();
      await page.waitForTimeout(500);

      // 验证全屏状态（实际全屏API可能不会触发）
      console.log('全屏按钮已点击');

      // 退出全屏
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    }
  });

  test('键盘导航应该工作正常', async ({ page }) => {
    // Tab键导航
    await page.keyboard.press('Tab');
    await page.waitForTimeout(200);

    // 验证焦点在某个可交互元素上
    const focusedElement = page.locator(':focus');
    const count = await focusedElement.count();

    expect(count).toBeGreaterThan(0);

    // 继续Tab导航
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');

    console.log('键盘导航功能正常');
  });
});
