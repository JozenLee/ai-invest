# 大V管理系统增强设计文档

**日期**: 2026-07-26  
**版本**: 1.0  
**状态**: 待审核

## 一、需求背景

当前大V管理系统存在以下问题：
1. 添加大V时需要手动填写所有信息，容易出错且效率低
2. 不同平台的账号信息可以自动获取，但未实现
3. 编辑页面允许修改平台绑定的信息（如名称、头像），导致数据不一致
4. 缺少灵活的调度配置（轮询周期、定时任务、数据保留期）

## 二、设计目标

1. **自动化添加**：支持平台的大V只需输入账号ID，其他信息自动获取
2. **字段权限分离**：平台绑定字段只读，用户自定义字段可编辑
3. **灵活调度配置**：支持轮询和定时两种模式，可自定义周期和时间点
4. **数据生命周期管理**：可配置动态数据保留天数

## 三、架构设计

### 3.1 数据模型变更

**Influencer 模型新增字段**：

```prisma
model Influencer {
  // ... 现有字段保持不变
  
  // 新增调度配置字段
  scheduleType      String   @default("polling")  // polling=轮询 | daily=定时
  dailyFetchTimes   String?  // JSON数组: ["12:00", "14:00"]，仅定时模式使用
  dataRetentionDays Int      @default(30)        // 动态数据保留天数
}
```

**字段分类**：

- **只读字段（平台绑定）**：
  - `name` - 大V名称
  - `avatarUrl` - 头像URL
  - `profileUrl` - 个人主页
  - `category` - 领域分类（从平台认证信息提取）
  - `platform` - 平台类型
  - `accountId` - 账号ID

- **可编辑字段（用户自定义）**：
  - `tags` - 标签
  - `priority` - 优先级
  - `isActive` - 是否启用
  - `scheduleType` - 调度策略
  - `fetchInterval` - 轮询周期（分钟）
  - `dailyFetchTimes` - 定时时间列表
  - `dataRetentionDays` - 数据保留天数

### 3.2 API设计

#### 新增接口：账号验证

```
POST /api/influencers/validate
```

**请求体**：
```json
{
  "platform": "bilibili",
  "accountId": "123456"
}
```

**响应（成功）**：
```json
{
  "success": true,
  "data": {
    "name": "半导体行业观察",
    "avatarUrl": "https://...",
    "profileUrl": "https://space.bilibili.com/123456",
    "category": "科技",
    "verified": true,
    "followersCount": 50000
  }
}
```

**响应（平台不支持）**：
```json
{
  "success": false,
  "error": "该平台暂不支持自动获取，请手动填写信息"
}
```

#### 修改接口：创建大V

```
POST /api/influencers
```

**请求体新增字段**：
```json
{
  // ... 现有字段
  "scheduleType": "polling",
  "fetchInterval": 30,
  "dailyFetchTimes": ["12:00", "14:00"],
  "dataRetentionDays": 30
}
```

**默认值**：
- `scheduleType`: "polling"
- `fetchInterval`: 30
- `dailyFetchTimes`: ["12:00", "14:00"]
- `dataRetentionDays`: 30

#### 修改接口：更新大V

```
PUT /api/influencers/{id}
```

**限制**：
- 不允许修改：`name`, `avatarUrl`, `profileUrl`, `category`, `platform`, `accountId`
- 可修改：`tags`, `priority`, `isActive`, `scheduleType`, `fetchInterval`, `dailyFetchTimes`, `dataRetentionDays`

### 3.3 平台Provider增强

**BilibiliAPIProvider 已实现**：
- `fetch_user_info(account_id)` - 获取用户基本信息
- 返回字段：name, avatar_url, description, verified, followers_count
- 领域提取：从 `official.title` 或 `official.desc` 中提取

**其他平台待实现**：
- WeiboProvider
- XiaohongshuProvider
- ZhihuProvider
- DouyinProvider
- AlipayProvider

**Provider接口规范**：
```python
async def fetch_user_info(self, account_id: str) -> Dict:
    """
    返回格式：
    {
        'name': str,
        'avatar_url': str,
        'profile_url': str,
        'category': str,  # 从认证信息提取
        'verified': bool,
        'followers_count': int
    }
    """
```

### 3.4 数据同步机制

**同步时机**：
1. 添加大V时：首次验证并获取平台数据
2. 每次抓取动态时：更新平台绑定字段（name, avatarUrl, profileUrl, category）
3. 编辑时：不允许手动修改平台绑定字段

**同步逻辑**（在 `InfluencerFetchService.fetch_influencer_posts` 中）：
```python
# 抓取动态前，先更新用户信息
user_info = await provider.fetch_user_info(account_id)
if user_info:
    await db.execute("""
        UPDATE Influencer SET
            name = ?,
            avatarUrl = ?,
            profileUrl = ?,
            category = ?,
            updatedAt = ?
        WHERE id = ?
    """, (user_info['name'], user_info['avatar_url'], 
          user_info['profile_url'], user_info['category'],
          datetime.now().isoformat(), influencer_id))
```

