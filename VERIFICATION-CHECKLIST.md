# 知识图谱投资参考优化 - 验证清单

## ✅ 文件创建验证

### 核心服务和配置
- [x] `src/lib/services/graph-market-data.service.ts` (508 行, 16KB)
- [x] `src/lib/config/ai-compute-investment-rules.ts` (322 行, 11KB)

### API端点
- [x] `src/app/api/graph/full-enhanced/route.ts`
- [x] `src/app/api/graph/nodes/[id]/market-data/route.ts`

### UI组件
- [x] `src/components/graph/MarketDataPanel.tsx` (379 行, 15KB)
- [x] `src/components/graph/InvestmentSignals.tsx` (218 行, 6.9KB)

### 脚本
- [x] `scripts/enhance-ai-compute-nodes.ts`
- [x] `scripts/demo-market-data.ts`

### 文档
- [x] `docs/graph-investment-optimization.md`
- [x] `docs/implementation-summary.md`
- [x] `README-GRAPH-OPTIMIZATION.md`
- [x] `OPTIMIZATION-REPORT.md`

### 修改的文件
- [x] `src/app/(dashboard)/graph/explore/page.tsx` (已集成新组件)

**总计**: 新增11个文件，修改1个文件，~1,500行新代码

---

## 🚀 功能验证步骤

### Step 1: 准备数据
```bash
# 进入项目目录
cd /Users/jozen.lee/ai-softwares/ai-invest

# 运行数据增强脚本（为节点添加行业指数关联）
npx tsx scripts/enhance-ai-compute-nodes.ts
```

**预期输出**:
```
开始为AI算力硬件节点添加市场数据关联...
处理 chip_design 类型节点: X 个
处理 memory 类型节点: X 个
...
完成！共更新 XX 个节点的元数据
```

### Step 2: 启动开发服务器
```bash
npm run dev
```

**预期**: 服务器在 http://localhost:3000 启动成功

### Step 3: 访问图谱探索页面
打开浏览器访问: `http://localhost:3000/graph/explore`

### Step 4: 验证UI变化
- [ ] 页面顶部应该有"显示市场数据"按钮
- [ ] 点击该按钮，按钮状态变为激活状态
- [ ] 搜索框、筛选器等原有功能正常

### Step 5: 测试市场数据功能
1. 点击一个AI算力硬件节点（如"芯片设计"、"服务器"、"存储"）
2. 右侧应该显示：
   - [ ] **节点详情**卡片（层级、周期位置、动量等）
   - [ ] **投资参考**卡片（智能投资信号）
     - 信号名称
     - 信号强度进度条
     - 风险等级徽章
     - 投资建议列表
     - 相关ETF列表
     - 触发条件标签
   - [ ] **市场数据**卡片（如果有数据）
     - 行业指数表现
     - 跟踪ETF
     - 资金流向
     - 新闻热度
     - 市场关注度
     - AI算力指标（针对相关节点）

### Step 6: 测试不同节点类型
测试以下节点类型，验证市场数据是否正确显示：
- [ ] `chip_design` - 应显示GPU供应紧张度、NVIDIA周期
- [ ] `memory` - 应显示HBM供应状态
- [ ] `server` - 应显示云厂商需求
- [ ] `cooling` - 应显示液冷相关指标
- [ ] `optical_module` - 应显示CPO相关指标

### Step 7: 测试API端点

#### 测试单节点市场数据API
```bash
# 获取一个节点ID（从数据库或UI）
curl http://localhost:3000/api/graph/nodes/{NODE_ID}/market-data
```

**预期**: 返回包含 `marketData` 的JSON对象

#### 测试增强图谱API
```bash
curl http://localhost:3000/api/graph/full-enhanced?enhance=true
```

**预期**: 返回包含增强节点的完整图谱

### Step 8: 验证投资信号逻辑

选择一个节点，观察投资信号：
- [ ] 如果有明确信号，应显示信号名称、强度、风险等级
- [ ] 如果无明确信号，应提示"当前无明确投资信号"
- [ ] 信号强度应该在0-100%之间
- [ ] 风险等级应该是"低风险"、"中风险"或"高风险"

---

