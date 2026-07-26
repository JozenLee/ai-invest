# Bilibili Cookie 配置指南

## 为什么需要 Cookie？

Bilibili 采用了严格的反爬虫机制，未登录状态下的 API 请求会被拦截。配置 Cookie 可以模拟登录状态，绕过这些限制。

## 获取 Cookie 步骤

### 1. 浏览器登录 Bilibili

访问 https://www.bilibili.com 并登录你的账号

### 2. 打开开发者工具

- **Chrome/Edge**: 按 `F12` 或 `Cmd+Option+I` (Mac)
- **Firefox**: 按 `F12` 或 `Cmd+Option+I` (Mac)
- **Safari**: 启用开发菜单后按 `Cmd+Option+I`

### 3. 找到 Cookie

1. 在开发者工具中，点击 **Application** (Chrome/Edge) 或 **Storage** (Firefox) 标签
2. 左侧展开 **Cookies** → 选择 `https://www.bilibili.com`
3. 找到以下三个关键 Cookie：

| Cookie 名称 | 说明 | 示例值 |
|------------|------|--------|
| `SESSDATA` | 会话标识 | `abc123def456...` (长字符串) |
| `bili_jct` | CSRF Token | `xyz789abc123...` |
| `DedeUserID` | 用户ID | `123456789` (数字) |

### 4. 复制 Cookie 值

右键点击每个 Cookie → 选择 "Copy Value" 或双击值进行复制

## 配置到系统

### 方法 1: 通过数据库更新

```sql
-- 更新现有大V的 providerConfig
UPDATE Influencer 
SET providerConfig = json_object(
    'cookies', json_object(
        'SESSDATA', 'your_sessdata_value_here',
        'bili_jct', 'your_bili_jct_value_here',
        'DedeUserID', 'your_dedeuserid_value_here'
    ),
    'retry_delay', 3,
    'max_retries', 3
)
WHERE id = 'inf_bilibili_72844725';
```

### 方法 2: 通过 API 创建（推荐）

```bash
curl -X POST http://localhost:8000/api/influencers \
  -H "Content-Type: application/json" \
  -d '{
    "name": "二狗学长好",
    "platform": "bilibili",
    "accountId": "72844725",
    "driverType": "api",
    "providerConfig": "{\"cookies\":{\"SESSDATA\":\"your_sessdata\",\"bili_jct\":\"your_bili_jct\",\"DedeUserID\":\"your_dedeuserid\"},\"retry_delay\":3,\"max_retries\":3}",
    "fetchInterval": 180,
    "priority": "medium",
    "isActive": true,
    "profileUrl": "https://space.bilibili.com/72844725"
  }'
```

### 方法 3: 使用配置脚本

```python
import sys
sys.path.insert(0, 'data-service')
import asyncio
import json
from db import db

async def update_bilibili_config():
    config = {
        "cookies": {
            "SESSDATA": "your_sessdata_value_here",
            "bili_jct": "your_bili_jct_value_here", 
            "DedeUserID": "your_dedeuserid_value_here"
        },
        "retry_delay": 3,
        "max_retries": 3
    }
    
    async with db.get_connection() as conn:
        await conn.execute(
            "UPDATE Influencer SET providerConfig = ? WHERE id = ?",
            (json.dumps(config), 'inf_bilibili_72844725')
        )
    
    print("✓ Cookie 配置已更新")

asyncio.run(update_bilibili_config())
```

## Cookie 安全注意事项

⚠️ **重要提醒：**

1. **不要分享 Cookie**: Cookie 等同于你的账号密码，不要泄露给他人
2. **不要提交到代码仓库**: 将 Cookie 配置添加到 `.gitignore`
3. **定期更新**: Cookie 通常 7-30 天过期，需要定期更新
4. **使用小号**: 建议使用专门的采集账号，不要使用主账号
5. **遵守 ToS**: 确保你的使用符合 Bilibili 的服务条款

## 验证配置

运行以下命令验证 Cookie 是否有效：

```bash
python3 test-bilibili-influencer.py
```

**期望结果：**
```
✓ 用户名: 二狗学长好
✓ 粉丝数: XXXXX
✓ 成功获取 N 条动态
```

## 故障排查

### Cookie 无效

**症状：** 仍然返回 -401 或 -799 错误

**解决方案：**
1. 确认 Cookie 值复制完整（没有多余空格或换行）
2. 重新登录 Bilibili 获取新的 Cookie
3. 检查 Cookie 是否过期（通常显示 Expires 字段）

### 请求仍被拦截

**症状：** 返回 412 错误

**解决方案：**
1. 增加 `retry_delay` 到 5-10 秒
2. 降低采集频率 (`fetchInterval` 设为 360 分钟/6 小时)
3. 考虑使用代理 IP

### Cookie 过期

**症状：** 之前能用，现在突然不能用了

**解决方案：**
1. 重新获取 Cookie（步骤见上文）
2. 更新配置
3. 重新测试

## 自动化更新脚本

创建 `update-bilibili-cookie.sh`:

```bash
#!/bin/bash
# 使用方法: ./update-bilibili-cookie.sh SESSDATA bili_jct DedeUserID

SESSDATA=$1
BILI_JCT=$2
DEDEUSERID=$3

if [ -z "$SESSDATA" ] || [ -z "$BILI_JCT" ] || [ -z "$DEDEUSERID" ]; then
    echo "用法: $0 <SESSDATA> <bili_jct> <DedeUserID>"
    exit 1
fi

python3 -c "
import sys
sys.path.insert(0, 'data-service')
import asyncio
import json
from db import db

async def update():
    config = {
        'cookies': {
            'SESSDATA': '$SESSDATA',
            'bili_jct': '$BILI_JCT',
            'DedeUserID': '$DEDEUSERID'
        },
        'retry_delay': 3,
        'max_retries': 3
    }
    
    async with db.get_connection() as conn:
        await conn.execute(
            'UPDATE Influencer SET providerConfig = ?, updatedAt = datetime(\"now\") WHERE platform = \"bilibili\"',
            (json.dumps(config),)
        )
    
    print('✓ 已更新所有 Bilibili 大V 的 Cookie 配置')

asyncio.run(update())
"

echo "✓ Cookie 配置完成，建议运行测试："
echo "  python3 test-bilibili-influencer.py"
```

## 常见问题

**Q: Cookie 多久需要更新一次？**  
A: 通常 7-30 天，具体取决于 Bilibili 的策略。建议每周检查一次。

**Q: 可以使用多个账号轮换吗？**  
A: 可以，在 `providerConfig` 中配置多组 Cookie，系统可以轮换使用。

**Q: 会不会导致账号被封？**  
A: 正常的低频率采集（3-6 小时/次）风险很低，但建议使用专门的采集账号。

**Q: 忘记保存 Cookie 怎么办？**  
A: 重新登录 Bilibili，按照步骤重新获取即可。

---

**文档版本:** 1.0  
**更新日期:** 2026-07-26  
**相关文件:** `bilibili-influencer-diagnosis.md`
