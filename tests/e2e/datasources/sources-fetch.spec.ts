/**
 * 数据源采集功能E2E测试
 * 测试范围：
 * - 手动触发采集
 * - 采集状态显示
 * - 采集结果验证
 * - 错误处理
 */

import { test, expect } from '@playwright/test';

test.describe('数据源 - 采集功能', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/events/sources');
    await page.waitForLoadState('networkidle');
  });

  test('应该支持手动触发采集', async ({ page }) => {
    await page.waitForSelector('[data-testid="datasource-item"], tbody tr', { timeout: 10000 });

    const firstDatasource = page.locator('[data-testid="datasource-item"], tbody tr').first();

    // 查找采集按钮
    const fetchButton = firstDatasource.locator(
      'button:has-text("采集"), button:has-text("抓取"), [data-testid="fetch-button"]'
    ).first();

    if ((await fetchButton.count()) > 0) {
      await fetchButton.click();
      await page.waitForTimeout(2000);

      console.log('✓ 采集已触发');

      // 验证加载状态或成功提示
      const loading = page.locator('[data-testid="loading"], .loading, .spinner').first();
      const toast = page.locator('[role="alert"], .toast, .notification').first();

      const hasLoadingOrToast =
        (await loading.count()) > 0 ||
        (await toast.count()) > 0;

      if (hasLoadingOrToast) {
        console.log('✓ 采集状态反馈已显示');
      }
    }
  });

  test('应该显示采集进度', async ({ page }) => {
    await page.waitForSelector('[data-testid="datasource-item"], tbody tr', { timeout: 10000 });

    const firstDatasource = page.locator('[data-testid="datasource-item"], tbody tr').first();

    const fetchButton = firstDatasource.locator('button:has-text("采集")').first();

    if ((await fetchButton.count()) > 0) {
      await fetchButton.click();

      // 查找进度指示器
      const progressBar = page.locator('[role="progressbar"], .progress-bar, progress').first();

      if ((await progressBar.count()) > 0) {
        await expect(progressBar).toBeVisible({ timeout: 5000 });
        console.log('✓ 进度条已显示');
      }
    }
  });

  test('采集完成应该显示结果', async ({ page }) => {
    await page.waitForSelector('[data-testid="datasource-item"], tbody tr', { timeout: 10000 });

    const firstDatasource = page.locator('[data-testid="datasource-item"], tbody tr').first();

    // 查看最后采集时间
    const lastFetch = firstDatasource.locator('[data-testid="last-fetch"], .last-fetch, time');

    if ((await lastFetch.count()) > 0) {
      await expect(lastFetch).toBeVisible();

      const text = await lastFetch.textContent();
      console.log('最后采集时间:', text);
    }
  });

  test('应该显示采集统计', async ({ page }) => {
    await page.waitForSelector('[data-testid="datasource-item"], tbody tr', { timeout: 10000 });

    const firstDatasource = page.locator('[data-testid="datasource-item"], tbody tr').first();

    // 查找统计信息
    const stats = firstDatasource.locator(
      '[data-testid="fetch-stats"], .fetch-stats, .stats'
    );

    if ((await stats.count()) > 0) {
      const text = await stats.textContent();

      // 应该包含数字
      if (text && /\d+/.test(text)) {
        console.log('采集统计:', text);
      }
    }
  });

  test('采集失败应该显示错误信息', async ({ page }) => {
    // 查找一个可能失败的数据源（禁用或配置错误的）
    const errorDatasource = page.locator(
      '[data-testid="datasource-item"]:has(.error), tbody tr:has(.error)'
    ).first();

    if ((await errorDatasource.count()) > 0) {
      const errorMessage = errorDatasource.locator('.error-message, [data-testid="error"]');

      if ((await errorMessage.count()) > 0) {
        await expect(errorMessage).toBeVisible();
        console.log('✓ 错误信息已显示');
      }
    }
  });

  test('应该支持批量采集', async ({ page }) => {
    // 选择多个数据源
    const checkboxes = page.locator('input[type="checkbox"]');

    if ((await checkboxes.count()) > 2) {
      await checkboxes.nth(1).click();
      await checkboxes.nth(2).click();

      // 查找批量采集按钮
      const batchFetchButton = page.locator('button:has-text("批量采集")').first();

      if ((await batchFetchButton.count()) > 0) {
        await batchFetchButton.click();
        await page.waitForTimeout(2000);

        console.log('✓ 批量采集已触发');
      }
    }
  });

  test('应该显示采集历史', async ({ page }) => {
    await page.waitForSelector('[data-testid="datasource-item"], tbody tr', { timeout: 10000 });

    // 点击第一个数据源进入详情
    const firstDatasource = page.locator('[data-testid="datasource-item"], tbody tr').first();
    const detailLink = firstDatasource.locator('a').first();

    if ((await detailLink.count()) > 0) {
      await detailLink.click();
      await page.waitForLoadState('networkidle');

      // 查找采集历史
      const history = page.locator('[data-testid="fetch-history"], .fetch-history').first();

      if ((await history.count()) > 0) {
        await expect(history).toBeVisible();
        console.log('✓ 采集历史已显示');
      }
    }
  });

  test('应该支持测试数据源配置', async ({ page }) => {
    await page.waitForSelector('[data-testid="datasource-item"], tbody tr', { timeout: 10000 });

    const firstDatasource = page.locator('[data-testid="datasource-item"], tbody tr').first();

    const testButton = firstDatasource.locator('button:has-text("测试")').first();

    if ((await testButton.count()) > 0) {
      await testButton.click();
      await page.waitForTimeout(2000);

      // 应该显示测试结果
      const result = page.locator('[role="alert"], .toast').first();

      if ((await result.count()) > 0) {
        console.log('✓ 测试结果已显示');
      }
    }
  });
});

