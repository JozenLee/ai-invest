console.log('='.repeat(50));
console.log('咨询流页面筛选框验证');
console.log('='.repeat(50));

// 等待页面加载
setTimeout(() => {
  console.log('\n1. 检查情感筛选框');
  console.log('-'.repeat(50));
  const sentimentTrigger = document.querySelector('[class*="w-\\[160px\\]"]');
  if (sentimentTrigger) {
    const text = sentimentTrigger.textContent;
    console.log('当前显示:', text);
    console.log('是否包含中文:', /[一-龥]/.test(text));
    console.log('是否包含英文单词:', /\b(all|bullish|neutral|bearish)\b/i.test(text));
  }

  console.log('\n2. 检查所有Select组件');
  console.log('-'.repeat(50));
  const allSelects = document.querySelectorAll('[role="combobox"]');
  console.log('找到的Select数量:', allSelects.length);

  allSelects.forEach((select, index) => {
    const text = select.textContent || '';
    console.log(`\nSelect ${index + 1}:`, text);
    if (/\b(all|bullish|neutral|bearish|publishTime|sentiment|impact)\b/i.test(text)) {
      console.warn('⚠️ 发现英文值:', text);
    } else if (/[一-龥]/.test(text)) {
      console.log('✓ 显示中文');
    }
  });

  console.log('\n' + '='.repeat(50));
  console.log('验证完成');
  console.log('='.repeat(50));
}, 2000);
