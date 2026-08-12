import { test, expect, Page } from '@playwright/test';

/**
 * 知识图谱简化E2E测试
 *
 * 目标：快速验证完整CRUD流程，最小化AI操作
 * 策略：
 * - 结构审核：直接确认，不提修改意见
 * - 企业审核：直接确认，不提修改意见
 * - 编辑阶段：跳过
 *
 * 预计耗时：5-8分钟
 */

// 辅助函数：提交审核反馈
async function submitReviewFeedback(
  page: Page,
  feedback: string,
  isApproval: boolean = false
) {
  console.log(`    📝 提交反馈: ${isApproval ? '直接确认' : feedback}`);

  const reviewPanel = page.locator('form, .space-y-4').filter({
    has: page.locator('textarea, button').filter({ hasText: /确认|批准|提交/i })
  }).first();

  await expect(reviewPanel).toBeVisible({ timeout: 10000 });

  if (isApproval) {
    const confirmButton = page.locator('button').filter({ hasText: /确认|批准|通过/i }).first();
    await expect(confirmButton).toBeVisible({ timeout: 5000 });
    await confirmButton.click();
  } else {
    const feedbackTextarea = page.locator('textarea').first();
    await expect(feedbackTextarea).toBeVisible({ timeout: 5000 });
    await feedbackTextarea.fill(feedback);

    const submitButton = page.locator('button').filter({ hasText: /提交|确认|发送/i }).first();
    await expect(submitButton).toBeVisible({ timeout: 5000 });
    await submitButton.click();
  }

  await page.waitForTimeout(2000);
  console.log('    ✓ 反馈已提交');
}

test.describe('知识图谱简化CRUD流程', () => {
  let industryId: string;
  let industryName: string;

  test('简化流程：快速创建->查看->删除', async ({ page }) => {
    console.log('\n========== 开始简化测试 ==========\n');

    // ========== 第1步：创建图谱（简化流程）==========
    await test.step('步骤1: 创建产业图谱', async () => {
      console.log('[步骤1] 开始创建产业图谱');

      await page.goto('/graph/create');
      console.log('  ✓ 进入创建页面');

      industryName = `简化测试-${Date.now()}`;
      await page.fill('input#name', industryName);
      await page.fill('textarea#description', '简化测试，快速验证流程');
      console.log(`  ✓ 填写产业信息: ${industryName}`);

      const startButton = page.getByRole('button', { name: /开始探索/i });
      await startButton.click();
      console.log('  ✓ 开始探索');

      await expect(page.getByText(/探索产业链结构|AI正在探索/i).first()).toBeVisible({ timeout: 10000 });
      console.log('  ✓ 进入探索流程');
    });

    await test.step('步骤2: 结构审核（直接确认）', async () => {
      console.log('[步骤2] 等待结构就绪...');

      await expect(
        page.getByText(/结构就绪|知识图谱就绪/i).first()
      ).toBeVisible({ timeout: 180000 }); // 3分钟
      console.log('  ✓ 结构探索完成');

      await submitReviewFeedback(page, '', true);
      console.log('  ✓ 结构审核已确认');
    });

    await test.step('步骤3: 企业审核（直接确认）', async () => {
      console.log('[步骤3] 等待企业信息就绪...');

      await expect(
        page.getByText(/企业信息就绪|知识图谱就绪/i).first()
      ).toBeVisible({ timeout: 240000 }); // 4分钟
      console.log('  ✓ 企业信息探索完成');

      await submitReviewFeedback(page, '', true);
      console.log('  ✓ 企业审核已确认');
    });

    await test.step('步骤4: 等待完成', async () => {
      console.log('[步骤4] 等待创建完成...');

      // 跳过图数据库写入阶段（如果存在）
      if (await page.getByText(/写入图数据库|writing to graph/i).first().isVisible()) {
        console.log('  图数据库写入阶段跳过，直接检查完成状态');
      }

      await expect(
        page.getByText(/创建完成|completed|产业图谱创建完成/i).first()
      ).toBeVisible({ timeout: 60000 });
      console.log('  ✓ 创建完成');
    });

    await test.step('步骤5: 跳转到详情页', async () => {
      console.log('[步骤5] 跳转到泳道图详情页');

      const viewButton = page.getByRole('button', { name: /查看泳道图/i });
      await viewButton.click();
      console.log('  ✓ 点击查看泳道图');

      await expect(page).toHaveURL(/\/graph\/industries\/[^/]+$/, { timeout: 5000 });
      industryId = page.url().split('/').pop()!;
      console.log(`  ✓ 跳转成功，产业ID: ${industryId}`);

      await expect(page.getByRole('heading', { name: /产业链泳道图/i })).toBeVisible();
      console.log('  ✓ 详情页加载完成');
    });

    // ========== 第2步：返回主页面 ==========
    await test.step('步骤6: 返回主页面', async () => {
      console.log('[步骤6] 返回主页面');

      const backButton = page.getByRole('button', { name: /返回/i });
      await backButton.click();
      console.log('  ✓ 点击返回');

      await expect(page).toHaveURL('/graph', { timeout: 5000 });
      console.log('  ✓ 返回主页面');

      await page.waitForTimeout(2000);
      await expect(page.getByText(new RegExp(industryName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'i')).first()).toBeVisible({ timeout: 5000 });
      console.log('  ✓ 图谱显示在列表中');
    });

    // ========== 第3步：删除图谱 ==========
    await test.step('步骤7: 删除图谱', async () => {
      console.log('[步骤7] 删除图谱');

      const cards = page.locator('.cursor-pointer').filter({ hasText: new RegExp(industryName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'i') });
      const beforeCount = await cards.count();
      console.log(`  找到 ${beforeCount} 个匹配的卡片`);
      expect(beforeCount).toBeGreaterThan(0);

      const deleteButton = cards.first().locator('button[title="删除"]');
      await deleteButton.click();
      console.log('  ✓ 点击删除按钮');

      await expect(page.getByText(/确认删除/i).first()).toBeVisible();
      const confirmButton = page.getByRole('button', { name: /确认删除/i });
      await confirmButton.click();
      console.log('  ✓ 确认删除');

      await expect(page.getByText(/确认删除/i).first()).not.toBeVisible({ timeout: 5000 });
      await page.waitForTimeout(3000);
      console.log('  ✓ 删除对话框已关闭');

      const afterCount = await page.locator('.cursor-pointer').filter({ hasText: new RegExp(industryName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'i') }).count();
      console.log(`  删除后剩余 ${afterCount} 个匹配的卡片`);
      expect(afterCount).toBeLessThan(beforeCount);
      console.log('  ✓ 图谱已从列表中移除');
    });

    console.log('\n========== 简化测试完成 ==========\n');
  });
});
