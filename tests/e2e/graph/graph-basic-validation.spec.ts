import { test, expect } from '@playwright/test';

/**
 * 知识图谱基础功能验证测试
 * 快速验证核心页面是否可访问
 */

test.describe('知识图谱基础功能验证', () => {
  test('验证主页面加载', async ({ page }) => {
    await page.goto('/graph');

    // 验证页面标题（使用heading角色更精确）
    await expect(page.getByRole('heading', { name: '知识图谱' })).toBeVisible();

    // 验证新增按钮存在
    const createButton = page.getByRole('button', { name: /新增图谱/i });
    await expect(createButton).toBeVisible();

    console.log('✓ 主页面加载成功');
  });

  test('验证创建页面加载', async ({ page }) => {
    await page.goto('/graph/create');

    // 验证标题
    await expect(page.getByText(/AI驱动的产业链探索/i)).toBeVisible();

    // 验证表单字段
    await expect(page.locator('input#name')).toBeVisible();
    await expect(page.locator('textarea#description')).toBeVisible();

    console.log('✓ 创建页面加载成功');
  });

  test('验证表单验证', async ({ page }) => {
    await page.goto('/graph/create');

    // 空表单提交应该被阻止
    const startButton = page.getByRole('button', { name: /开始探索/i });
    await expect(startButton).toBeDisabled();

    // 填写名称后应该可以提交
    await page.fill('input#name', '测试产业');
    await expect(startButton).toBeEnabled();

    console.log('✓ 表单验证正常');
  });

  test('验证API连接', async ({ page }) => {
    // 测试API是否可访问
    const response = await page.request.get('/api/graph/industries');
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data).toHaveProperty('success');

    console.log('✓ API连接正常');
  });
});
