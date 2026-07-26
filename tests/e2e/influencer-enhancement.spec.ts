import { test, expect } from '@playwright/test';

test.describe('Influencer Management Enhancement', () => {
  test('complete flow: add with validation, edit, verify sync', async ({ page }) => {
    // 1. 访问添加页面
    await page.goto('http://localhost:3000/events/influencers/new');
    await expect(page.getByText('添加大V')).toBeVisible();

    // 2. 选择平台和输入账号ID
    await page.selectOption('select#platform', 'bilibili');
    await page.fill('input#accountId', '2'); // Bilibili官方账号
    await page.click('button:has-text("验证并获取信息")');

    // 3. 等待验证成功
    await expect(page.getByText('验证成功')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('第2步：配置监控参数')).toBeVisible();

    // 4. 验证自动填充的信息
    const platformInfo = page.locator('.bg-muted\\/50');
    await expect(platformInfo).toContainText('bilibili');

    // 5. 配置调度策略 - 选择定时模式
    await page.click('input#daily');
    await expect(page.getByText('每日执行时间')).toBeVisible();

    // 6. 添加自定义时间
    await page.fill('input[placeholder*="HH:MM"]', '18:00');
    await page.click('button:has-text("添加")');
    await expect(page.getByText('18:00')).toBeVisible();

    // 7. 修改数据保留天数
    await page.fill('input#dataRetentionDays', '60');

    // 8. 提交表单
    await page.click('button:has-text("添加大V")');

    // 9. 验证跳转到详情页
    await expect(page).toHaveURL(/\/events\/influencers\/\w+/, { timeout: 10000 });
    await expect(page.getByText('定时模式')).toBeVisible();
    await expect(page.getByText('60 天')).toBeVisible();

    // 10. 点击编辑按钮
    const influencerUrl = page.url();
    const influencerId = influencerUrl.split('/').pop();
    await page.click('button:has-text("编辑")');
    await expect(page).toHaveURL(`/events/influencers/${influencerId}/edit`);

    // 11. 验证只读区域
    const readonlySection = page.locator('.bg-muted\\/30');
    await expect(readonlySection).toContainText('自动同步，不可编辑');
    await expect(readonlySection).toContainText('bilibili');

    // 12. 修改可编辑字段 - 切换回轮询模式
    await page.click('input#polling');
    await page.fill('input#fetchInterval', '45');

    // 13. 保存修改
    await page.click('button:has-text("保存修改")');

    // 14. 验证返回详情页并显示更新后的值
    await expect(page).toHaveURL(influencerUrl, { timeout: 5000 });
    await expect(page.getByText('轮询模式')).toBeVisible();
    await expect(page.getByText('45 分钟')).toBeVisible();
  });

  test('unsupported platform fallback to manual mode', async ({ page }) => {
    await page.goto('http://localhost:3000/events/influencers/new');

    // 选择不支持的平台
    await page.selectOption('select#platform', 'weibo');
    await page.fill('input#accountId', '123456');
    await page.click('button:has-text("验证并获取信息")');

    // 验证提示手动填写
    await expect(page.getByText('该平台暂不支持自动获取')).toBeVisible({ timeout: 5000 });

    // 验证手动填写表单出现
    await expect(page.locator('input#name')).toBeVisible();
    await expect(page.locator('input#profileUrl')).toBeVisible();
  });

  test('readonly field validation on edit', async ({ page, request }) => {
    // 先创建一个influencer
    const createResponse = await request.post('http://localhost:8000/api/influencers', {
      data: {
        name: 'Test Influencer',
        platform: 'bilibili',
        accountId: 'test123',
      },
    });
    const influencer = await createResponse.json();

    // 尝试通过API修改只读字段
    const updateResponse = await request.put(`http://localhost:8000/api/influencers/${influencer.id}`, {
      data: {
        name: 'Modified Name', // 只读字段
        platform: 'bilibili',
        accountId: 'test123',
        tags: ['test'],
      },
    });

    // 验证返回400错误
    expect(updateResponse.status()).toBe(400);
    const error = await updateResponse.json();
    expect(error.detail).toContain('不允许手动修改');
  });

  test('time picker validation', async ({ page }) => {
    await page.goto('http://localhost:3000/events/influencers/new');

    // 选择平台（跳过验证，直接到配置步骤）
    await page.selectOption('select#platform', 'weibo');
    await page.fill('input#accountId', 'test');
    await page.click('button:has-text("验证并获取信息")');

    // 等待进入手动填写模式
    await expect(page.locator('input#name')).toBeVisible({ timeout: 5000 });
    await page.fill('input#name', 'Test User');
    await page.fill('input#profileUrl', 'https://example.com');

    // 继续到配置步骤
    await page.click('button:has-text("下一步")');

    // 选择定时模式
    await page.click('input#daily');

    // 尝试添加无效时间格式
    await page.fill('input[placeholder*="HH:MM"]', '25:00');
    await page.click('button:has-text("添加")');
    await expect(page.getByText(/时间格式|无效/i)).toBeVisible();

    // 添加有效时间
    await page.fill('input[placeholder*="HH:MM"]', '15:30');
    await page.click('button:has-text("添加")');
    await expect(page.getByText('15:30')).toBeVisible();

    // 尝试添加重复时间
    await page.fill('input[placeholder*="HH:MM"]', '15:30');
    await page.click('button:has-text("添加")');
    await expect(page.getByText(/已存在|重复/i)).toBeVisible();

    // 删除时间
    const deleteButton = page.locator('button[aria-label*="删除"]').first();
    await deleteButton.click();
    await expect(page.getByText('15:30')).not.toBeVisible();
  });
});
