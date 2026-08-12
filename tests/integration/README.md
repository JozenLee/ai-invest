# Integration Tests

集成测试用于验证系统各组件之间的协作和端到端功能。

## AI产业细分功能测试

### 文件
`ai-segmentation.test.ts`

### 测试目的
验证AI新闻分析功能是否正确识别产业细分领域，确保数据质量。

### 测试内容

1. **AI分析器初始化** (测试1)
   - 验证产业细分领域加载成功
   - 检查细分领域数量 > 30
   - 收集所有有效的segment codes

2. **新闻AI分析功能** (测试2)
   - 手动触发新闻采集任务
   - 等待AI分析完成
   - 验证至少80%的新闻包含segmentCodes字段
   - 检查segmentCodes格式（字符串数组）

3. **segmentCodes有效性** (测试3)
   - 验证segmentCodes中的代码在产业图谱中存在
   - 至少70%的代码应该是有效的
   - 测试通过segmentCodes筛选新闻功能

4. **错误处理** (测试4)
   - 检查AI处理失败率 < 20%
   - 验证错误标记正确

### 运行测试

#### 前置条件
1. 启动data-service (端口8000)
   ```bash
   cd data-service
   python main.py
   ```

2. 启动Next.js服务 (端口3000)
   ```bash
   npm run dev
   ```

3. 确保环境变量配置正确
   - `ANTHROPIC_API_KEY`: Claude API密钥
   - `ANTHROPIC_BASE_URL`: (可选) 自定义API端点

#### 执行测试
```bash
# 运行单个测试文件
npm run test tests/integration/ai-segmentation.test.ts

# 或使用vitest直接运行
npx vitest tests/integration/ai-segmentation.test.ts

# 查看详细输出
npx vitest tests/integration/ai-segmentation.test.ts --reporter=verbose
```

### 预期结果

✅ **成功标志**
- 产业细分领域数量 > 30
- 至少80%的新闻包含segmentCodes
- 至少70%的segmentCodes是有效的
- AI失败率 < 20%

❌ **失败场景**
- data-service未启动 → 采集任务触发失败
- AI API配置错误 → segmentCodes为空
- 产业图谱数据缺失 → 有效性验证失败

### 调试建议

1. **查看详细日志**
   测试包含详细的console.log输出，展示：
   - 产业和细分领域数量
   - 每条新闻的分析结果
   - segmentCodes内容和有效性
   - 统计数据

2. **检查data-service日志**
   ```bash
   # 查看data-service运行日志
   tail -f data-service/logs/app.log
   ```

3. **手动验证API**
   ```bash
   # 检查产业列表
   curl http://localhost:8000/api/v1/industries

   # 触发采集任务
   curl -X POST http://localhost:8000/api/v1/datasources/fetch \
     -H "Content-Type: application/json" \
     -d '{"source_id":"cailian_default","source_config":{"driverType":"api","provider":"akshare","limit":10}}'

   # 查看新闻
   curl http://localhost:3000/api/events/feed?limit=5
   ```

### 超时设置

测试超时时间：30秒 (TEST_TIMEOUT = 30000ms)

原因：
- AI分析需要调用Claude API
- 网络请求可能较慢
- 产业图谱数据加载需要时间

### 注意事项

1. **测试顺序依赖**
   - 测试按顺序执行
   - 测试2会触发新闻采集，为测试3提供数据

2. **数据状态**
   - 测试不清理数据库
   - 多次运行会累积新闻数据

3. **环境依赖**
   - 依赖外部服务（data-service, Next.js）
   - 需要网络访问（AI API调用）

4. **性能影响**
   - AI分析是异步的，等待20秒可能不够
   - 如果数据量大，可能需要更长时间

---

## 数据一致性测试

### 文件
`data-consistency.test.ts`

### 目的
验证资讯流API (`/api/events/feed`) 和趋势API (`/api/events/trends/[sector]`) 返回数据的一致性。

### 背景
用户报告资讯流筛选AI算力硬件只有2条，但趋势页面显示7条，数据不一致。

### 测试内容

#### 1. AI算力硬件数据一致性
- 对比资讯流和趋势API返回的新闻数量
- 分析新闻ID的重合度
- 输出差异新闻的详细信息

