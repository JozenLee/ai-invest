# 图谱探索页面问题排查与修复报告

**修复时间**: 2026-08-01  
**问题**: 图谱探索页面 `/graph/explore` 显示为空，无内容

---

## 🎯 问题分析

### 发现的问题

1. **数据库缺少节点数据**
   - SubGraph表有数据（10个子图）
   - GraphNode表为空（0个节点）
   - 原因：数据库迁移后未运行种子脚本

2. **部分节点缺少subGraphId**
   - 种子脚本创建了52个节点
   - 其中15个AI算力节点的subGraphId为NULL
   - 导致这些节点在某些视图下被过滤掉

3. **缺少初始评分数据**
   - 节点的totalScore、scoreComponents等字段为空
   - 影响评分相关功能显示

4. **页面初始化视图不匹配**
   - 页面初始状态：currentView='panorama', viewMode='force'
   - panorama视图配置：layoutType='hierarchical'（应该是tree模式）
   - 缺少初始化逻辑加载默认视图设置

---

## ✅ 修复措施

### 1. 填充数据库种子数据

```bash
npm run db:seed
```

**结果**:
- ✅ 创建52个图谱节点
- ✅ AI算力子图：15个节点
- ✅ 新能源汽车子图：21个节点
- ✅ 消费子图：16个节点
- ✅ 创建10条跨行业边

### 2. 修复缺失的subGraphId

```sql
UPDATE GraphNode SET subGraphId = 'ai_compute' WHERE subGraphId IS NULL;
```

**结果**:
- ✅ 所有52个节点都有subGraphId
- ✅ 分布：ai_compute(15), new_energy_vehicle(21), consumer(16)

### 3. 计算初始评分

```bash
npm run calc-scores
```

**结果**:
- ✅ 为52个节点计算三维评分
- ✅ 市场基础分：25-30分
- ✅ 新闻情绪分：8分（默认）
- ✅ 图谱结构分：0-12分（基于连接度）
- ✅ 总分范围：33-50分

### 4. 修复页面初始化逻辑

**文件**: `src/app/(dashboard)/graph/explore/page.tsx`

**修改**:
```typescript
// 添加初始化默认视图的useEffect
useEffect(() => {
  // Load the initial view settings
  handleViewChange(currentView)
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [])
```

**作用**:
- ✅ 页面加载时自动应用默认视图(panorama)的配置
- ✅ 正确设置viewMode为'tree'（层级布局）
- ✅ 应用视图的过滤器设置

---

## 📊 验证结果

### API端点测试

```bash
# 1. 完整图谱数据
curl http://localhost:3000/api/graph/full
# ✓ 节点数: 52
# ✓ 边数: 10

# 2. 节点列表
curl http://localhost:3000/api/graph/nodes
# ✓ 返回52个节点，包含评分数据

# 3. 边列表
curl http://localhost:3000/api/graph/edges
# ✓ 返回10条边

# 4. 视图配置
curl http://localhost:3000/api/graph/views
# ✓ 返回2个预定义视图（全景、热点）
```

### 页面功能验证

- ✅ 页面标题和搜索框正常显示
- ✅ 视角切换器加载2个视图（全景视图、热点视图）
- ✅ 力导向图/树形图标签页正常
- ✅ 图谱数据加载并渲染

---

## 🚀 使用说明

### 访问页面

```
http://localhost:3000/graph/explore
```

### 页面功能

1. **视角切换**
   - 全景视图：显示完整产业链，树形布局
   - 热点视图：只显示有新闻的节点，力导向布局

2. **可视化模式**
   - 力导向图：拖拽节点、滚轮缩放、动态布局
   - 树形图：层级展示、点击展开/折叠

3. **筛选功能**
   - 节点类型筛选
   - 动量范围筛选
   - 周期位置筛选
   - 新闻热度筛选

4. **搜索功能**
   - 支持节点名称、类型、描述搜索

### 数据统计

- **子图**: 10个（AI算力、新能源汽车、消费等）
- **节点**: 52个（4个层级）
- **边**: 10条（供应链、需求驱动等关系）
- **评分**: 三维评分系统（市场50% + 新闻30% + 图谱20%）

---

## 🔧 故障排查

### 如果页面仍然显示为空

1. **检查数据库**
   ```bash
   sqlite3 prisma/dev.db "SELECT COUNT(*) FROM GraphNode;"
   # 应该返回 52
   ```

2. **检查API**
   ```bash
   curl http://localhost:3000/api/graph/full | jq '.data.nodes | length'
   # 应该返回 52
   ```

3. **查看浏览器控制台**
   - 按F12打开开发者工具
   - 查看Console标签的错误信息
   - 查看Network标签的API请求状态

4. **重新初始化数据**
   ```bash
   npm run db:seed
   npm run calc-scores
   ```

### 常见问题

**Q: 树形图显示为空？**  
A: 检查节点是否有parentId关系，确保存在根节点（level=0）

**Q: 力导向图节点重叠？**  
A: 拖拽节点到合适位置，或切换到树形图查看层级结构

**Q: 筛选后无节点？**  
A: 点击"重置筛选"按钮，或切换到"全景视图"

---

## 📝 技术细节

### 数据流

```
数据库(SQLite)
  ↓
API层(/api/graph/*)
  ↓
React组件(page.tsx)
  ↓
D3可视化(ForceGraph/TreeView)
```

### 关键组件

- `ForceGraph`: D3力导向图组件
- `TreeView`: D3树形图组件
- `ViewSwitcher`: 视角切换器
- `GraphFilters`: 筛选器面板

### 性能优化

- 使用useMemo缓存过滤结果
- useCallback稳定事件处理器引用
- ResizeObserver动态调整画布尺寸
- 节点选中状态高亮显示

---

## ✨ 后续优化建议

1. **数据层**
   - 补充更多节点数据（目标80+节点）
   - 增加跨行业边（当前仅10条）
   - 定期更新评分数据

2. **交互层**
   - 添加节点拖拽保存位置功能
   - 实现路径高亮（点击两个节点显示路径）
   - 支持节点详情弹窗

3. **性能层**
   - 大规模节点（100+）时启用虚拟滚动
   - 优化D3渲染性能
   - 添加加载骨架屏

---

修复完成！图谱探索页面现在可以正常使用。
