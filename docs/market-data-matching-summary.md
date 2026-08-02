# 知识图谱节点与市场数据匹配流程梳理 - 总结报告

## ✅ 任务完成情况

### 已完成
1. ✅ 梳理了完整的市场数据匹配流程
2. ✅ 分析了6种数据源的匹配逻辑和当前状态
3. ✅ 发现并修复了节点类型映射覆盖率为0%的严重问题
4. ✅ 创建了数据覆盖率检查工具
5. ✅ 生成了详细的技术文档

### 修复效果
- **板块映射覆盖率**: 0% → **100%** ✅
- **支持的节点类型**: 8种 → **43种** ✅
- **覆盖的板块**: 11个板块，124个节点全部可映射

---

## 📊 当前数据覆盖情况

| 数据源 | 状态 | 覆盖率 | 瓶颈 |
|--------|------|--------|------|
| **新闻热度** | ✅ 良好 | ~8% (10/124) | newsGraphLink 关联需扩展 |
| **板块映射** | ✅ 已修复 | 100% (124/124) | sectorCapitalFlow 数据只有7条 |
| **ETF 跟踪** | ⚠️ 一般 | ~30% (37/124) | metadata 覆盖不足 |
| **指数表现** | ❌ 无效 | 0% | indexDaily 表为空 |
| **资金流向** | ⚠️ 受限 | 100%* | sectorCapitalFlow 只有7条数据 |
| **市场认知** | ⚠️ 估算 | 所有节点 | 基于新闻数估算，非真实数据 |
| **AI算力指标** | ⚠️ 启发式 | AI相关节点 | 基于关键词分析，非精确数据 |

*板块映射已修复，但需要 sectorCapitalFlow 表有对应板块数据才能返回结果

---

## 🎯 板块映射分布

修复后的节点分布：

```
电子         ████████████████████████ 26 个节点
汽车         █████████████████████ 21 个节点
消费         ████████████████ 16 个节点
人工智能     ███████████ 11 个节点
医药生物     ██████████ 10 个节点
通信         ████████ 8 个节点
机械设备     ████████ 8 个节点
国防军工     ███████ 7 个节点
电力设备     ███████ 7 个节点
基础化工     ███████ 7 个节点
芯片         ███ 3 个节点
```

---

## 🔴 待解决的关键问题

### 问题1: indexDaily 表为空 ⚠️⚠️⚠️ 最高优先级
**影响**: 所有节点都无法显示指数表现数据（涨跌幅、成交量等）

**原因**: 数据采集任务未运行

**解决方案**:
```bash
# 检查是否有数据采集脚本
ls scripts/*index*.ts

# 运行数据采集（需要创建或找到对应脚本）
npm run fetch:index-data

# 设置定时任务
crontab -e
# 添加: 0 16 * * 1-5  cd /path/to/project && npm run fetch:index-data
```

### 问题2: metadata 覆盖率仅 29.8% ⚠️⚠️ 高优先级
**影响**: 70% 的节点无法显示 ETF 跟踪数据

**原因**: 节点创建时未填充 metadata.trackingETFs

**解决方案**: 创建批量补充脚本（见下方代码）

### 问题3: sectorCapitalFlow 数据只有7条 ⚠️ 中优先级
**影响**: 大部分板块无法显示资金流向

**原因**: 数据采集不完整，只覆盖7个板块

**解决方案**: 扩展数据采集范围，覆盖所有11个板块

---

## 💻 推荐的下一步操作

### 1. 批量补充节点 metadata
创建 `scripts/enrich-node-metadata.ts`:

```typescript
#!/usr/bin/env tsx
import prisma from '../src/lib/db/prisma'

// 节点类型到指数代码的映射
const typeToIndex: Record<string, string> = {
  'ai_index': '930713',      // 中证人工智能
  'ai_l1': '930713',
  'ai_l2': '930713',
  'ce_index': '399286',      // 国证消费电子
  'ce_l1': '399286',
  'ce_l2': '399286',
  'biotech_index': '931152', // 中证生物医药
  'biotech_l1': '931152',
  'biotech_l2': '931152',
  'nev_index': '399976',     // 中证新能源汽车
  'nev_l1': '399976',
  'nev_l2': '399976',
  'nev_l3': '399976',
  'sector_l1': '931865',     // 中证半导体
  'subsector_l2': '931865',
  // ... 添加更多映射
}

// 节点类型到 ETF 的映射
const typeToETFs: Record<string, Array<{ticker: string, name: string}>> = {
  'ai_index': [
    { ticker: '515980', name: '华夏中证人工智能ETF' },
    { ticker: '159819', name: '嘉实中证人工智能ETF' }
  ],
  'nev_index': [
    { ticker: '515030', name: '华夏中证新能源汽车ETF' },
    { ticker: '516390', name: '易方达中证新能源ETF' }
  ],
  // ... 添加更多映射
}

async function enrichMetadata() {
  const nodes = await prisma.graphNode.findMany({
    where: {
      OR: [
        { metadata: null },
        { metadata: { equals: {} } }
      ]
    }
  })

  console.log(`找到 ${nodes.length} 个需要补充 metadata 的节点`)

  let updated = 0
  for (const node of nodes) {
    const relatedIndex = typeToIndex[node.type]
    const trackingETFs = typeToETFs[node.type]

    if (relatedIndex || trackingETFs) {
      const metadata = {
        relatedIndex,
        trackingETFs,
      }

      await prisma.graphNode.update({
        where: { id: node.id },
        data: { metadata }
      })

      console.log(`✅ 更新节点: ${node.name} (${node.type})`)
      updated++
    }
  }

  console.log(`\n完成！更新了 ${updated} 个节点`)
}

enrichMetadata()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
```

运行：
```bash
npx tsx scripts/enrich-node-metadata.ts
```

### 2. 填充 indexDaily 表
检查是否有现有脚本：
```bash
find scripts -name "*index*.ts" -o -name "*fetch*.ts"
```

如果没有，需要创建数据采集脚本（使用 AKShare 或其他数据源）。

### 3. 扩展 sectorCapitalFlow 数据
当前只有7条数据，需要覆盖所有11个板块：
- 芯片
- 电子
- 汽车
- 消费
- 人工智能
- 医药生物
- 通信
- 机械设备
- 国防军工
- 电力设备
- 基础化工

---

## 📂 相关文件

### 已修改的文件
- ✅ `src/lib/services/graph-market-data.service.ts` - 扩展了节点类型映射
- ✅ `scripts/check-market-data-coverage.ts` - 更新了覆盖率检查逻辑

### 新增的文档
- ✅ `docs/knowledge-graph-market-data-matching.md` - 完整技术文档

### 需要创建的文件
- ⏳ `scripts/enrich-node-metadata.ts` - 批量补充 metadata
- ⏳ `scripts/fetch-index-data.ts` - 采集指数数据（如果不存在）
- ⏳ `scripts/fetch-sector-capital-flow.ts` - 采集板块资金流向（如果不存在）

---

## 🔍 如何验证修复效果

### 1. 检查覆盖率
```bash
npx tsx scripts/check-market-data-coverage.ts
```

预期输出：
```
✅ 可映射节点: 124/124 (100.0%)
✅ 支持的节点类型: 43 种
⚠️ 有 metadata: 37/124 (29.8%)  # 运行补充脚本后应提升
❌ indexDaily: 0 条  # 运行数据采集后应有数据
```

### 2. 测试单个节点
```bash
# 启动开发服务器
npm run dev

# 在浏览器中访问
http://localhost:3000/graph/explore

# 点击任意节点，查看右侧市场数据面板
# 应该能看到：
# - ✅ 新闻热度（如果有关联新闻）
# - ✅ 市场关注度（估算值）
# - ⚠️ 资金流向（如果 sectorCapitalFlow 有该板块数据）
# - ❌ 指数表现（indexDaily 为空，暂时看不到）
# - ⚠️ ETF 跟踪（如果该节点有 metadata.trackingETFs）
```

### 3. API 测试
```bash
# 测试具体节点的市场数据
curl http://localhost:3000/api/graph/nodes/{nodeId}/market-data | jq

# 查看返回的 marketData 字段包含哪些数据
```

---

## 📈 预期改进效果

### 修复前
```
指数表现    ████░░░░░░ 0%   (indexDaily 表为空)
ETF 跟踪    ███░░░░░░░ 30%  (metadata 覆盖不足)
资金流向    ░░░░░░░░░░ 0%   (节点类型无法映射)
新闻热度    █░░░░░░░░░ 8%   (有效)
市场认知    ██████████ 100% (估算值)
```

### 修复后（完成所有建议操作）
```
指数表现    ██████████ 100% (填充 indexDaily 后)
ETF 跟踪    ████████░░ 80%  (补充 metadata 后)
资金流向    ███████░░░ 70%  (扩展 sectorCapitalFlow 后)
新闻热度    ██░░░░░░░░ 20%  (扩展 newsGraphLink 后)
市场认知    ██████████ 100% (保持估算)
```

---

## 🎉 总结

### 本次完成的工作
1. **梳理了完整的匹配流程**，理解了从前端点击到数据返回的全链路
2. **识别了关键瓶颈**，找到了大部分节点没有市场数据的根本原因
3. **修复了节点类型映射问题**，将覆盖率从 0% 提升到 100%
4. **创建了检查工具和文档**，方便后续维护和改进

### 修复效果对比
| 指标 | 修复前 | 修复后 |
|------|--------|--------|
| 板块映射覆盖率 | 0% | **100%** ✅ |
| 支持的节点类型 | 8种 | **43种** ✅ |
| 可获取资金流向的节点* | 0个 | **124个** ✅ |

*前提是 sectorCapitalFlow 表有对应板块的数据

### 后续最关键的3步
1. **填充 indexDaily 表** - 让指数表现数据生效
2. **批量补充 metadata** - 让 ETF 跟踪数据覆盖更多节点  
3. **扩展 sectorCapitalFlow 数据** - 让资金流向数据真正可用

---

**文档位置**: 
- 详细技术文档: `docs/knowledge-graph-market-data-matching.md`
- 检查工具: `scripts/check-market-data-coverage.ts`
