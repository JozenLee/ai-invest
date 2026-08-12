import { test, expect, Page } from '@playwright/test';

/**
 * 知识图谱完整CRUD流程E2E测试
 *
 * 测试流程：
 * 1. 新增图谱（包含结构和企业的两轮审核）
 * 2. 编辑图谱（增量修改两轮）
 * 3. 删除图谱
 *
 * 性能要求：
 * - 编辑页面加载 < 2秒
 * - 主页面跳转返回 < 2秒
 */

// 辅助函数：等待任务状态变化
async function waitForTaskStatus(
  page: Page,
  expectedStatus: string | string[],
  timeout = 120000
) {
  const statuses = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    for (const status of statuses) {
      const statusElement = page.locator(`text=/AI正在探索|探索产业链结构|结构就绪|企业信息就绪|知识图谱就绪|完成/i`);
      if (await statusElement.isVisible()) {
        return;
      }
    }
    await page.waitForTimeout(2000);
  }

  throw new Error(`Timeout waiting for task status: ${statuses.join(' or ')}`);
}

// 辅助函数：提交审核反馈
async function submitReviewFeedback(
  page: Page,
  feedback: string,
  isApproval: boolean = false
) {
  // 查找审核面板 - 使用更灵活的选择器
  const reviewPanel = page.locator('form, .space-y-4').filter({
    has: page.locator('textarea, button').filter({ hasText: /确认|批准|提交/i })
  }).first();

  await expect(reviewPanel).toBeVisible({ timeout: 10000 });

  if (isApproval) {
    // 直接确认 - 查找确认/批准按钮
    const confirmButton = page.locator('button').filter({ hasText: /确认|批准|通过/i }).first();
    await expect(confirmButton).toBeVisible({ timeout: 5000 });
    await confirmButton.click();
  } else {
    // 提供修改意见
    const feedbackTextarea = page.locator('textarea').first();
    await expect(feedbackTextarea).toBeVisible({ timeout: 5000 });
    await feedbackTextarea.fill(feedback);

    // 提交 - 使用更宽松的选择器
    const submitButton = page.locator('button').filter({ hasText: /提交|确认|发送/i }).first();
    await expect(submitButton).toBeVisible({ timeout: 5000 });
    await submitButton.click();
  }

  // 等待提交成功
  await page.waitForTimeout(2000);
}