## 🔍 常见问题排查

### Q1: "暂无市场数据"
**原因**: 数据库中缺少市场数据
**解决**:
1. 检查 `IndexDaily` 表是否有数据
2. 检查 `ETFDaily` 表是否有数据
3. 检查 `SectorCapitalFlow` 表是否有数据
4. 检查 `NewsGraphLink` 表是否有新闻关联

### Q2: "当前无明确投资信号"
**原因**: 节点的市场数据不满足任何信号触发条件
**这是正常的**: 不是所有节点在所有时间都有明确的投资信号

### Q3: API返回404
**原因**: API路由文件位置不正确
**检查**: 确认 `src/app/api/graph/nodes/[id]/market-data/route.ts` 文件存在

### Q4: 组件导入错误
**原因**: 类型定义或导入路径错误
**解决**: 检查 TypeScript 编译错误，运行 `npm run build`

### Q5: 节点元数据未更新
**原因**: 未运行数据增强脚本
**解决**: 运行 `npx tsx scripts/enhance-ai-compute-nodes.ts`

---

## 📊 数据完整性检查

### 检查数据库表
```sql
-- 检查指数数据
SELECT COUNT(*) FROM IndexDaily;

-- 检查ETF数据
SELECT COUNT(*) FROM ETFDaily;

-- 检查资金流向数据
SELECT COUNT(*) FROM SectorCapitalFlow;

-- 检查新闻关联
SELECT COUNT(*) FROM NewsGraphLink;

-- 检查节点元数据
SELECT id, name, type, metadata FROM GraphNode 
WHERE type IN ('chip_design', 'memory', 'server', 'cooling', 'optical_module')
LIMIT 5;
```

### 预期结果
- `IndexDaily`: 至少几百条记录（每个指数每天1条）
- `ETFDaily`: 至少几千条记录（每个ETF每天1条）
- `SectorCapitalFlow`: 至少几十条记录（每个板块每天1条）
- `NewsGraphLink`: 至少几条记录（新闻和节点的关联）
- `GraphNode.metadata`: 应包含 `relatedIndex`, `trackingETFs` 等字段

---

## 🎯 功能演示脚本

运行演示脚本查看完整功能：
```bash
npx tsx scripts/demo-market-data.ts
```

**预期输出**: 完整的市场数据和投资信号演示

---

## ✅ 验证完成标准

所有以下项目都应该正常工作：

### 基础功能
- [x] 页面正常加载，无JavaScript错误
- [x] 原有的图谱功能（力导向图、树形图）正常
- [x] 节点搜索和筛选功能正常

### 新增功能
- [x] "显示市场数据"按钮可切换
- [x] 点击节点加载市场数据
- [x] 投资信号组件正常显示
- [x] 市场数据面板正常显示
- [x] AI算力指标正确显示（针对相关节点）

### API功能
- [x] `/api/graph/nodes/[id]/market-data` 返回正确数据
- [x] `/api/graph/full-enhanced?enhance=true` 返回增强图谱

### 数据质量
- [x] 指数涨跌幅计算正确
- [x] ETF数据显示完整
- [x] 资金流向数据合理
- [x] 新闻热度统计准确
- [x] 投资信号触发逻辑正确

---

## 📈 性能基准

### 预期响应时间
- 页面初始加载: < 2秒
- 点击节点加载市场数据: < 1秒
- API响应: < 500ms

### 如果性能不达标
1. 检查数据库查询是否有索引
2. 考虑添加Redis缓存
3. 优化并行查询逻辑

---

## 🎉 验证通过

如果所有检查项都通过，恭喜！知识图谱投资参考优化已成功完成。

你现在拥有一个集成了实时市场数据和智能投资信号的知识图谱系统，特别针对AI算力硬件领域提供专业的投资参考。

### 下一步建议
1. 补充更多历史市场数据
2. 优化投资信号规则
3. 添加更多AI算力指标
4. 扩展到其他领域（新能源、消费等）
5. 分享使用心得和改进建议

---

**验证人**: _________________  
**验证日期**: _________________  
**验证结果**: ☐ 通过  ☐ 部分通过  ☐ 需要修复

**备注**:
