# 产业图谱任务状态查询问题修复报告

## 问题描述
在产业图谱页面，输入"AI算力硬件"并点击"开始探索"后，显示"准备中"，但报错"获取任务状态失败"。

## 问题原因

### 1. Python数据服务未启动
- 数据服务没有运行，导致所有后端API调用失败

### 2. 缺少数据库连接模块
- `data-service/routers/influencers.py` 等文件导入了不存在的 `db` 模块
- 导致Python服务启动失败，报错：`ModuleNotFoundError: No module named 'db'`

### 3. Next.js 16 动态路由参数问题
- Next.js 16中，动态路由的 `params` 参数是 `Promise` 类型
- 原代码未使用 `await` 解析params，导致 `taskId` 为 `undefined`
- 最终导致API请求路径错误，返回404

## 修复内容

### 1. 创建数据库连接模块
**文件**: `data-service/db.py`

```python
"""数据库连接模块，提供SQLite数据库连接（与Prisma共享同一个数据库）"""

import sqlite3
from pathlib import Path
from typing import Optional
import logging

class Database:
    """数据库连接管理器"""
    def __init__(self, db_path: Optional[str] = None):
        if db_path is None:
            project_root = Path(__file__).parent.parent
            db_path = str(project_root / "prisma" / "dev.db")
        self.db_path = db_path
        
    def get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn
    
    # ... 其他数据库操作方法

# 全局数据库实例
db = Database()
```

### 2. 修复Next.js 16动态路由参数处理
**文件**: `src/app/api/graph/industries/tasks/[taskId]/route.ts`

```typescript
// 修改前
export async function GET(
  request: NextRequest,
  { params }: { params: { taskId: string } }
) {
  const { taskId } = params  // ❌ 错误：params是Promise
  // ...
}

// 修改后
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params  // ✅ 正确：需要await
  // ...
}
```

**文件**: `src/app/api/graph/industries/tasks/[taskId]/approve-structure/route.ts`
- 同样修复了params的Promise类型处理

### 3. 添加详细日志
在任务状态查询API中添加了详细的调试日志，便于排查问题：
```typescript
console.log('[查询任务状态] taskId:', taskId)
console.log('[查询任务状态] 请求URL:', url)
console.log('[查询任务状态] 响应状态:', response.status)
```

## 测试验证

### 1. Python数据服务测试
```bash
# 启动服务
python3 main.py

# 健康检查
curl http://localhost:8000/health
# 返回：{"status":"healthy","version":"2.0.0",...}

# 创建产业探索任务
curl -X POST http://localhost:8000/api/v1/industry-graph/explore \
  -H "Content-Type: application/json" \
  -d '{"name":"AI算力硬件","description":"AI算力硬件产业链"}'
# 返回：{"task_id":"...","status":"started",...}

# 查询任务状态
curl http://localhost:8000/api/v1/industry-graph/tasks/{task_id}
# 返回：{"task_id":"...","status":"structure_ready",...}
```

### 2. Next.js API测试
```bash
# 创建产业
curl -X POST http://localhost:3000/api/graph/industries/create \
  -H "Content-Type: application/json" \
  -d '{"name":"AI算力硬件","description":"AI算力硬件产业链"}'
# 返回：{"success":true,"data":{"taskId":"...",...}}

# 查询任务状态（修复后）
curl http://localhost:3000/api/graph/industries/tasks/{taskId}
# 返回：{"success":true,"data":{"status":"structure_ready",...}}
```

### 3. 完整流程测试
1. 访问产业图谱创建页面
2. 输入"AI算力硬件"
3. 点击"开始探索"
4. ✅ 显示"准备中"状态
5. ✅ 自动轮询任务状态，显示进度
6. ✅ 任务完成后显示"产业链结构已生成，等待审核"

## 影响范围
- **修复的功能**: 产业图谱创建和任务状态查询
- **修复的文件**:
  - `data-service/db.py` (新增)
  - `src/app/api/graph/industries/tasks/[taskId]/route.ts`
  - `src/app/api/graph/industries/tasks/[taskId]/approve-structure/route.ts`
- **其他可能受影响的文件**: 其他使用动态路由参数的API (已检查并确认)

## 注意事项
1. Python数据服务需要在启动Next.js应用之前启动
2. 确保 `.env` 文件中配置了正确的 `DATA_SERVICE_URL=http://localhost:8000`
3. Next.js 16的动态路由参数都是Promise类型，所有动态路由都需要使用 `await params`

## 后续建议
1. 添加服务健康检查机制，在Next.js启动时验证Python服务是否可用
2. 考虑使用Docker Compose统一管理多个服务的启动
3. 添加更完善的错误提示，告知用户Python服务未启动
4. 为Python服务添加systemd或其他进程管理工具

## 修复时间
2026-08-03

## 修复人员
Claude (AI Assistant)
