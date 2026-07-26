# KOL监控系统代码审查清单

## 通用检查项

### 规格符合性
- [ ] 所有要求的文件已创建
- [ ] 所有方法签名与规格一致
- [ ] 接口契约正确（输入/输出类型）
- [ ] 依赖关系正确

### 代码质量
- [ ] 遵循Python 3.11+语法
- [ ] 使用snake_case命名
- [ ] 异步函数使用async/await
- [ ] 错误处理完整（try/except with logging）
- [ ] 类型提示完整（typing模块）
- [ ] 日志记录适当（logger.error/warning/info）

### 测试质量
- [ ] 所有测试通过
- [ ] 测试覆盖主要功能路径
- [ ] 包含错误场景测试
- [ ] Mock使用正确（AsyncMock for async）
- [ ] 测试隔离性好（无副作用）

### 提交质量
- [ ] Commit message格式正确
- [ ] 代码已提交到git
- [ ] 无遗留调试代码
- [ ] 无硬编码敏感信息

## 特定检查项

### Provider类（Task 3.x）
- [ ] 继承BaseInfluencerProvider
- [ ] 实现所有抽象方法
- [ ] normalize_post返回标准格式
- [ ] 时间戳正确解析（非datetime.now()）
- [ ] since参数实现或文档说明
- [ ] API错误处理完整
- [ ] 已在__init__.py中注册

### Fetch Service（Task 4.1）
- [ ] 正确使用ProviderRegistry获取provider
- [ ] 去重逻辑正确（URL或content hash）
- [ ] Prisma操作正确（增删查改）
- [ ] 日志记录完整（InfluencerFetchLog）
- [ ] 队列集成（预留AI队列接口）
- [ ] 批量操作效率（避免N+1查询）

### AI Queue（Task 4.2）
- [ ] 独立于新闻队列
- [ ] Worker pool并发控制
- [ ] 优雅启动/关闭
- [ ] 队列积压处理
- [ ] 错误重试机制

### AI Analysis Service（Task 4.3）
- [ ] Claude API正确调用
- [ ] Prompt结构完整
- [ ] JSON响应解析健壮
- [ ] 所有AI字段更新
- [ ] 错误处理（API失败、解析失败）
- [ ] 分析日志记录

### Opinion Aggregation（Task 5.1）
- [ ] 时间窗口过滤正确
- [ ] 统计计算准确
- [ ] 共识识别逻辑合理
- [ ] 性能优化（数据库查询）

## 问题严重程度分类

### Critical（阻塞发布）
- 功能不可用
- 数据丢失/损坏风险
- 安全漏洞
- 资源泄漏

### Important（需要修复）
- 规格不符
- 逻辑错误
- 性能问题
- 测试缺失

### Minor（建议改进）
- 代码风格
- 注释不足
- 测试覆盖率可提升
- 重构机会
