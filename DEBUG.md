# 布局调试信息

## 问题描述
用户反馈："生成AI报告"开关显示在页面最上方，而不是在"执行流程"卡片头部的"开始执行"按钮左侧。

## 已修改的代码位置
文件: `src/components/analysis/InvestmentAdvice.tsx`
行数: 288-325

## 当前布局结构
```tsx
<Card> {/* 执行流程卡片 */}
  <CardHeader>
    <div className="flex flex-row items-start justify-between gap-3">
      {/* 左侧：标题和描述 */}
      <div>
        <CardTitle>执行流程</CardTitle>
        <CardDescription>...</CardDescription>
      </div>
      
      {/* 右侧：按钮区域 */}
      <div className="flex flex-wrap items-center gap-2 shrink-0">
        <label>生成AI报告 <Switch /></label>
        <Button>开始执行</Button>
      </div>
    </div>
  </CardHeader>
</Card>
```

## 可能的原因

### 1. 浏览器缓存
- 浏览器可能缓存了旧版本的JS
- 建议：硬刷新 (Ctrl+Shift+R 或 Cmd+Shift+R)

### 2. 开发服务器未编译最新代码
- Next.js Turbopack 缓存问题
- 建议：停止服务器，删除 .next 目录，重新启动

### 3. 其他组件覆盖
- 检查是否有其他组件也渲染了相同的控件
- 已确认：只有 InvestmentAdvice.tsx 包含"生成AI报告"文本

### 4. CSS样式问题
- 可能有全局CSS或其他样式覆盖了布局
- 建议：检查浏览器开发者工具中的实际渲染结构

## 验证步骤

1. 打开浏览器开发者工具 (F12)
2. 切换到 Elements/元素 标签
3. 搜索 "生成AI报告" 文本
4. 查看其父元素的class和样式
5. 截图发送给我查看

## 关键CSS类说明
- `flex flex-row`: 强制水平布局
- `items-start`: 顶部对齐
- `justify-between`: 两端对齐
- `shrink-0`: 防止收缩
