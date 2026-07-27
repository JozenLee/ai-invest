#!/usr/bin/env node

/**
 * UI自动化验证脚本
 * 使用puppeteer检查页面实际渲染效果
 */

const puppeteer = require('puppeteer');

async function verifyUI() {
  console.log('========================================');
  console.log('  UI自动化验证');
  console.log('========================================\n');

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();

    // 1. 检查列表页
    console.log('1. 检查大V列表页');
    console.log('-------------------------------------------');
    await page.goto('http://localhost:3000/events/influencers', {
      waitUntil: 'networkidle0',
      timeout: 30000
    });

    // 等待列表加载
    await page.waitForSelector('[class*="grid"]', { timeout: 10000 });

    // 检查是否有头像图片
    const avatarImages = await page.$$eval('img[alt="二狗学长好"]', imgs =>
      imgs.map(img => ({
        src: img.src,
        visible: img.offsetWidth > 0 && img.offsetHeight > 0
      }))
    );

    if (avatarImages.length > 0) {
      console.log('✓ 找到头像元素');
      avatarImages.forEach((img, idx) => {
        console.log(`  [${idx + 1}] src: ${img.src}`);
        console.log(`      可见: ${img.visible ? '是' : '否'}`);
      });
    } else {
      console.log('✗ 未找到头像元素');
    }

    // 检查是否还在显示"B站"文字作为占位符
    const platformIcons = await page.$$eval('[class*="bg-pink-500"]', elements =>
      elements.map(el => el.textContent)
    );

    if (platformIcons.length > 0) {
      console.log('⚠ 仍在使用平台图标占位符');
      console.log(`  找到 ${platformIcons.length} 个"B站"占位符`);
    }

    console.log('');

    // 2. 检查详情页
    console.log('2. 检查详情页');
    console.log('-------------------------------------------');
    await page.goto('http://localhost:3000/events/influencers/inf_1785044475094355', {
      waitUntil: 'networkidle0',
      timeout: 30000
    });

    // 等待页面加载
    await page.waitForSelector('h1', { timeout: 10000 });

    // 检查大头像
    const detailAvatars = await page.$$eval('img[alt="二狗学长好"]', imgs =>
      imgs.map(img => ({
        src: img.src,
        width: img.offsetWidth,
        height: img.offsetHeight,
        visible: img.offsetWidth > 0 && img.offsetHeight > 0,
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight
      }))
    );

    if (detailAvatars.length > 0) {
      console.log('✓ 找到头像元素');
      detailAvatars.forEach((img, idx) => {
        console.log(`  [${idx + 1}] src: ${img.src}`);
        console.log(`      尺寸: ${img.width}x${img.height}px`);
        console.log(`      原始尺寸: ${img.naturalWidth}x${img.naturalHeight}px`);
        console.log(`      可见: ${img.visible ? '是' : '否'}`);

        if (img.naturalWidth === 0 || img.naturalHeight === 0) {
          console.log('      ⚠ 警告: 图片加载失败（naturalWidth/Height为0）');
        }
      });
    } else {
      console.log('✗ 未找到头像元素');
    }

    // 检查是否有Users图标（占位符）
    const hasPlaceholder = await page.$('[class*="lucide-users"]') !== null;
    if (hasPlaceholder) {
      console.log('⚠ 仍在使用Users图标占位符');
    }

    console.log('');

    // 3. 截图保存
    console.log('3. 保存截图');
    console.log('-------------------------------------------');
    await page.screenshot({
      path: '/tmp/influencer-detail.png',
      fullPage: false
    });
    console.log('✓ 详情页截图已保存: /tmp/influencer-detail.png');

    await page.goto('http://localhost:3000/events/influencers', {
      waitUntil: 'networkidle0'
    });
    await page.screenshot({
      path: '/tmp/influencer-list.png',
      fullPage: false
    });
    console.log('✓ 列表页截图已保存: /tmp/influencer-list.png');

    console.log('');
    console.log('========================================');
    console.log('  验证完成');
    console.log('========================================');

  } catch (error) {
    console.error('验证失败:', error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

// 检查puppeteer是否安装
try {
  require.resolve('puppeteer');
  verifyUI().catch(err => {
    console.error('执行失败:', err);
    process.exit(1);
  });
} catch (e) {
  console.log('⚠ puppeteer未安装，跳过UI自动化验证');
  console.log('');
  console.log('如需自动化验证，请运行:');
  console.log('  npm install --save-dev puppeteer');
  console.log('');
  console.log('手动验证步骤：');
  console.log('  1. 打开浏览器访问: http://localhost:3000/events/influencers');
  console.log('  2. 检查"二狗学长好"是否显示圆形头像（不是"B站"文字）');
  console.log('  3. 点击进入详情页');
  console.log('  4. 检查头像是否正常显示（不是裂图或Users图标）');
  process.exit(0);
}
