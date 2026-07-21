/**
 * 调度器对话框重复问题诊断脚本
 *
 * 在浏览器控制台中运行此脚本来检查运行历史组件是否重复
 */

console.log('🔍 开始诊断调度器对话框重复问题...\n');

// 1. 检查运行历史标题的数量
const historyTitles = document.querySelectorAll('h3:contains("运行历史")');
console.log(`1️⃣ "运行历史"标题数量: ${historyTitles.length}`);

// 由于 :contains 不是标准选择器，使用 XPath
const xpath = "//h3[contains(text(), '运行历史')]";
const historyHeaders = document.evaluate(
  xpath,
  document,
  null,
  XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
  null
);

console.log(`1️⃣ "运行历史"标题数量: ${historyHeaders.snapshotLength}`);

if (historyHeaders.snapshotLength > 1) {
  console.log('❌ 发现重复！存在多个运行历史标题');

  for (let i = 0; i < historyHeaders.snapshotLength; i++) {
    const header = historyHeaders.snapshotItem(i);
    console.log(`\n   标题 ${i + 1}:`);
    console.log('   父节点:', header.parentElement);
    console.log('   完整路径:', getElementPath(header));
  }
} else if (historyHeaders.snapshotLength === 1) {
  console.log('✅ 只有一个运行历史标题，标题本身没有重复');
}

// 2. 检查运行历史容器的数量
const historyContainers = document.querySelectorAll('[class*="space-y-3"]');
let historyCount = 0;

historyContainers.forEach((container, index) => {
  const hasHistoryTitle = container.querySelector('h3');
  if (hasHistoryTitle && hasHistoryTitle.textContent.includes('运行历史')) {
    historyCount++;
    console.log(`\n2️⃣ 运行历史容器 ${historyCount}:`);
    console.log('   容器索引:', index);
    console.log('   容器类名:', container.className);
    console.log('   子元素数量:', container.children.length);
  }
});

console.log(`\n2️⃣ 总共找到 ${historyCount} 个运行历史容器`);

// 3. 检查 ScrollArea 的层级
const scrollAreas = document.querySelectorAll('[class*="overflow-hidden"]');
console.log(`\n3️⃣ ScrollArea 组件数量: ${scrollAreas.length}`);

scrollAreas.forEach((area, index) => {
  const viewport = area.querySelector('[class*="rounded-"]');
  if (viewport) {
    console.log(`   ScrollArea ${index + 1}:`);
    console.log('   - Viewport 子元素数量:', viewport.children.length);
    console.log('   - 第一层子元素:', viewport.children[0]?.className);
  }
});

// 4. 检查执行日志记录的数量
const logCards = document.querySelectorAll('[class*="rounded-lg border bg-card"]');
const logCardGroups = [];

document.querySelectorAll('h3').forEach(h3 => {
  if (h3.textContent.includes('运行历史')) {
    const container = h3.closest('[class*="space-y-3"]');
    if (container) {
      const cards = container.querySelectorAll('[class*="rounded-lg border bg-card"]');
      logCardGroups.push({
        header: h3,
        count: cards.length,
        cards: cards
      });
    }
  }
});

console.log(`\n4️⃣ 运行历史组数量: ${logCardGroups.length}`);
logCardGroups.forEach((group, index) => {
  console.log(`   组 ${index + 1}: ${group.count} 条日志记录`);
});

if (logCardGroups.length > 1) {
  console.log('\n❌ 问题确认：发现多个运行历史组！');

  // 比较两组的内容是否相同
  if (logCardGroups.length === 2) {
    const firstGroup = Array.from(logCardGroups[0].cards).map(c => c.textContent);
    const secondGroup = Array.from(logCardGroups[1].cards).map(c => c.textContent);

    const identical = JSON.stringify(firstGroup) === JSON.stringify(secondGroup);
    console.log(`   内容是否相同: ${identical ? '是 ❌' : '否 ℹ️'}`);
  }
}

// 5. 诊断建议
console.log('\n📋 诊断结果总结:');
console.log('================');

if (historyHeaders.snapshotLength > 1 || historyCount > 1) {
  console.log('❌ 确认存在重复问题');
  console.log('\n🔧 可能的原因:');
  console.log('   1. ScrollArea 的 Viewport 重复渲染了子内容');
  console.log('   2. React 组件被意外渲染了两次');
  console.log('   3. CSS 布局导致内容视觉上重复出现');
  console.log('   4. DialogContent 和 ScrollArea 的组合问题');
} else {
  console.log('✅ 未检测到重复的运行历史组件');
  console.log('   如果视觉上看到重复，可能是 CSS 问题导致的视觉效果');
}

console.log('\n💡 建议操作:');
console.log('   1. 检查 SchedulerDialog.tsx 的 ScrollArea 使用');
console.log('   2. 尝试移除 ScrollArea，使用原生 overflow-y-auto');
console.log('   3. 检查是否有多个对话框实例同时打开');

// 辅助函数：获取元素的完整路径
function getElementPath(element) {
  const path = [];
  let current = element;

  while (current && current !== document.body) {
    let selector = current.tagName.toLowerCase();
    if (current.id) {
      selector += `#${current.id}`;
    } else if (current.className) {
      const classes = current.className.split(' ').slice(0, 2).join('.');
      selector += `.${classes}`;
    }
    path.unshift(selector);
    current = current.parentElement;
  }

  return path.join(' > ');
}

console.log('\n✅ 诊断完成！');
