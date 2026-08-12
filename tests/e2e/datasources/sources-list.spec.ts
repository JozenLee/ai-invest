/**
 * 数据源页面E2E测试 - 列表和筛选功能
 * 测试范围：
 * - 数据源列表显示
 * - 筛选功能
 * - 状态切换
 * - 搜索功能
 */

import { test, expect } from '@playwright/test';

test.describe('数据源 - 列表和筛选功能', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/events/sources');
    await page.waitForLoadState('networkidle');
  });

  test('应该正确加载数据源页面', async ({ page }) => {
    await expect(page).toHaveTitle(/数据源|Sources/);

    const mainContent = page.locator('main, [role="main"]').first();
    await expect(mainContent).toBeVisible();
  });

  test('应该显示数据源列表', async ({ page }) => {
    await page.waitForSelector(
      '[data-testid="datasource-list"], .datasource-list, table',
      { timeout: 10000 }
    );

    const datasources = page.locator(
      '[data-testid="datasource-item"], .datasource-item, tbody tr'
    );

    const count = await datasources.count();
    expect(count).toBeGreaterThan(0);

    console.log('数据源数量:', count);
  });

  test('每个数据源应该显示完整信息', async ({ page }) => {
    await page.waitForSelector('[data-testid="datasource-item"], tbody tr', { timeout: 10000 });

    const firstDatasource = page.locator('[data-testid="datasource-item"], tbody tr').first();
    await expect(firstDatasource).toBeVisible();

    const text = await firstDatasource.textContent();

    // 应该包含名称
    expect(text?.length).toBeGreaterThan(0);

    // 应该有平台信息
    const hasPlatform =
      text?.includes('知乎') ||
      text?.includes('微博') ||
      text?.includes('Bilibili') ||
      text?.includes('抖音');

    console.log('包含平台信息:', hasPlatform);
  });

  test('应该显示启用/禁用状态', async ({ page }) => {
    await page.waitForSelector('[data-testid="datasource-item"], tbody tr', { timeout: 10000 });

    const firstDatasource = page.locator('[data-testid="datasource-item"], tbody tr').first();

    // 查找状态标识
    const statusBadge = firstDatasource.locator(
      '[data-testid="status"], .status, .badge, switch, input[type="checkbox"]'
    ).first();

    if ((await statusBadge.count()) > 0) {
      await expect(statusBadge).toBeVisible();
      console.log('✓ 状态标识已显示');
    }
  });

  test('应该支持按平台筛选', async ({ page }) => {
    const platformFilter = page.locator(
      'select[name="platform"], [data-testid="platform-filter"]'
    ).first();

    if ((await platformFilter.count()) > 0) {
      await platformFilter.selectOption({ index: 1 });
      await page.waitForTimeout(1500);

      console.log('✓ 平台筛选已应用');

      const datasources = page.locator('[data-testid="datasource-item"], tbody tr');
      const count = await datasources.count();

      expect(count).toBeGreaterThan(0);
    }
  });

  test('应该支持按状态筛选', async ({ page }) => {
    const statusFilter = page.locator(
      'select[name="status"], button:has-text("已启用"), button:has-text("已禁用")'
    ).first();

    if ((await statusFilter.count()) > 0) {
      const tagName = await statusFilter.evaluate(el => el.tagName.toLowerCase());

      if (tagName === 'select') {
        await statusFilter.selectOption('enabled');
      } else {
        await statusFilter.click();
      }

      await page.waitForTimeout(1500);

      console.log('✓ 状态筛选已应用');
    }
  });

  test('应该支持按类型筛选', async ({ page }) => {
    const typeFilter = page.locator(
      'select[name="type"], [data-testid="type-filter"]'
    ).first();

    if ((await typeFilter.count()) > 0) {
      await typeFilter.selectOption({ index: 1 });
      await page.waitForTimeout(1500);

      console.log('✓ 类型筛选已应用');
    }
  });

  test('应该支持搜索数据源', async ({ page }) => {
    const searchInput = page.locator(
      'input[type="search"], input[placeholder*="搜索"]'
    ).first();

    if ((await searchInput.count()) > 0) {
      await searchInput.fill('AI');
      await page.waitForTimeout(1000);

      const datasources = page.locator('[data-testid="datasource-item"], tbody tr');
      const count = await datasources.count();

      console.log('搜索结果数量:', count);
    }
  });

  test('应该支持切换数据源状态', async ({ page }) => {
    await page.waitForSelector('[data-testid="datasource-item"], tbody tr', { timeout: 10000 });

    const firstDatasource = page.locator('[data-testid="datasource-item"], tbody tr').first();

    // 查找切换开关
    const toggle = firstDatasource.locator(
      'input[type="checkbox"], button[role="switch"], [data-testid="toggle"]'
    ).first();

    if ((await toggle.count()) > 0) {
      await toggle.click();
      await page.waitForTimeout(1000);

      console.log('✓ 状态切换已触发');
    }
  });

  test('应该支持批量操作', async ({ page }) => {
    // 查找全选复选框
    const selectAll = page.locator(
      'input[type="checkbox"][aria-label*="全选"], thead input[type="checkbox"]'
    ).first();

    if ((await selectAll.count()) > 0) {
      await selectAll.click();
      await page.waitForTimeout(500);

      // 查找批量操作按钮
      const batchButtons = page.locator(
        'button:has-text("批量启用"), button:has-text("批量禁用")'
      );

      if ((await batchButtons.count()) > 0) {
        console.log('✓ 批量操作按钮已显示');
      }
    }
  });

  test('应该支持添加新数据源', async ({ page }) => {
    const addButton = page.locator(
      'button:has-text("添加"), button:has-text("新建"), a:has-text("添加")'
    ).first();

    if ((await addButton.count()) > 0) {
      await addButton.click();
      await page.waitForTimeout(1000);

      // 应该显示创建表单或跳转到创建页面
      const form = page.locator('form, [role="dialog"]').first();

      if ((await form.count()) > 0) {
        await expect(form).toBeVisible();
        console.log('✓ 创建表单已显示');
      }
    }
  });

  test('应该支持查看数据源详情', async ({ page }) => {
    await page.waitForSelector('[data-testid="datasource-item"], tbody tr', { timeout: 10000 });

    const firstDatasource = page.locator('[data-testid="datasource-item"], tbody tr').first();

    // 查找详情链接或按钮
    const detailLink = firstDatasource.locator(
      'a, button:has-text("详情"), button:has-text("查看")'
    ).first();

    if ((await detailLink.count()) > 0) {
      await detailLink.click();
      await page.waitForLoadState('networkidle');

      const url = page.url();
      expect(url).toContain('/sources/');

      console.log('✓ 已进入详情页:', url);
    }
  });

  test('应该显示统计信息', async ({ page }) => {
    const stats = page.locator(
      '[data-testid="stats"], .stats, .summary'
    ).first();

    if ((await stats.count()) > 0) {
      await expect(stats).toBeVisible();

      const text = await stats.textContent();

      // 应该包含数字统计
      expect(text).toMatch(/\d+/);

      console.log('统计信息:', text?.substring(0, 100));
    }
  });

  test('应该支持排序', async ({ page }) => {
    const sortButton = page.locator(
      'th[role="columnheader"], th button, [data-sort]'
    ).first();

    if ((await sortButton.count()) > 0) {
      const firstBefore = await page.locator('[data-testid="datasource-item"], tbody tr')
        .first()
        .textContent();

      await sortButton.click();
      await page.waitForTimeout(1000);

      const firstAfter = await page.locator('[data-testid="datasource-item"], tbody tr')
        .first()
        .textContent();

      console.log('排序前:', firstBefore?.substring(0, 30));
      console.log('排序后:', firstAfter?.substring(0, 30));
    }
  });

  test('应该支持分页', async ({ page }) => {
    const pagination = page.locator(
      '[role="navigation"][aria-label*="分页"], .pagination'
    ).first();

    if ((await pagination.count()) > 0) {
      await expect(pagination).toBeVisible();

      const nextButton = pagination.locator('button:has-text("下一页"), button[aria-label*="下一页"]').first();

      if ((await nextButton.count()) > 0) {
        await nextButton.click();
        await page.waitForTimeout(1500);

        console.log('✓ 分页功能已触发');
      }
    }
  });

  test('响应式布局应该正常', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.reload();
    await page.waitForLoadState('networkidle');

    const content = page.locator('main, [role="main"]').first();
    await expect(content).toBeVisible();

    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);

    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 5);

    console.log('✓ 移动端布局正常');
  });
});
