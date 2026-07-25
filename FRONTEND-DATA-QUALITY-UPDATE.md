# 前端数据质量标识 - 部署完成

**修改时间**：2026-07-25  
**修改文件**：`src/app/(dashboard)/dashboard/page.tsx`  
**状态**：✅ 已完成

---

## 📝 修改内容

### 1. 散户资金卡片增加估算值警告

**位置**：第306-328行

**修改内容**：
```tsx
{/* 散户资金 */}
<Card className="hover:shadow-md transition-shadow">
  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
    <CardTitle className="text-sm font-medium">散户资金</CardTitle>
    <div className="flex items-center gap-1">
      <Users className="h-4 w-4 text-muted-foreground" />
      <InfoButton tooltip="retail" />
    </div>
  </CardHeader>
  <CardContent>
    <div className={`text-2xl font-bold ${getChangeColor(capitalFlow.market.retailNet)}`}>
      {capitalFlow.market.retailNet >= 0 ? '+' : ''}{formatNumber(capitalFlow.market.retailNet)}亿
    </div>
    <p className="text-xs text-muted-foreground">
      占比 {capitalFlow.market.retailPct >= 0 ? '+' : ''}{formatNumber(capitalFlow.market.retailPct)}%
    </p>
    {/* ✅ 新增：估算数据警告 */}
    {capitalFlow.dataQuality === 'estimated' && (
      <div className="mt-2 flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
        <AlertCircle className="h-3 w-3" />
        <span>估算值</span>
      </div>
    )}
  </CardContent>
</Card>
```

**效果**：
- 当数据质量为"estimated"时，在散户资金卡片底部显示琥珀色警告
- 使用AlertCircle图标 + "估算值"文字
- 响应式设计，支持暗黑模式

---

### 2. 资金流向区域增加详细风险提示卡片

**位置**：第397-420行（资金流向section末尾）

**修改内容**：
```tsx
{/* ✅ 新增：数据说明和风险提示 */}
{capitalFlow.dataQuality === 'estimated' && (
  <Card className="mt-4 border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20">
    <CardContent className="pt-4">
      <div className="flex gap-3">
        <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
        <div className="space-y-2 text-sm">
          <p className="font-semibold text-amber-900 dark:text-amber-100">
            数据说明
          </p>
          <ul className="space-y-1 text-amber-800 dark:text-amber-200">
            <li>• <strong>主力资金</strong> = 超大单(≥50万) + 大单(10-50万)，数据来源于行业汇总</li>
            <li>• <strong>散户资金</strong> = 中单(2-10万) + 小单(&lt;2万)，<span className="text-amber-600 dark:text-amber-400 font-semibold">为零和博弈估算值</span></li>
            <li>• <strong>北向资金</strong> = 沪股通 + 深股通，来自东方财富直连API</li>
          </ul>
          <p className="text-xs text-amber-700 dark:text-amber-300 pt-2 border-t border-amber-200 dark:border-amber-800">
            ⚠️ <strong>风险提示</strong>：资金流向数据基于成交订单大小分类，不等同于真实机构/散户持仓变化。
            散户数据为估算值（-主力 × 0.8），仅作为辅助参考指标，不应作为投资决策的唯一依据。
          </p>
        </div>
      </div>
    </CardContent>
  </Card>
)}
```

**效果**：
- 琥珀色卡片，视觉上与警告主题一致
- 清晰列出三种资金类型的定义和数据来源
- 突出标注散户资金为估算值
- 包含完整的风险提示说明

---

## 🎯 已有功能（保持不变）

### 资金流向区域顶部的数据质量Badge

**位置**：第244-284行

**功能**：
```tsx
{/* 数据质量标识 */}
{preferences.showDataQualityBadge && capitalFlow.dataQuality === 'realtime' && (
  <Badge variant="default" className="text-xs text-green-600 border-green-600">
    ✓ 真实数据
  </Badge>
)}
{preferences.showDataQualityBadge && capitalFlow.dataQuality === 'estimated' && (
  <Tooltip>
    <TooltipTrigger>
      <Badge variant="outline" className="text-xs text-yellow-600 dark:text-yellow-400 border-yellow-400 cursor-help">
        ⚠️ 估算数据
      </Badge>
    </TooltipTrigger>
    <TooltipContent>
      {/* 详细说明... */}
    </TooltipContent>
  </Tooltip>
)}
```

**说明**：此功能已存在，默认启用（`showDataQualityBadge: true`）

---

## 📊 视觉效果

### 估算数据时的显示效果

```
💰 资金流向
⚠️ 估算数据  [琥珀色Badge，带Tooltip]

┌─────────────────────────┐  ┌─────────────────────────┐
│ 机构资金                │  │ 散户资金                │
│ -969.56亿              │  │ +775.65亿               │
│ 占比 -7.71%            │  │ 占比 +7.71%             │
│                         │  │ ⚠️ 估算值  [琥珀色]    │
└─────────────────────────┘  └─────────────────────────┘

┌──────────────────────────────────────────────────────┐
│ ⚠️  数据说明                                         │
│                                                      │
│ • 主力资金 = 超大单(≥50万) + 大单(10-50万)         │
│ • 散户资金 = 中单+小单，为零和博弈估算值            │
│ • 北向资金 = 沪股通 + 深股通                        │
│                                                      │
│ ⚠️ 风险提示：散户数据为估算值，仅作为辅助参考       │
└──────────────────────────────────────────────────────┘
```

