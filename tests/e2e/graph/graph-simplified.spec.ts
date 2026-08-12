import { test, expect } from '@playwright/test';

/**
 * 知识图谱简化CRUD测试
 * 用于快速验证核心流程是否工作
 */

test.describe('知识图谱简化测试', () => {
  test('简化流程：仅验证页面导航', async ({ page }) => {
    // 1. 访问主页
    await page.goto('/graph');
    await expect(page.getByRole('heading', { name: '知识图谱' })).toBeVisible();
    console.log('✓ 主页加载成功');

    // 2. 点击新增
    const createButton = page.getByRole('button', { name: /新增图谱/i });
    await createButton.click();
    await expect(page).toHaveURL('/graph/create');
    console.log('✓ 进入创建页面');

    // 3. 填写表单
    const testName = `简化测试-${Date.now()}`;
    await page.fill('input#name', testName);
    await page.fill('textarea#description', '简化测试用例');
    console.log('✓ 表单填写完成');

    // 4. 检查开始按钮
    const startButton = page.getByRole('button', { name: /开始探索/i });
    await expect(startButton).toBeEnabled();
    console.log('✓ 开始按钮可用');

    // 不实际启动AI创建，只验证到这里
    console.log('✓ 核心页面流程验证通过');
  });

  test('验证现有图谱列表加载', async ({ page }) => {
    await page.goto('/graph');

    // 等待页面加载完成
    await page.waitForLoadState('networkidle');

    // 检查是否有图谱或空状态
    const hasGraphs = await page.locator('.cursor-pointer').count() > 0;
    const hasEmptyState = await page.getByText(/暂无产业图谱/i).isVisible().catch(() => false);

    expect(hasGraphs || hasEmptyState).toBeTruthy();
    console.log(`✓ 图谱列表加载成功 (${hasGraphs ? '有数据' : '空状态'})`);
  });

  test('验证API端点响应', async ({ page }) => {
    // 测试产业列表API
    const industriesResponse = await page.request.get('/api/graph/industries');
    expect(industriesResponse.ok()).toBeTruthy();
    console.log('✓ 产业列表API正常');

    const industriesData = await industriesResponse.json();
    expect(industriesData).toHaveProperty('success');
    console.log(`✓ API返回格式正确: ${JSON.stringify(industriesData).substring(0, 100)}`);
  });
});
