# 启用市场数据刷新功能 - 快速指南

## ✅ 已完成（立即生效）

以下功能已经实现并且**无需重启**即可使用：

### 1. 手动刷新按钮
- **位置**: 仪表盘右上角"刷新数据"按钮
- **功能**: 点击后立即获取最新市场数据，绕过缓存
- **状态**: ✅ 已生效（Next.js dev 服务器自动热重载）

### 2. 缓存清理API
```bash
# 清空所有Next.js缓存
curl -X POST http://localhost:3000/api/cache/clear
```
- **状态**: ✅ 已生效

### 3. 强制刷新API参数
```bash
# 强制获取最新数据
curl 'http://localhost:3000/api/market/overview?refresh=true'
curl 'http://localhost:3000/api/market/capital-flow?refresh=true'
```
- **状态**: ✅ 已生效

## ⏳ 需要操作（启用定时任务）

### 每日自动缓存刷新

**功能**: 每天15:30（交易日收盘后）自动清理缓存并预热数据

**需要重启Python服务才能生效**：

```bash
# 方式1: 如果Python服务在前台运行
# 按 Ctrl+C 停止，然后重新启动
cd data-service
python main.py

# 方式2: 如果Python服务在后台运行
pkill -f "python.*main.py"
cd data-service
python main.py

# 方式3: 如果使用 nohup 后台运行
pkill -f "python.*main.py"
cd data-service
nohup python main.py > output.log 2>&1 &
```

**验证定时任务已启动**：

```bash
# 查看启动日志，应该看到：
# "已注册每日缓存刷新任务 (每天15:30执行)"

# 或者通过API检查
curl http://localhost:8000/api/scheduler/status | jq '.'
# 应该看到 "jobs" 数组中有 "daily_cache_refresh"
```

## 🧪 测试验证

运行自动化测试脚本：

```bash
bash test-cache-refresh.sh
```

预期输出：
```
✓ Cache is working (timestamps match)
✓ Force refresh works (new timestamp)
✓ Cache clear works (new timestamp)
```

## 📋 使用说明

### 普通用户
1. **查看最新数据**: 点击仪表盘右上角"刷新数据"按钮
2. **查看更新时间**: 页面顶部显示"XX:XX:XX 更新"
3. **无需其他操作**: 系统会自动在后台刷新数据

### 开发者
1. **手动清理缓存**: `curl -X POST http://localhost:3000/api/cache/clear`
2. **强制刷新API**: 添加 `?refresh=true` 参数
3. **查看缓存统计**: `curl http://localhost:8000/api/cache/stats`
4. **检查调度任务**: `curl http://localhost:8000/api/scheduler/status`

## 📚 详细文档

- **实施总结**: `docs/troubleshooting/cache-refresh-implementation-summary.md`
- **用户指南**: `docs/troubleshooting/cache-refresh-guide.md`
- **数据流图**: `docs/troubleshooting/cache-refresh-dataflow.md`

## ❓ 常见问题

### Q: 我点了刷新按钮但数据没变？
A: 
1. 检查页面顶部的更新时间是否变化
2. 可能是非交易时段，显示的都是收盘数据（这是正常的）
3. 查看"数据日期"字段确认数据来源日期

### Q: 定时任务什么时候执行？
A: 每天15:30（中国A股收盘后），确保获取最新收盘数据

### Q: 定时任务失败了怎么办？
A: 
1. 检查Python服务日志
2. 确认Next.js服务在运行（localhost:3000）
3. 查看调度器状态: `curl http://localhost:8000/api/scheduler/status`

### Q: 缓存有什么好处？
A: 
- 减少对外部API的请求次数
- 提升页面响应速度（5ms vs 500ms）
- 降低服务器压力
- 避免API限流

### Q: 为什么自动刷新不绕过缓存？
A: 
- 自动刷新频率高（30秒），如果每次都请求真实数据会造成服务器压力
- 缓存TTL是30秒，所以最多延迟30秒
- 用户手动点击时才需要立即最新数据

## ⚠️ 注意事项

1. **非交易时段**: 系统会显示最近一个交易日的收盘数据，这是正常的
2. **数据来源**: 页面顶部会显示数据来源（真实数据/估算数据/缓存数据）
3. **Python服务**: 必须保持运行状态，否则会降级到文件缓存
4. **定时任务**: 需要重启Python服务后才会生效

## 🎯 验收确认

- [x] 刷新按钮能立即获取最新数据
- [x] 页面显示更新时间
- [x] 缓存机制正常工作（重复请求返回相同数据）
- [x] 强制刷新参数有效（?refresh=true）
- [x] 缓存清理API有效
- [ ] **待操作**: 重启Python服务启用定时任务
- [ ] **待验证**: 等待15:30观察定时任务是否执行

---

**完成日期**: 2026-07-24  
**下一步**: 重启Python服务启用每日定时任务