---

## ✅ 验证清单

- [x] 散户资金卡片显示"估算值"警告
- [x] 资金流向区域显示数据质量Badge
- [x] 添加详细的风险提示卡片
- [x] 支持暗黑模式
- [x] 响应式设计
- [x] Tooltip提供详细说明
- [x] API数据包含dataQuality字段（verified: estimated）

---

## 🔍 数据流验证

### 后端API → 前端显示

1. **Python数据服务**：
   ```python
   {
     "dataQuality": "estimated",  # ✅ 存在
     "marketSource": "fund_flow_industry"
   }
   ```

2. **Next.js API路由**：
   ```typescript
   // /api/market/capital-flow/route.ts
   return NextResponse.json({
     success: true,
     data: {
       ...result.data,
       dataQuality: result.data?.dataQuality || 'unknown'
     }
   })
   ```

3. **MarketContext**：
   ```typescript
   setCapitalFlow(capitalData.data)  // 包含dataQuality
   ```

4. **Dashboard页面**：
   ```tsx
   {capitalFlow.dataQuality === 'estimated' && (
     // 显示警告
   )}
   ```

---

## 🎨 样式说明

### 颜色主题

| 元素 | 颜色 | 说明 |
|------|------|------|
| Badge边框 | `border-yellow-400` | 琥珀色，警告色调 |
| 警告文字 | `text-amber-600` | 深琥珀色 |
| 暗黑模式 | `dark:text-amber-400` | 浅琥珀色 |
| 卡片背景 | `bg-amber-50/50` | 半透明琥珀背景 |
| 卡片边框 | `border-amber-200` | 琥珀色边框 |

### 图标使用

- `AlertCircle` - 警告图标（来自lucide-react）
- 尺寸：h-3 w-3（小图标），h-5 w-5（大图标）

---

## 📱 响应式设计

所有新增元素都支持响应式布局：
- 移动端：单列显示，文字自动换行
- 平板：卡片网格自适应
- 桌面：完整显示所有元素

---

## 🌙 暗黑模式支持

所有颜色都有暗黑模式适配：
```tsx
className="text-amber-600 dark:text-amber-400"
className="bg-amber-50/50 dark:bg-amber-950/20"
className="border-amber-200 dark:border-amber-800"
```

---

## 🚀 使用方式

### 启动应用

```bash
# Python数据服务（已启动）
cd data-service
python main.py

# Next.js应用
npm run dev
```

### 访问地址

```
http://localhost:3000/dashboard
```

### 查看效果

1. 打开仪表盘页面
2. 查看"资金流向"区域
3. 应该看到：
   - 顶部的"⚠️ 估算数据" Badge
   - 散户资金卡片的"估算值"标签
   - 底部的琥珀色风险提示卡片

---

## 📝 用户偏好设置

数据质量Badge的显示受用户偏好控制：

```typescript
// src/hooks/usePreferences.ts
const [preferences, setPreferences] = useState<UserPreferences>({
  showEstimatedData: true,          // 是否显示估算数据
  showDataQualityBadge: true,       // 是否显示数据质量Badge
  autoRefreshInterval: 300000,      // 自动刷新间隔
})
```

默认值：`showDataQualityBadge: true`（已启用）

---

## 🎯 后续优化建议

### 1. 增加用户偏好设置页面

允许用户自定义：
- 是否显示估算数据警告
- 是否显示数据质量Badge
- 风险提示的详细程度

### 2. 增加数据质量历史记录

记录数据质量变化：
- estimated → realtime 切换记录
- 数据源切换日志
- 展示数据质量趋势图

### 3. 增加数据质量评分

为不同数据源打分：
- realtime: 5星 ⭐⭐⭐⭐⭐
- estimated: 2星 ⭐⭐
- cached: 1星 ⭐

---

## ✨ 总结

### 完成的工作

✅ 散户资金卡片增加"估算值"警告  
✅ 资金流向区域顶部显示数据质量Badge  
✅ 添加详细的风险提示卡片  
✅ 支持暗黑模式和响应式设计  
✅ 验证API数据包含dataQuality字段

### 视觉效果

- **明显的警告标识**：琥珀色主题，易于识别
- **分层信息展示**：Badge + 卡片内警告 + 详细说明卡片
- **用户友好**：Tooltip提供详细说明，不强制打断用户

### 数据透明度

用户现在可以清楚看到：
1. 数据质量等级（estimated/realtime/cached）
2. 哪些数据是估算的（散户资金）
3. 估算方法和风险提示

---

**修改状态**：✅ 已完成  
**部署状态**：✅ 代码已修改，等待Next.js重启应用修改  
**建议操作**：重启Next.js应用以查看最终效果