## 四、前端设计

### 4.1 添加大V页面（/events/influencers/new）

**流程设计**：

```
第一步：基本信息
├─ 平台选择（下拉框）
├─ 账号ID输入（文本框）
└─ [验证并获取信息] 按钮

↓ 点击验证

第二步（支持自动获取的平台）：
├─ 平台信息预览（灰色卡片，只读）
│   ├─ 头像
│   ├─ 名称
│   ├─ 主页链接
│   └─ 领域分类
└─ 自定义配置（白色卡片，可编辑）
    ├─ 标签
    ├─ 优先级
    ├─ 调度策略
    │   ├─ ○ 轮询模式：周期 [30] 分钟
    │   └─ ○ 定时模式：时间点 [12:00] [14:00] [+添加]
    └─ 数据保留：[30] 天

第二步（不支持自动获取的平台）：
├─ ⚠️ 提示："该平台暂不支持自动获取，请手动填写"
└─ 手动输入所有字段
```

**组件结构**：
- `PlatformValidator` - 平台验证组件
- `AutoFilledInfo` - 自动填充信息预览
- `ScheduleConfigPanel` - 调度配置面板
- `TimePickerList` - 时间点选择器

### 4.2 编辑大V页面（/events/influencers/{id}/edit）

**布局设计**：

```
┌─────────────────────────────────────┐
│ 平台信息（只读）                      │
│ 背景：灰色，标注"自动同步，不可编辑"    │
├─────────────────────────────────────┤
│ 头像  名称  主页  领域                │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ 自定义配置（可编辑）                   │
│ 背景：白色                            │
├─────────────────────────────────────┤
│ 标签、优先级、启用状态                 │
│ 调度策略、轮询周期、定时时间           │
│ 数据保留天数                          │
└─────────────────────────────────────┘
```

**验证规则**：
- 提交时检查是否修改了只读字段，如有则报错
- 前端表单控件设置 `disabled` 属性
- 后端API也需要验证并拒绝只读字段的修改

### 4.3 调度策略UI组件

**RadioGroup + 条件显示**：

```tsx
<RadioGroup value={scheduleType} onValueChange={setScheduleType}>
  <div className="space-y-4">
    <div className="flex items-center space-x-2">
      <RadioGroupItem value="polling" id="polling" />
      <Label htmlFor="polling">轮询模式</Label>
    </div>
    {scheduleType === 'polling' && (
      <div className="ml-6 space-y-2">
        <Label>更新周期（分钟）</Label>
        <Input type="number" min="10" max="1440" value={fetchInterval} />
        <p className="text-xs text-muted-foreground">
          建议：30-120分钟
        </p>
      </div>
    )}

    <div className="flex items-center space-x-2">
      <RadioGroupItem value="daily" id="daily" />
      <Label htmlFor="daily">定时模式</Label>
    </div>
    {scheduleType === 'daily' && (
      <div className="ml-6 space-y-2">
        <Label>每日执行时间</Label>
        <TimePickerList times={dailyFetchTimes} onChange={setDailyFetchTimes} />
        <p className="text-xs text-muted-foreground">
          点击"+"添加更多时间点
        </p>
      </div>
    )}
  </div>
</RadioGroup>
```

### 4.4 时间选择器组件

**TimePickerList 组件**：

```tsx
interface TimePickerListProps {
  times: string[];  // ["12:00", "14:00"]
  onChange: (times: string[]) => void;
}

// 功能：
// 1. 显示已添加的时间点，每个带删除按钮
// 2. [+ 添加时间] 按钮，点击弹出时间选择器
// 3. 验证：不允许重复时间，最多10个时间点
```

## 五、后端实现

### 5.1 数据库迁移

```sql
-- 添加新字段到Influencer表
ALTER TABLE Influencer ADD COLUMN scheduleType TEXT DEFAULT 'polling';
ALTER TABLE Influencer ADD COLUMN dailyFetchTimes TEXT;
ALTER TABLE Influencer ADD COLUMN dataRetentionDays INTEGER DEFAULT 30;
```

### 5.2 新增路由：/api/influencers/validate

**文件**: `data-service/routers/influencers.py`

