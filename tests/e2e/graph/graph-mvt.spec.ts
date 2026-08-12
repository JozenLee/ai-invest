import { test, expect } from '@playwright/test';

/**
 * 知识图谱最小可行测试
 * 只验证能否启动创建流程，不等待AI完成
 */

test.describe('知识图谱最小可行测试', () => {
  test('验证创建流程启动', async ({ page }) => {
    console.log('步骤1: 访问主页');
    await page.goto('/graph');
    await expect(page.getByRole('heading', { name: '知识图谱' })).toBeVisible();

    console.log('步骤2: 点击新增');
    const createButton = page.getByRole('button', { name: /新增图谱/i });
    await createButton.click();
    await expect(page).toHaveURL('/graph/create');

    console.log('步骤3: 填写表单');
    const testName = `MVT测试-${Date.now()}`;
    await page.fill('input#name', testName);
    await page.fill('textarea#description', '最小可行测试');

    console.log('步骤4: 点击开始探索');
    const startButton = page.getByRole('button', { name: /开始探索/i });
    await startButton.click();

    console.log('步骤5: 等待AI探索开始');
    // 只等待探索开始，不等待完成
    await expect(
      page.getByText(/探索产业链结构|AI正在探索|exploring/i).first()
    ).toBeVisible({ timeout: 10000 });

    console.log('✓ 创建流程成功启动');
    console.log('提示: AI探索已开始，但完整流程需要3-5分钟');
  });

  test('验证编辑页面可访问', async ({ page }) => {
    console.log('步骤1: 访问主页');
    await page.goto('/graph');

    // 等待页面加载
    await page.waitForLoadState('networkidle');

    // 查找现有图谱
    const industryCards = page.locator('.cursor-pointer').filter({ hasText: /AI算力硬件|测试/i });
    const count = await industryCards.count();

    if (count > 0) {
      console.log(`步骤2: 找到 ${count} 个现有图谱`);

      // 点击第一个的编辑按钮
      const firstCard = industryCards.first();
      const editButton = firstCard.locator('button[title="编辑"]');

      if (await editButton.isVisible()) {
        await editButton.click();

        console.log('步骤3: 验证编辑页面加载');
        await expect(page.getByText(/编辑产业图谱/i)).toBeVisible({ timeout: 5000 });

        console.log('✓ 编辑页面可以正常访问');
      } else {
        console.log('⚠ 未找到编辑按钮');
      }
    } else {
      console.log('⚠ 没有现有图谱，跳过编辑测试');
    }
  });

  test('验证删除功能可用', async ({ page }) => {
    console.log('步骤1: 访问主页');
    await page.goto('/graph');
    await page.waitForLoadState('networkidle');

    // 查找测试图谱
    const testCards = page.locator('.cursor-pointer').filter({ hasText: /测试|MVT/i });
    const count = await testCards.count();

    if (count > 0) {
      console.log(`步骤2: 找到 ${count} 个测试图谱`);

      const deleteButton = testCards.first().locator('button[title="删除"]');

      if (await deleteButton.isVisible()) {
        await deleteButton.click();

        console.log('步骤3: 验证删除对话框');
        await expect(page.getByRole('heading', { name: /确认删除/i })).toBeVisible({ timeout: 3000 });

        // 取消删除（不实际删除）
        const cancelButton = page.getByRole('button', { name: /取消/i });
        await cancelButton.click();

        console.log('✓ 删除功能可用');
      } else {
        console.log('⚠ 未找到删除按钮');
      }
    } else {
      console.log('⚠ 没有测试图谱，跳过删除测试');
    }
  });
});
