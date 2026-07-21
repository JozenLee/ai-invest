# API Endpoints Implementation Summary

## Completed Tasks

### 1. GET /api/domains - 领域列表 ✓

**Location:** `/Users/jozen.lee/ai-softwares/ai-invest/src/app/api/domains/route.ts`

**Functionality:**
- Queries all active domains (`isActive=true`) from the database
- Returns domain ID, name, code, and description
- Orders results alphabetically by name

**Response Format:**
```json
{
  "success": true,
  "data": [
    {
      "id": "domain_id",
      "name": "AI算力",
      "code": "ai_computing",
      "description": "..."
    }
  ]
}
```

---

### 2. PATCH /api/datasources/[id]/schedule - 更新调度配置（增强版） ✓

**Location:** `/Users/jozen.lee/ai-softwares/ai-invest/src/app/api/datasources/[id]/schedule/route.ts`

**Enhancements:**
- **Enhanced scheduleConfig support:** Now accepts both JSON objects and strings
- **DomainFilter validation:** Validates `domainFilter.domainIds` against the Domain table
- **Flexible format:** Handles both `{ "intervalMinutes": 60 }` and stringified JSON
- **Domain existence check:** Ensures all domainIds in the filter actually exist in the database
- **DataSource.updateFrequency sync:** Updates both SchedulerJob and DataSource fields

**Request Body:**
```json
{
  "updateFrequency": 60,
  "scheduleType": "interval",
  "scheduleConfig": {
    "intervalMinutes": 60,
    "domainFilter": {
      "domainIds": ["domain_id_1", "domain_id_2"],
      "mode": "include"
    }
  }
}
```

**Validation:**
- Checks if all `domainIds` exist in the Domain table
- Returns 400 error with invalid domain IDs if validation fails
- Validates scheduleConfig is valid JSON if provided as string

---

### 3. GET /api/datasources/schedulers/health - 调度器健康检查 ✓

**Location:** `/Users/jozen.lee/ai-softwares/ai-invest/src/app/api/datasources/schedulers/health/route.ts`

**Functionality:**
- Proxies health check request to Python data service
- Handles connection errors gracefully
- 5-second timeout for Python service calls
- Distinguishes between timeout, connection refused, and other errors

**Python Backend:** `/Users/jozen.lee/ai-softwares/ai-invest/data-service/routers/schedulers.py`

**Endpoint:** `GET /schedulers/health`

**Response Format:**
```json
{
  "success": true,
  "data": {
    "is_running": true,
    "total_jobs": 10,
    "active_jobs": 8,
    "paused_jobs": 2,
    "jobs": [
      {
        "id": "scheduler_job_id",
        "func": "fetch_job_wrapper",
        "status": "active",
        "next_run": "2026-07-22T03:15:42+08:00",
        "interval_minutes": 60,
        "pending": false
      }
    ],
    "timestamp": "2026-07-22T02:15:42.123456"
  }
}
```

**Error Handling:**
- `503` if Python service is unreachable
- Connection timeout: "Python服务请求超时"
- Connection refused: "Python服务未启动或无法连接"

---

## Python Service Changes

### New Router: `routers/schedulers.py`

**Endpoint:** `GET /schedulers/health`

**Functionality:**
- Retrieves scheduler running status from `scheduler_service`
- Gets all jobs with their details
- Formats job information including:
  - Job ID, function name, status
  - Next run time, pending status
  - Interval (for interval jobs) or cron expression (for cron jobs)
- Returns aggregated statistics (total, active, paused jobs)

**Registration:** Updated `main.py` to include the schedulers router:
```python
app.include_router(schedulers.router, prefix="/schedulers", tags=["schedulers"])
```

---

## Files Created/Modified

### Created:
1. `/src/app/api/domains/route.ts` - New domains API endpoint
2. `/src/app/api/datasources/schedulers/health/route.ts` - New health check proxy
3. `/data-service/routers/schedulers.py` - New Python health check router
4. `/test-new-endpoints.sh` - Test script for all endpoints

### Modified:
1. `/src/app/api/datasources/[id]/schedule/route.ts` - Enhanced with domainFilter validation
2. `/data-service/main.py` - Added schedulers router registration

---

## Testing

### Manual Testing

Run the test script:
```bash
bash /Users/jozen.lee/ai-softwares/ai-invest/test-new-endpoints.sh
```

### Individual Endpoint Tests

**1. Test Domains API:**
```bash
curl http://localhost:3000/api/domains | jq .
```

**2. Test Scheduler Health (Python):**
```bash
curl http://localhost:8000/schedulers/health | jq .
```

**3. Test Scheduler Health (Next.js Proxy):**
```bash
curl http://localhost:3000/api/datasources/schedulers/health | jq .
```

**4. Test Schedule Update with Domain Filter:**
```bash
curl -X PATCH http://localhost:3000/api/datasources/{id}/schedule \
  -H "Content-Type: application/json" \
  -d '{
    "updateFrequency": 60,
    "scheduleConfig": {
      "intervalMinutes": 60,
      "domainFilter": {
        "domainIds": ["domain_id_1"],
        "mode": "include"
      }
    }
  }'
```

---

## TypeScript Validation

All TypeScript files passed type checking:
```bash
npm run typecheck
# ✓ No errors
```

---

## Key Features Implemented

1. **Domain Filtering Support:** Schedule configurations can now include domain filters
2. **Robust Validation:** Domain IDs are validated against the database before saving
3. **Health Monitoring:** Real-time scheduler status and job information
4. **Error Handling:** Comprehensive error messages for connection issues
5. **Flexible Input:** Supports both object and string formats for scheduleConfig
6. **Consistent API:** All endpoints follow the `{success, data, error}` pattern

---

## Next Steps (Optional Enhancements)

1. Add authentication/authorization to scheduler health endpoint
2. Implement scheduler job pause/resume via Next.js API
3. Add WebSocket support for real-time scheduler updates
4. Create UI components to display scheduler health status
5. Add metrics collection for scheduler performance monitoring