```python
@router.post("/validate")
async def validate_influencer_account(data: dict):
    """
    验证平台账号并获取信息
    """
    platform = data.get('platform')
    account_id = data.get('accountId')
    
    # 检查平台是否支持自动获取
    if platform == 'bilibili':
        from providers.bilibili_provider import BilibiliAPIProvider
        provider = BilibiliAPIProvider(config={})
        user_info = await provider.fetch_user_info(account_id)
        
        if not user_info:
            raise HTTPException(400, "无法获取用户信息，请检查账号ID")
        
        # 从认证信息提取领域
        category = extract_category_from_official(user_info)
        
        return {
            "success": True,
            "data": {
                "name": user_info['name'],
                "avatarUrl": user_info['avatar_url'],
                "profileUrl": f"https://space.bilibili.com/{account_id}",
                "category": category,
                "verified": user_info.get('verified', False),
                "followersCount": user_info.get('followers_count', 0)
            }
        }
    else:
        raise HTTPException(400, "该平台暂不支持自动获取，请手动填写信息")
```

### 5.3 修改创建和更新接口

**InfluencerCreate 模型**：
```python
class InfluencerCreate(BaseModel):
    # ... 现有字段
    schedule_type: str = Field(default="polling")
    daily_fetch_times: Optional[List[str]] = None
    data_retention_days: int = Field(default=30)
```

**PUT接口验证**：
```python
# 只读字段列表
READONLY_FIELDS = ['name', 'avatarUrl', 'profileUrl', 'category', 'platform', 'accountId']

# 更新时检查
for field in READONLY_FIELDS:
    if field in request_data:
        raise HTTPException(400, f"字段 {field} 不允许手动修改")
```

### 5.4 数据清理任务

**新增定时任务**：清理过期动态数据

```python
async def cleanup_expired_posts():
    """
    根据每个influencer的dataRetentionDays配置清理过期数据
    """
    async with db.get_connection() as conn:
        # 获取所有influencer的保留配置
        cursor = await conn.execute("""
            SELECT id, dataRetentionDays FROM Influencer
        """)
        influencers = await cursor.fetchall()
        
        for inf in influencers:
            retention_days = inf['dataRetentionDays']
            await conn.execute("""
                DELETE FROM InfluencerPost
                WHERE influencerId = ?
                AND publishTime < datetime('now', '-' || ? || ' days')
            """, (inf['id'], retention_days))
```

## 六、实现计划

### Phase 1: 数据库和后端（优先）
1. 数据库迁移：添加新字段
2. 修改 Prisma schema
3. 实现 `/api/influencers/validate` 接口
4. 修改创建和更新接口，添加字段验证
5. 增强 BilibiliProvider 的领域提取逻辑

### Phase 2: 前端表单改造
1. 创建 `PlatformValidator` 组件
2. 创建 `ScheduleConfigPanel` 组件
3. 创建 `TimePickerList` 组件
4. 改造添加大V页面
5. 改造编辑大V页面

### Phase 3: 调度器集成
1. 修改调度器以支持 `daily` 模式
2. 实现数据清理定时任务
3. 在抓取服务中添加用户信息同步逻辑

### Phase 4: 测试和优化
1. 单元测试：验证接口、字段权限控制
2. 集成测试：添加→抓取→编辑→数据清理全流程
3. UI测试：表单验证、错误提示
4. 性能优化：验证接口缓存、批量数据清理

## 七、风险和注意事项

### 7.1 平台API限制
- **风险**：Bilibili等平台可能有反爬虫或请求频率限制
- **缓解**：
  - 添加重试逻辑（已实现）
  - 验证接口添加缓存（5分钟）
  - 错误提示用户稍后重试

### 7.2 领域提取准确性
- **风险**：从平台认证信息提取的领域可能不准确
- **缓解**：
  - 提供手动覆盖选项（标签字段）
  - 后续可通过AI分析历史动态优化

### 7.3 数据迁移
- **风险**：现有influencer记录缺少新字段
- **缓解**：
  - 设置合理默认值
  - 提供批量更新脚本
  - 编辑页面引导用户补充配置

### 7.4 调度策略切换
- **风险**：从轮询切换到定时可能导致抓取中断
- **缓解**：
  - 保存配置时立即更新调度器
  - 日志记录调度变更
  - 提供调度状态监控

## 八、成功指标

1. **自动化率**：Bilibili平台大V添加的自动填充成功率 > 95%
2. **数据一致性**：平台绑定字段与实际平台数据一致性 > 98%
3. **用户体验**：添加大V平均耗时 < 30秒（含验证）
4. **数据质量**：过期数据清理任务准确率 100%
5. **灵活性**：支持用户自定义调度配置，配置生效及时性 < 5分钟

## 九、未来扩展

1. **更多平台支持**：逐步实现微博、知乎等平台的自动获取
2. **AI领域推断**：基于历史动态内容自动推断和更新领域分类
3. **智能调度**：根据大V活跃时间自动优化抓取时间
4. **数据归档**：超过保留期的数据归档到冷存储而非直接删除
5. **批量导入**：支持CSV批量导入大V列表

---

**文档版本历史**：
- v1.0 (2026-07-26): 初始版本，完整设计方案