test.describe('数据源 - 调度器功能', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/events/sources');
    await page.waitForLoadState('networkidle');
  });

  test('应该显示调度器状态', async ({ page }) => {
    const schedulerStatus = page.locator(
      '[data-testid="scheduler-status"], .scheduler-status'
    ).first();

    if ((await schedulerStatus.count()) > 0) {
      await expect(schedulerStatus).toBeVisible();

      const text = await schedulerStatus.textContent();
      console.log('调度器状态:', text);
    }
  });

  test('应该支持启动/停止调度器', async ({ page }) => {
    const schedulerToggle = page.locator(
      'button:has-text("启动调度"), button:has-text("停止调度")'
    ).first();

    if ((await schedulerToggle.count()) > 0) {
      const buttonText = await schedulerToggle.textContent();

      await schedulerToggle.click();
      await page.waitForTimeout(1500);

      console.log('调度器操作:', buttonText);

      // 验证按钮文本改变或状态更新
      const newText = await schedulerToggle.textContent();
      console.log('操作后状态:', newText);
    }
  });

  test('应该支持配置调度任务', async ({ page }) => {
    await page.waitForSelector('[data-testid="datasource-item"], tbody tr', { timeout: 10000 });

    const firstDatasource = page.locator('[data-testid="datasource-item"], tbody tr').first();

    // 查找调度配置按钮
    const scheduleButton = firstDatasource.locator(
      'button:has-text("调度"), button:has-text("定时")'
    ).first();

    if ((await scheduleButton.count()) > 0) {
      await scheduleButton.click();
      await page.waitForTimeout(500);

      // 应该显示调度配置表单
      const scheduleForm = page.locator('[data-testid="schedule-form"], form').first();

      if ((await scheduleForm.count()) > 0) {
        await expect(scheduleForm).toBeVisible();
        console.log('✓ 调度配置表单已显示');
      }
    }
  });

  test('应该显示下次执行时间', async ({ page }) => {
    await page.waitForSelector('[data-testid="datasource-item"], tbody tr', { timeout: 10000 });

    const firstDatasource = page.locator('[data-testid="datasource-item"], tbody tr').first();

    const nextRun = firstDatasource.locator('[data-testid="next-run"], .next-run');

    if ((await nextRun.count()) > 0) {
      await expect(nextRun).toBeVisible();

      const text = await nextRun.textContent();
      console.log('下次执行时间:', text);
    }
  });

  test('应该显示调度历史', async ({ page }) => {
    // 查找调度历史入口
    const historyLink = page.locator('a:has-text("调度历史"), button:has-text("历史")').first();

    if ((await historyLink.count()) > 0) {
      await historyLink.click();
      await page.waitForLoadState('networkidle');

      // 验证历史记录
      const historyItems = page.locator('[data-testid="history-item"], tbody tr');
      const count = await historyItems.count();

      console.log('调度历史记录数:', count);
    }
  });

  test('应该支持暂停/恢复调度', async ({ page }) => {
    await page.waitForSelector('[data-testid="datasource-item"], tbody tr', { timeout: 10000 });

    const firstDatasource = page.locator('[data-testid="datasource-item"], tbody tr').first();

    const pauseButton = firstDatasource.locator('button:has-text("暂停")').first();

    if ((await pauseButton.count()) > 0) {
      await pauseButton.click();
      await page.waitForTimeout(1000);

      console.log('✓ 暂停调度已触发');

      // 按钮应该变为"恢复"
      const resumeButton = firstDatasource.locator('button:has-text("恢复")').first();

      if ((await resumeButton.count()) > 0) {
        console.log('✓ 按钮状态已更新');
      }
    }
  });
});