#### 2. 其他产业数据一致性
- 测试创新药产业
- 测试新能源汽车产业
- 验证不同产业的筛选逻辑是否一致

#### 3. 筛选逻辑分析
- 检查产业Segment配置
- 验证segmentCodes字段标注
- 分析筛选条件的有效性

#### 4. 数据源差异分析
- 对比SQLite本地数据库和Python服务
- 检查新闻ID格式差异
- 验证数据同步状态

#### 5. 时间范围影响
- 测试不带时间限制的查询
- 测试近7天的查询
- 对比时间范围对结果的影响

### 运行测试

```bash
# 只运行数据一致性测试
npm test -- tests/integration/data-consistency.test.ts

# 运行并查看详细输出
npm test -- tests/integration/data-consistency.test.ts --reporter=verbose
```

### 前置条件

1. **Next.js应用运行中**
   ```bash
   npm run dev
   ```
   默认端口: http://localhost:3000

2. **Python数据服务运行中**
   ```bash
   cd data-service
   python main.py
   ```
   默认端口: http://localhost:8000

3. **数据库已初始化**
   ```bash
   npm run db:migrate
   ```

4. **有新闻数据**
   - 运行过至少一次新闻采集
   - 或者数据库中有种子数据

### 测试结果解读

#### 成功状态
```
✅ 数据一致性良好，偏差在可接受范围内
```
- 偏差 < 20%：两个API返回的数据基本一致
- 大部分新闻ID重合
- segmentCodes字段标注正确

#### 失败状态
```
⚠️  检测到数据不一致！
```

测试会输出：
- 数据对比统计（总数、共同、差异）
- 仅在资讯流的新闻列表（前5条）
- 仅在趋势API的新闻列表（前5条）
- 每条新闻的详细字段（domainIds、segmentCodes）

### 常见问题

#### Q1: 测试显示"知识图谱服务未启动"
**原因**: Python数据服务未运行或知识图谱API不可用

**解决**:
```bash
cd data-service
python main.py
```

#### Q2: 两个API返回的新闻ID完全不同
**原因**: 数据来源不一致
- 资讯流从SQLite读取
- 趋势API从Python服务读取
- 两个数据库未同步

**解决**: 运行新闻采集任务，确保数据同步

#### Q3: segmentCodes字段全部为空
**原因**: 新闻未经过AI分析和标注

**解决**:
1. 检查AI分析器是否启用
2. 运行新闻刷新API: `POST /api/news/refresh`
3. 等待AI分析完成

#### Q4: 趋势API返回0条数据
**原因**:
- sectors字段未标注
- 产业名称匹配失败
- Python服务数据为空

**解决**:
1. 检查新闻是否有sectors字段
2. 验证产业名称是否正确（"AI算力硬件" vs "ai_hardware"）
3. 检查Python趋势服务的实现

### 调试技巧

#### 1. 查看原始API响应
```bash
# 资讯流API
curl "http://localhost:3000/api/events/feed?industryId=ai_hardware&limit=10"

# 趋势API
curl "http://localhost:3000/api/events/trends/AI算力硬件?days=7"

# Python趋势服务
curl "http://localhost:8000/api/news/trends/AI算力硬件?days=7"
```

#### 2. 检查数据库数据
```bash
# 进入SQLite
sqlite3 prisma/dev.db

# 查看新闻表结构
.schema NewsArticle

# 统计segmentCodes标注情况
SELECT
  COUNT(*) as total,
  SUM(CASE WHEN segmentCodes IS NULL OR segmentCodes = '[]' THEN 1 ELSE 0 END) as empty
FROM NewsArticle;

# 查看样本数据
SELECT id, title, segmentCodes, domainIds
FROM NewsArticle
LIMIT 5;
```

#### 3. 启用详细日志
在 `.env` 中添加：
```
LOG_LEVEL=debug
```

### 预期测试通过条件

修复数据不一致问题后，测试应该：
1. ✅ 资讯流和趋势API的偏差 < 20%
2. ✅ 所有新闻都有segmentCodes标注
3. ✅ 新闻ID重合度 > 80%
4. ✅ 知识图谱服务正常响应
5. ✅ 所有8个测试通过

### 相关文档
- 测试结果报告: `test-results/data-consistency-findings.md`
- API文档: `CLAUDE.md`
- 数据服务文档: `data-service/README.md`
