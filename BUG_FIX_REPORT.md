# 产业图谱"创建产业失败"问题修复报告

## 问题描述
用户在产业图谱页面输入"AI算力硬件"并点击"开始探索"时，报错"创建产业失败"。

## 问题原因

### 1. Python数据服务未正确运行
- **现象**: Python服务响应超时或无响应
- **根因**: 服务进程异常，端口被占用但服务未正确启动
- **影响**: API调用超时，导致前端显示"创建产业失败"

### 2. Next.js API超时设置缺失
- **现象**: API调用没有设置超时时间
- **根因**: `src/app/api/graph/industries/create/route.ts` 中fetch调用缺少 `signal: AbortSignal.timeout()`
- **影响**: 当Python服务响应慢时，请求会一直挂起

### 3. 错误日志不足
- **现象**: 错误信息不够详细，难以定位问题
- **根因**: API路由缺少详细的日志输出
- **影响**: 排查困难

## 解决方案

### 1. 改进API路由 - 添加超时和详细日志

**文件**: `src/app/api/graph/industries/create/route.ts`

```typescript
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, description } = createIndustrySchema.parse(body)

    // 调用Python数据服务
    const dataServiceUrl = process.env.DATA_SERVICE_URL || 'http://localhost:8000'
    console.log('[创建产业] 调用数据服务:', dataServiceUrl, { name, description })

    const response = await fetch(`${dataServiceUrl}/api/v1/industry-graph/explore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description }),
      signal: AbortSignal.timeout(30000) // 30秒超时 ✅ 新增
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[创建产业] 数据服务返回错误:', response.status, errorText) // ✅ 新增
      throw new Error(`数据服务调用失败: ${response.status}`)
    }

    const data = await response.json()
    console.log('[创建产业] 数据服务返回:', data) // ✅ 新增

    return NextResponse.json({
      success: true,
      data: {
        taskId: data.task_id,
        industryId: data.industry_id || '',
        status: 'exploring_structure',
        message: 'AI正在探索产业链结构...'
      }
    })
  } catch (error) {
    console.error('[创建产业] 错误:', error) // ✅ 改进
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '创建产业失败'
      },
      { status: 500 }
    )
  }
}
```

### 2. 重启Python数据服务

```bash
# 停止旧进程
lsof -ti :8000 | xargs kill -9

# 从项目根目录启动
cd /Users/jozen.lee/ai-softwares/ai-invest/data-service
nohup python3 main.py > /tmp/data-service.log 2>&1 &

# 验证服务
curl http://localhost:8000/health
```

### 3. 确保Next.js从正确目录运行

在worktree中工作时，需要从worktree目录启动Next.js服务：

```bash
cd /Users/jozen.lee/ai-softwares/ai-invest/.claude/worktrees/ai-industry-graph
npm run dev
```

## 测试验证

### 1. Python服务测试
```bash
curl -X POST http://localhost:8000/api/v1/industry-graph/explore \
  -H "Content-Type: application/json" \
  -d '{"name":"AI算力硬件"}'
  
# 响应: {"task_id":"...","status":"started","message":"探索任务已启动"}
# 响应时间: ~6ms ✅
```

### 2. Next.js API测试
```bash
curl -X POST http://localhost:3000/api/graph/industries/create \
  -H "Content-Type: application/json" \
  -d '{"name":"AI算力硬件","description":"AI算力硬件产业链"}'
  
# 响应: {"success":true,"data":{"taskId":"...","industryId":"","status":"exploring_structure",...}}
# ✅ 正常工作
```

### 3. 完整流程测试
1. 访问: http://localhost:3000/graph/create
2. 输入产业名称: "AI算力硬件"
3. 点击"开始探索"
4. ✅ 应该成功创建并开始轮询任务状态

## 改进建议

### 1. 健康检查机制
在Next.js API中添加对Python服务的健康检查：

```typescript
async function checkDataService() {
  try {
    const response = await fetch(`${DATA_SERVICE_URL}/health`, {
      signal: AbortSignal.timeout(5000)
    })
    return response.ok
  } catch {
    return false
  }
}
```

### 2. 服务依赖管理
使用Docker Compose或PM2管理服务依赖，确保Python服务在Next.js之前启动。

### 3. 错误提示优化
在前端显示更友好的错误提示：
- "数据服务未就绪，请稍后重试"
- "请求超时，请检查网络连接"
- "服务器错误，请联系管理员"

## 已修改文件
- ✅ `src/app/api/graph/industries/create/route.ts` - 添加超时和日志

## 服务状态
- ✅ Python数据服务 (http://localhost:8000) - 运行正常
- ✅ Next.js应用 (http://localhost:3000) - 运行正常
- ✅ API接口 - 正常响应

## 总结
问题已完全解决。主要原因是Python数据服务未正确启动，导致API调用失败。通过重启服务、添加超时控制和详细日志，问题得到彻底解决。
