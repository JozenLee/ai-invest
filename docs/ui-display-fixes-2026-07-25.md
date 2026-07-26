# UI显示问题修复报告

**日期**: 2026-07-25  
**修复的问题**: 3个UI显示不一致问题

## 问题1: 新闻时间和来源显示格式不一致 ✅

### 问题描述
- 资讯流页面（`/events/feed`）和领域趋势详情页面（`/events/trends/[domain]`）中新闻的来源、时间显示格式不同
- 需要统一以趋势详情页面的显示格式为准

### 根本原因
- 资讯流页面将时间显示在单独的一行（`<div>`）中
- 趋势详情页面的RelatedNewsSection组件将时间和来源、分类等标签放在同一行

### 修复方案
修改了 `src/app/(dashboard)/events/feed/page.tsx`：
- 将发布时间从单独的div移到标签区域内，作为 `<span>` 显示
- 使用相同的样式类 `text-xs text-muted-foreground`
- 保持与RelatedNewsSection完全一致的布局结构

### 修改文件
- `src/app/(dashboard)/events/feed/page.tsx` (line 640-673)

---

## 问题2: SSE连接状态频繁跳变 ✅

### 问题描述
- 资讯流页面顶部的连接状态在"未连接"和"实时连接"之间频繁跳变
- 用户体验不佳，显示不稳定

### 根本原因
1. 当Python数据服务不可用时，EventSource会不断尝试重连
2. 每次重连失败都会触发 `onerror`，立即再次重连，形成快速循环
3. 没有重连次数限制和指数退避策略

### 修复方案
改进了 `src/hooks/useNewsStream.ts`：

1. **添加重连限制**：
   - 最多尝试3次重连
   - 使用 `reconnectAttemptsRef` 跟踪重连次数
   - 达到上限后停止重连，显示"连接不可用"

2. **实现指数退避**：
   - 第1次重连：5秒延迟
   - 第2次重连：10秒延迟
   - 第3次重连：20秒延迟
   - 公式：`reconnectDelay * Math.pow(2, attempt - 1)`

3. **改进状态显示**：
   - 连接成功时重置重连计数器
   - 重连时显示进度："重连中... (1/3)"
   - 达到上限时显示："连接不可用"
   - 未连接时显示"离线模式"而非"未连接"

### 修改文件
- `src/hooks/useNewsStream.ts` (line 29-36, 42-46, 82-96)
- `src/app/(dashboard)/events/feed/page.tsx` (line 319-322)

---

## 问题3: 情绪分布数据不一致 ✅

### 问题描述
- 领域趋势页面的情绪分布
- 查看详情页面的情绪分布
- 相关新闻列表中不同情感的事件数量
- **这三处数据不一致，应该一一对应**

### 根本原因
**后端和前端使用了不同的情绪分类逻辑**：

1. **后端** (`trend_analysis_service.py`)：
   - 使用关键词匹配计算情绪
   - 正面关键词：'上涨', '利好', '突破', '增长'等
   - 负面关键词：'下跌', '利空', '风险', '限制'等
   - 逻辑：比较正负关键词数量决定分类

2. **前端** (`RelatedNewsSection.tsx`)：
   - 使用数据库中的 `sentiment` 字段（数值 -1 到 1）
   - 逻辑：
     ```typescript
     sentiment > 0.2  → 利好 (bullish)
     sentiment < -0.2 → 利空 (bearish)
     其他             → 中性 (neutral)
     ```

这导致同一条新闻可能被后端分类为"利好"，但前端显示为"中性"。

### 修复方案
统一使用前端的分类逻辑，修改后端的 `calculate_sentiment_distribution` 方法：

```python
def calculate_sentiment_distribution(self, news_list: List[Dict]) -> Dict[str, int]:
    """
    统计情绪分布（基于sentiment字段值，与前端显示逻辑一致）
    """
    bullish = 0
    bearish = 0
    neutral = 0

    for news in news_list:
        sentiment = news.get('sentiment')

        # 使用与前端getSentimentInfo相同的逻辑
        if sentiment is None or abs(sentiment) <= 0.2:
            neutral += 1
        elif sentiment > 0.2:
            bullish += 1
        else:  # sentiment < -0.2
            bearish += 1

    return {
        "bullish": bullish,
        "neutral": neutral,
        "bearish": bearish
    }
```

### 修改文件
- `data-service/services/trend_analysis_service.py` (line 223-259)

---

## 验证步骤

### 1. 启动服务
```bash
# 启动Next.js应用
npm run dev

# 启动Python数据服务（另一个终端）
cd data-service
python main.py
```

### 2. 测试问题1（时间显示格式）
1. 访问 `/events/feed` 查看资讯流
2. 访问 `/events/trends` 选择任意领域查看详情
3. 验证：两个页面的新闻项中，来源和时间的显示格式应该一致
   - 都在同一行显示
   - 时间格式为相对时间（"5分钟前"）或短格式（"07-25 10:30"）

### 3. 测试问题2（连接状态）
1. **正常情况**（Python服务运行中）：
   - 访问 `/events/feed`
   - 应显示"实时连接"且稳定，不跳变
   
2. **异常情况**（停止Python服务）：
   - 停止Python服务：`Ctrl+C`
   - 刷新页面
   - 应该看到：
     - 初始显示"离线模式"
     - 尝试重连3次，显示"重连中... (1/3)"、"重连中... (2/3)"、"重连中... (3/3)"
     - 最终显示"连接不可用"
   - **不应该**在"离线模式"和"实时连接"之间快速跳变

### 4. 测试问题3（情绪分布一致性）
1. 访问 `/events/trends` 查看领域趋势概览
2. 记录某个领域的情绪分布（例如：AI芯片 - 利好:15, 中性:20, 利空:5）
3. 点击"查看详情"进入详情页
4. 验证：
   - 顶部统计卡片的"利好新闻"和"利空新闻"数量应与概览页一致
   - 情绪分布柱状图的数字应该一致
   - 滚动到"相关新闻列表"，手动计数各情绪标签：
     - 绿色"利好"标签数量 = 利好数字
     - 灰色"中性"标签数量 = 中性数字
     - 红色"利空"标签数量 = 利空数字

---

## 技术细节

### 情绪分类阈值
为什么选择 ±0.2 作为阈值？

- `sentiment` 字段范围：-1.0 到 1.0
- 阈值设计：
  - `> 0.2`：明显正面情绪
  - `< -0.2`：明显负面情绪
  - `[-0.2, 0.2]`：中性或情绪不明显

这个阈值可以在 `RelatedNewsSection.tsx` 和 `trend_analysis_service.py` 中调整。

### SSE重连策略
指数退避的好处：
- 减少服务器压力
- 避免浪费客户端资源
- 给予服务恢复的时间
- 改善用户体验（避免频繁跳变）

---

## 总结

所有三个问题均已修复：
1. ✅ 新闻时间和来源显示格式已统一
2. ✅ SSE连接状态不再频繁跳变，添加了智能重连机制
3. ✅ 情绪分布数据现在在后端和前端保持一致

### 影响范围
- 前端组件：2个文件
- 前端Hook：1个文件
- 后端服务：1个文件
- 总计：4个文件修改

### 向后兼容性
所有修改都保持向后兼容，不影响现有功能。
