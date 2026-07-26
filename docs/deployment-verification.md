# 部署验证清单

**日期**: 2026-07-25  
**修复内容**: UI显示问题修复

## 服务状态 ✅

### Next.js开发服务器
- **状态**: ✅ 运行中
- **端口**: 3000
- **进程ID**: 11271
- **访问地址**: http://localhost:3000

### Python数据服务
- **状态**: ✅ 运行中
- **端口**: 8000
- **进程ID**: 69043
- **访问地址**: http://localhost:8000

## 代码变更已部署 ✅

以下文件已修改并触发热重载：

1. ✅ `src/app/(dashboard)/events/feed/page.tsx` - 资讯流页面
2. ✅ `src/hooks/useNewsStream.ts` - SSE连接Hook
3. ✅ `data-service/services/trend_analysis_service.py` - 情绪分析服务

## 验证步骤

### 1️⃣ 问题1: 新闻时间和来源显示格式

**测试页面**: 
- http://localhost:3000/events/feed
- http://localhost:3000/events/trends (选择任意领域查看详情)

**预期结果**:
- 资讯流和趋势详情页的新闻项格式一致
- 来源和时间都在同一行显示（在标签区域内）
- 时间格式为相对时间（"5分钟前"）或短格式（"07-25 10:30"）

**验证步骤**:
1. 打开 http://localhost:3000/events/feed
2. 查看新闻列表，注意来源和时间的显示位置
3. 打开 http://localhost:3000/events/trends
4. 点击任意领域的"查看详情"按钮
5. 滚动到"相关新闻列表"
6. 对比两个页面的新闻项显示格式

---

### 2️⃣ 问题2: SSE连接状态跳变

**测试页面**: http://localhost:3000/events/feed

**场景A - 正常连接**:
1. 确保Python服务正在运行（端口8000）
2. 打开资讯流页面
3. 观察右上角连接状态

**预期结果**:
- 显示 "🟢 实时连接" 
- 状态稳定，不跳变

**场景B - 服务中断**:
1. 停止Python服务：`kill 69043`
2. 刷新页面或等待连接断开

**预期结果**:
- 初始显示 "⚪ 离线模式"
- 尝试重连，依次显示：
  - "重连中... (1/3)" - 5秒后
  - "重连中... (2/3)" - 10秒后
  - "重连中... (3/3)" - 20秒后
- 最终显示 "⚪ 连接不可用"
- **不应该**快速跳变

---

### 3️⃣ 问题3: 情绪分布数据一致性

**测试页面**: 
- http://localhost:3000/events/trends (概览)
- http://localhost:3000/events/trends/[domain] (详情)

**验证步骤**:
1. 打开 http://localhost:3000/events/trends
2. 记录某个领域的情绪分布数字，例如：
   ```
   AI芯片领域：
   - 看涨: 15
   - 中性: 20
   - 看跌: 5
   ```

3. 点击"查看详情"按钮进入详情页
4. 验证以下位置的数字是否一致：

   **位置A - 顶部统计卡片**:
   - "利好新闻" 卡片 = 15
   - "利空新闻" 卡片 = 5

   **位置B - 情绪分布区块**:
   - 绿色"看涨" = 15
   - 灰色"中性" = 20
   - 红色"看跌" = 5
   - 总计 = 40条新闻

   **位置C - 相关新闻列表**:
   - 手动计数新闻项的情绪标签：
     - 绿色"利好"标签数量 = 15
     - 灰色"中性"标签数量 = 20
     - 红色"利空"标签数量 = 5

**预期结果**:
所有三个位置的数字应该**完全一致**

---

## 快速测试命令

```bash
# 检查服务状态
lsof -i:3000  # Next.js
lsof -i:8000  # Python服务

# 查看Python服务日志
tail -f /tmp/data-service.log

# 查看Next.js日志
tail -f .next/dev/logs/next-development.log

# 重启Python服务（如需要）
kill $(lsof -ti:8000)
nohup python3 main.py > /tmp/data-service.log 2>&1 &

# 触发Next.js热重载（如需要）
touch 'src/app/(dashboard)/events/feed/page.tsx'
touch 'src/hooks/useNewsStream.ts'
```

---

## 常见问题

### Q: 页面没有显示变化怎么办？

A: 按以下步骤排查：

1. **硬刷新浏览器**: `Cmd+Shift+R` (Mac) 或 `Ctrl+Shift+R` (Windows)
2. **清除浏览器缓存**: 开发者工具 → Network → Disable cache
3. **检查控制台错误**: 开发者工具 → Console
4. **确认服务运行**: 
   ```bash
   lsof -i:3000  # Next.js应该在运行
   lsof -i:8000  # Python服务应该在运行
   ```

### Q: SSE连接一直显示"离线模式"？

A: 检查Python服务：
```bash
# 查看是否在运行
lsof -i:8000

# 查看日志
tail -20 /tmp/data-service.log

# 测试SSE端点
curl http://localhost:8000/api/news/stream
```

### Q: 情绪分布数字还是对不上？

A: 需要重启Python服务以加载新的情绪计算逻辑：
```bash
# 停止旧服务
kill $(lsof -ti:8000)

# 启动新服务
cd data-service
nohup python3 main.py > /tmp/data-service.log 2>&1 &
```

---

## 完成确认

验证完成后，请确认以下所有项：

- [ ] 资讯流和趋势详情的新闻格式一致
- [ ] SSE连接状态不再跳变
- [ ] 情绪分布在三个位置完全一致
- [ ] 浏览器控制台无错误
- [ ] 两个服务都在正常运行

全部确认后，修复即部署成功！ 🎉