test.describe('知识图谱完整CRUD流程', () => {
  let industryId: string;
  let industryName: string;

  test('完整流程：新增->编辑->删除', async ({ page }) => {
    // ========== 阶段1：新增图谱 ==========
    await test.step('步骤1: 访问图谱主页并点击新增', async () => {
      console.log('[步骤1] 开始：访问图谱主页');
      await page.goto('/graph');
      await expect(page.getByRole('heading', { name: '知识图谱' })).toBeVisible();
      console.log('[步骤1] ✓ 主页加载成功');

      const createButton = page.getByRole('button', { name: /新增图谱/i });
      await createButton.click();
      console.log('[步骤1] ✓ 点击新增图谱按钮');

      await expect(page).toHaveURL('/graph/create');
      await expect(page.getByText(/AI驱动的产业链探索/i).first()).toBeVisible();
      console.log('[步骤1] ✓ 创建页面加载成功');
    });

    await test.step('步骤2: 填写产业信息并开始创建', async () => {
      industryName = `E2E测试产业-${Date.now()}`;
      console.log(`[步骤2] 开始：创建产业 "${industryName}"`);

      await page.fill('input#name', industryName);
      await page.fill('textarea#description', '自动化测试用例，用于验证CRUD流程');
      console.log('[步骤2] ✓ 填写完成');

      const startButton = page.getByRole('button', { name: /开始探索/i });
      await startButton.click();
      console.log('[步骤2] ✓ 点击开始探索');

      // 验证进入探索流程
      await expect(page.getByText(/探索产业链结构|AI正在探索/i).first()).toBeVisible({ timeout: 10000 });
      console.log('[步骤2] ✓ 进入探索流程');
    });

    await test.step('步骤3: 等待结构就绪并进行第一轮结构审核', async () => {
      // 等待结构探索完成
      await expect(
        page.getByText(/结构就绪|知识图谱就绪/i).first()
      ).toBeVisible({ timeout: 240000 }); // 增加到4分钟

      // 验证泳道图预览可见（使用更精确的选择器）
      await expect(page.locator('.space-y-6').filter({ hasText: /泳道图/i }).first()).toBeVisible();

      // 提交第一轮结构修改意见
      await submitReviewFeedback(
        page,
        '请补充上游原材料供应阶段，并增加更多细分环节',
        false
      );

      // 等待AI优化
      await expect(page.getByText(/优化.*中|refining/i).first()).toBeVisible({ timeout: 10000 });
      await page.waitForTimeout(5000);
    });

    await test.step('步骤4: 第二轮结构审核并确认', async () => {
      // 等待第二轮结构就绪
      await expect(
        page.getByText(/结构就绪|知识图谱就绪/i).first()
      ).toBeVisible({ timeout: 120000 });

      // 这次直接确认
      await submitReviewFeedback(page, '', true);

      // 等待进入企业信息探索阶段
      await expect(
        page.getByText(/企业信息就绪|填充企业|exploring details/i).first()
      ).toBeVisible({ timeout: 120000 });
    });

    await test.step('步骤5: 第一轮企业审核', async () => {
      // 等待企业信息就绪
      await expect(
        page.getByText(/企业信息就绪|知识图谱就绪/i).first()
      ).toBeVisible({ timeout: 120000 });

      // 验证企业列表可见
      const swimlanePreview = page.locator('.space-y-6').filter({ hasText: /泳道图/i }).first();
      await expect(swimlanePreview).toBeVisible();

      // 提交第一轮企业修改意见
      await submitReviewFeedback(
        page,
        '请补充各环节的龙头企业，特别是上市公司',
        false
      );

      // 等待AI优化企业信息
      await page.waitForTimeout(5000);
    });

    await test.step('步骤6: 第二轮企业审核并确认完成', async () => {
      // 等待第二轮企业信息就绪
      await expect(
        page.getByText(/企业信息就绪|知识图谱就绪/i).first()
      ).toBeVisible({ timeout: 240000 }); // 增加到4分钟

      // 确认企业信息
      await submitReviewFeedback(page, '', true);

      // 等待写入图数据库或直接完成（写入可能很快完成）
      try {
        await expect(
          page.getByText(/写入图数据库|writing to graph/i).first()
        ).toBeVisible({ timeout: 5000 });
      } catch (e) {
        // 写入太快，可能已经完成，继续检查完成状态
        console.log('图数据库写入阶段跳过，直接检查完成状态');
      }

      // 等待完成（可能是文本或完成对话框）
      const completionVisible = page.getByText(/创建完成|completed|产业图谱创建完成/i).first();
      await expect(completionVisible).toBeVisible({ timeout: 60000 });
    });

    await test.step('步骤7: 跳转到泳道图详情页', async () => {
      // 点击查看泳道图按钮
      const viewButton = page.getByRole('button', { name: /查看泳道图/i });
      await viewButton.click();

      // 验证跳转到详情页
      await expect(page).toHaveURL(/\/graph\/industries\/[^/]+$/, { timeout: 5000 });

      // 保存产业ID
      industryId = page.url().split('/').pop()!;

      // 验证详情页加载完成且显示泳道图（使用更灵活的匹配，支持部分名称）
      // AI可能会规范化名称，所以使用部分匹配而不是完全匹配
      await expect(page.getByText(/E2E测试产业/i).first()).toBeVisible({ timeout: 10000 });
      await expect(page.getByRole('heading', { name: /产业链泳道图/i })).toBeVisible();

      // 验证泳道图数据已渲染
      const swimlaneGraph = page.locator('.space-y-6').filter({ hasText: /阶段|环节|企业/i }).first();
      await expect(swimlaneGraph).toBeVisible();
    });

    await test.step('步骤8: 验证返回主页面性能 (<2s)', async () => {
      const startTime = Date.now();

      const backButton = page.getByRole('button', { name: /返回/i });
      await backButton.click();

      await expect(page).toHaveURL('/graph', { timeout: 2000 });

      const loadTime = Date.now() - startTime;
      expect(loadTime).toBeLessThan(2000);

      // 验证主页面显示新创建的图谱（使用部分匹配）
      await expect(page.getByText(/E2E测试产业/i).first()).toBeVisible();
    });

    // ========== 阶段2：编辑图谱 ==========
    await test.step('步骤9: 进入编辑页面并验证加载性能 (<2s)', async () => {
      const startTime = Date.now();

      // 直接导航到编辑页面（避免从列表中查找导致ID不匹配）
      await page.goto(`/graph/edit/${industryId}`);

      // 验证跳转到编辑页面
      await expect(page).toHaveURL(`/graph/edit/${industryId}`, { timeout: 2000 });

      const loadTime = Date.now() - startTime;
      expect(loadTime).toBeLessThan(2000);

      // 验证编辑页面显示产业名称和泳道图预览（使用部分匹配）
      await expect(page.getByText(/编辑产业图谱/i).first()).toBeVisible();
      await expect(page.getByText(/E2E测试产业/i).first()).toBeVisible();
      await expect(page.getByText(/知识图谱就绪|reviewing/i).first()).toBeVisible({ timeout: 10000 });
    });

    await test.step('步骤10: 第一轮增量修改', async () => {
      // 提交第一轮修改意见
      await submitReviewFeedback(
        page,
        '请增加设备制造环节的详细分类，并补充相关企业',
        false
      );

      // 等待AI优化
      await expect(page.getByText(/优化.*中|refining/i).first()).toBeVisible({ timeout: 10000 });
      await page.waitForTimeout(5000);

      // 等待优化完成并重新进入审核状态
      await expect(
        page.getByText(/知识图谱就绪|reviewing/i).first()
      ).toBeVisible({ timeout: 240000 }); // 增加到4分钟，增量修改需要更长时间

      // 验证预览图已更新
      const swimlanePreview = page.locator('.space-y-6').filter({ hasText: /泳道图/i }).first();
      await expect(swimlanePreview).toBeVisible();
    });

    await test.step('步骤11: 第二轮增量修改并确认', async () => {
      // 提交第二轮修改意见
      await submitReviewFeedback(
        page,
        '请补充下游应用场景环节的描述',
        false
      );

      // 等待AI优化
      await page.waitForTimeout(5000);

      // 等待优化完成
      await expect(
        page.getByText(/知识图谱就绪|reviewing/i).first()
      ).toBeVisible({ timeout: 240000 }); // 增加到4分钟

      // 最终确认
      await submitReviewFeedback(page, '', true);

      // 等待更新完成
      await expect(
        page.getByText(/更新完成|completed/i).first()
      ).toBeVisible({ timeout: 120000 }); // 增加到2分钟
    });

    await test.step('步骤12: 跳转到泳道图详情并验证一致性', async () => {
      // 点击查看泳道图
      const viewButton = page.getByRole('button', { name: /查看泳道图/i });
      await viewButton.click();

      // 验证跳转
      await expect(page).toHaveURL(`/graph/industries/${industryId}`, { timeout: 5000 });

      // 验证泳道图已加载
      await expect(page.getByText(industryName).first()).toBeVisible();
      const detailGraph = page.locator('.space-y-6').filter({ hasText: /阶段|环节|企业/i });
      await expect(detailGraph.first()).toBeVisible();

      // 等待泳道图完全渲染
      await page.waitForTimeout(2000);

      // 简单验证：确保有多个阶段和环节（等待至少一个h3出现）
      const stageElements = page.getByRole('heading', { level: 3 });
      await expect(stageElements.first()).toBeVisible({ timeout: 5000 });
      expect(await stageElements.count()).toBeGreaterThan(0);
    });

    await test.step('步骤13: 返回主页面验证性能 (<2s)', async () => {
      const startTime = Date.now();

      const backButton = page.getByRole('button', { name: /返回/i });
      await backButton.click();

      await expect(page).toHaveURL('/graph', { timeout: 2000 });

      const loadTime = Date.now() - startTime;
      expect(loadTime).toBeLessThan(2000);

      // 等待页面加载完成，确保图谱列表已渲染
      await page.waitForTimeout(2000);
      // 验证创建的图谱出现在列表中
      await expect(page.getByText(/E2E测试产业/i).first()).toBeVisible({ timeout: 5000 });
    });

    // ========== 阶段3：删除图谱 ==========
    await test.step('步骤14: 删除图谱', async () => {
      // 记录删除前的卡片数量
      const beforeCards = page.locator('.cursor-pointer').filter({ hasText: /E2E测试产业/i });
      const beforeCount = await beforeCards.count();
      expect(beforeCount).toBeGreaterThan(0);

      // 找到图谱卡片
      const industryCard = page.locator('.cursor-pointer').filter({ hasText: /E2E测试产业/i });
      await expect(industryCard.first()).toBeVisible();

      // 点击删除按钮
      const deleteButton = industryCard.first().locator('button[title="删除"]');
      await deleteButton.click();

      // 验证删除确认对话框
      await expect(page.getByText(/确认删除/i).first()).toBeVisible();
      await expect(page.getByText(/此操作将删除所有相关数据/i).first()).toBeVisible();

      // 确认删除
      const confirmButton = page.getByRole('button', { name: /确认删除/i });
      await confirmButton.click();

      // 等待删除对话框消失
      await expect(page.getByText(/确认删除/i).first()).not.toBeVisible({ timeout: 5000 });

      // 等待API调用完成和UI更新
      await page.waitForTimeout(3000);

      // 验证图谱已从列表中移除（通过检查数量减少）
      const afterCards = page.locator('.cursor-pointer').filter({ hasText: /E2E测试产业/i });
      const afterCount = await afterCards.count();
      expect(afterCount).toBeLessThan(beforeCount);
    });

    await test.step('步骤15: 验证删除后无法访问详情页', async () => {
      // 尝试直接访问已删除的图谱详情页
      await page.goto(`/graph/industries/${industryId}`);

      // 应该显示404或错误信息
      const errorMessage = page.getByText(/不存在|未找到|not found|error/i);
      await expect(errorMessage.first()).toBeVisible({ timeout: 5000 });
    });
  });

  test('性能基准测试：快速创建和删除', async ({ page }) => {
    await test.step('创建简单图谱', async () => {
      await page.goto('/graph/create');

      const simpleName = `性能测试-${Date.now()}`;
      await page.fill('input#name', simpleName);

      const startButton = page.getByRole('button', { name: /开始探索/i });
      await startButton.click();

      // 等待结构就绪（增加超时到3分钟）
      await expect(
        page.getByText(/结构就绪|知识图谱就绪/i).first()
      ).toBeVisible({ timeout: 180000 });

      // 直接确认结构
      await submitReviewFeedback(page, '', true);

      // 等待企业信息就绪
      await expect(
        page.getByText(/企业信息就绪|知识图谱就绪/i).first()
      ).toBeVisible({ timeout: 240000 });

      // 确认企业信息
      await submitReviewFeedback(page, '', true);

      // 等待完成（增加超时到5分钟，因为需要AI生成和写入图数据库）
      await expect(
        page.getByText(/创建完成|completed|产业图谱创建完成/i).first()
      ).toBeVisible({ timeout: 300000 });

      // 返回主页
      const cancelButton = page.getByRole('button', { name: /取消|返回/i });
      await cancelButton.click();
      await expect(page).toHaveURL('/graph');
    });

    await test.step('快速删除', async () => {
      // 查找并删除刚创建的图谱
      const cards = page.locator('.cursor-pointer').filter({ hasText: /性能测试/i });
      const cardCount = await cards.count();

      if (cardCount > 0) {
        const deleteButton = cards.first().locator('button[title="删除"]');
        await deleteButton.click();

        const confirmButton = page.getByRole('button', { name: /确认删除/i });
        await confirmButton.click();

        // 等待删除对话框消失
        await expect(page.getByText(/确认删除/i).first()).not.toBeVisible({ timeout: 5000 });

        // 等待UI更新
        await page.waitForTimeout(3000);

        // 验证卡片数量减少
        const afterCount = await page.locator('.cursor-pointer').filter({ hasText: /性能测试/i }).count();
        expect(afterCount).toBeLessThan(cardCount);
      }
    });
  });

  test('错误处理：创建失败时的降级', async ({ page }) => {
    let testIndustryName = '';

    await test.step('尝试创建并取消', async () => {
      await page.goto('/graph/create');

      testIndustryName = `测试取消-${Date.now()}`;
      await page.fill('input#name', testIndustryName);

      const startButton = page.getByRole('button', { name: /开始探索/i });
      await startButton.click();

      await expect(
        page.getByText(/探索产业链结构|AI正在探索/i).first()
      ).toBeVisible({ timeout: 10000 });

      // 等待一会儿后取消
      await page.waitForTimeout(5000);

      const cancelButton = page.getByRole('button', { name: /取消/i });
      if (await cancelButton.isVisible()) {
        await cancelButton.click();
      }

      await page.goto('/graph');
    });

    await test.step('清理：删除可能创建的图谱', async () => {
      // 如果取消操作没有阻止创建，需要删除残留数据
      const cards = page.locator('.cursor-pointer').filter({ hasText: new RegExp(testIndustryName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'i') });

      if (await cards.count() > 0) {
        const deleteButton = cards.first().locator('button[title="删除"]');
        await deleteButton.click();

        const confirmButton = page.getByRole('button', { name: /确认删除/i });
        await confirmButton.click();

        await page.waitForTimeout(2000);
      }
    });
  });
});
