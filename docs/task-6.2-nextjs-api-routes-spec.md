# Task 6.2: Next.js API Routes 实施规格

## 目标
创建Next.js API routes，作为前端到FastAPI的代理层，提供数据转换和类型安全。

## 文件结构
```
src/app/api/influencers/
├── route.ts                    # GET /api/influencers, POST /api/influencers
├── [id]/
│   ├── route.ts               # GET /api/influencers/[id]
│   ├── fetch/route.ts         # POST /api/influencers/[id]/fetch
│   └── posts/route.ts         # GET /api/influencers/[id]/posts
└── opinions/
    └── [domain]/route.ts      # GET /api/influencers/opinions/[domain]
```

## 端点规格

### 1. GET /api/influencers
**功能**: 查询influencer列表
**Query参数**:
- platform?: string
- page?: number (default: 1)
- pageSize?: number (default: 20)

**实现**:
```typescript
// src/app/api/influencers/route.ts
import { NextRequest, NextResponse } from 'next/server';

const FASTAPI_URL = process.env.FASTAPI_URL || 'http://localhost:8000';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const platform = searchParams.get('platform');
  const page = searchParams.get('page') || '1';
  const pageSize = searchParams.get('pageSize') || '20';

  const queryString = new URLSearchParams({
    page,
    pageSize,
    ...(platform && { platform })
  }).toString();

  const response = await fetch(`${FASTAPI_URL}/api/influencers?${queryString}`);
  
  if (!response.ok) {
    return NextResponse.json(
      { error: 'Failed to fetch influencers' },
      { status: response.status }
    );
  }

  const data = await response.json();
  return NextResponse.json(data);
}
```

### 2. POST /api/influencers
**功能**: 创建influencer
**Body**:
```typescript
{
  name: string;
  platform: string;
  accountId: string;
  driverType?: string;
  providerConfig?: string;
  fetchInterval?: number;
  priority?: string;
  isActive?: boolean;
}
```

**实现**:
```typescript
export async function POST(request: NextRequest) {
  const body = await request.json();

  const response = await fetch(`${FASTAPI_URL}/api/influencers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const error = await response.json();
    return NextResponse.json(error, { status: response.status });
  }

  const data = await response.json();
  return NextResponse.json(data);
}
```

### 3. GET /api/influencers/[id]
**功能**: 获取influencer详情

**实现**:
```typescript
// src/app/api/influencers/[id]/route.ts
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const response = await fetch(`${FASTAPI_URL}/api/influencers/${params.id}`);
  
  if (!response.ok) {
    return NextResponse.json(
      { error: 'Influencer not found' },
      { status: 404 }
    );
  }

  const data = await response.json();
  return NextResponse.json(data);
}
```

### 4. POST /api/influencers/[id]/fetch
**功能**: 触发手动获取帖子

**实现**:
```typescript
// src/app/api/influencers/[id]/fetch/route.ts
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const response = await fetch(
    `${FASTAPI_URL}/api/influencers/${params.id}/fetch`,
    { method: 'POST' }
  );

  if (!response.ok) {
    const error = await response.json();
    return NextResponse.json(error, { status: response.status });
  }

  const data = await response.json();
  return NextResponse.json(data);
}
```

### 5. GET /api/influencers/[id]/posts
**功能**: 获取influencer的帖子列表
**Query参数**:
- page?: number
- pageSize?: number
- aiProcessed?: boolean

**实现**:
```typescript
// src/app/api/influencers/[id]/posts/route.ts
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { searchParams } = new URL(request.url);
  const page = searchParams.get('page') || '1';
  const pageSize = searchParams.get('pageSize') || '20';
  const aiProcessed = searchParams.get('aiProcessed');

  const queryString = new URLSearchParams({
    page,
    pageSize,
    ...(aiProcessed && { aiProcessed })
  }).toString();

  const response = await fetch(
    `${FASTAPI_URL}/api/influencers/${params.id}/posts?${queryString}`
  );

  if (!response.ok) {
    return NextResponse.json(
      { error: 'Failed to fetch posts' },
      { status: response.status }
    );
  }

  const data = await response.json();
  return NextResponse.json(data);
}
```

### 6. GET /api/influencers/opinions/[domain]
**功能**: 获取领域聚合观点
**Query参数**:
- timeWindow?: string (3d|7d|30d, default: 7d)

**实现**:
```typescript
// src/app/api/influencers/opinions/[domain]/route.ts
export async function GET(
  request: NextRequest,
  { params }: { params: { domain: string } }
) {
  const { searchParams } = new URL(request.url);
  const timeWindow = searchParams.get('timeWindow') || '7d';

  const response = await fetch(
    `${FASTAPI_URL}/api/influencers/opinions/domain/${params.domain}?time_window=${timeWindow}`
  );

  if (!response.ok) {
    return NextResponse.json(
      { error: 'Failed to fetch opinions' },
      { status: response.status }
    );
  }

  const data = await response.json();
  return NextResponse.json(data);
}
```

## 类型定义
创建`src/types/influencer.ts`:
```typescript
export interface Influencer {
  id: string;
  name: string;
  platform: string;
  accountId: string;
  driverType: string;
  isActive: boolean;
  lastFetchAt?: string;
  lastFetchStatus?: string;
  createdAt: string;
}

export interface InfluencerPost {
  id: string;
  influencerId: string;
  content: string;
  originalUrl?: string;
  publishTime: string;
  mediaType: string;
  mediaUrls?: string[];
  engagement?: {
    likes: number;
    comments: number;
    shares: number;
  };
  aiProcessed: boolean;
  opinionSummary?: string;
  opinionStance?: string;
  sentiment?: number;
}

export interface DomainOpinions {
  domain: string;
  timeWindow: string;
  statistics: {
    totalOpinions: number;
    stanceDistribution: {
      bullish: number;
      neutral: number;
      bearish: number;
    };
    avgConfidence: number;
    avgSentiment: number;
    avgCredibility: number;
  };
  topOpinions: Array<{
    postId: string;
    influencerName: string;
    opinionSummary: string;
    stance: string;
    compositeScore: number;
    publishTime: string;
  }>;
  consensusPoints: Array<{
    theme: string;
    supportingCount: number;
    keywords: string[];
    avgConfidence: number;
  }>;
  timeline: Array<{
    date: string;
    bullishCount: number;
    neutralCount: number;
    bearishCount: number;
    avgSentiment: number;
  }>;
}
```

## 环境变量
在`.env.local`添加:
```
FASTAPI_URL=http://localhost:8000
```

## 错误处理
所有route都应包含：
- Try-catch包裹fetch调用
- 返回适当的HTTP状态码
- 统一的错误响应格式：`{ error: string, details?: any }`

## 测试
虽然Next.js API routes难以单元测试，但应该：
1. 手动测试所有端点
2. 验证参数传递正确
3. 验证错误处理
4. 检查响应数据结构

## 实施检查清单
- [ ] 创建所有route文件
- [ ] 实现所有端点
- [ ] 添加类型定义
- [ ] 配置环境变量
- [ ] 错误处理完整
- [ ] 手动测试通过
- [ ] 提交代码

## 提交信息
```
feat(api): add Next.js API routes for influencer management

- Proxy routes to FastAPI backend
- Type-safe interfaces
- Error handling and validation
- Support for all CRUD operations
```
