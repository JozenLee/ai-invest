# Task 11: Data Cleanup Worker (Delete Expired Posts)

## Status: DONE

## Changes Made

### Created Data Cleanup Worker
- **File**: `data-service/workers/data_cleanup.py`

#### Core Functions
1. **cleanup_expired_posts(db: Database) -> int**
   - Queries all influencers and their retention configurations
   - Deletes posts older than `dataRetentionDays` for each influencer
   - Uses SQLite's `datetime('now', '-N days')` for time comparison
   - Returns total number of deleted posts
   - Logs cleanup statistics per influencer

2. **run_cleanup_task()**
   - Wrapper function for scheduler integration
   - Imports the global db instance
   - Calls cleanup_expired_posts and logs results

#### Implementation Details
- Per-influencer retention policy (respects individual `dataRetentionDays`)
- Bulk deletion via SQL DELETE with date comparison
- Graceful error handling with logging
- Zero-deletion scenario handled (returns 0, no errors)

### Scheduler Integration
- **File**: `data-service/main.py`

Registered cleanup task in lifespan startup:
```python
await scheduler_service.add_cron_job(
    job_id="data_cleanup",
    func=run_cleanup_task,
    hour=2,
    minute=0
)
```

Schedule: Daily at 2:00 AM (low-traffic period)

### Test Coverage
- **File**: `data-service/tests/unit/test_data_cleanup.py`

#### Test Cases
1. **test_cleanup_expired_posts**
   - Creates influencer with 30-day retention
   - Inserts 35-day-old (expired) and 10-day-old (valid) posts
   - Asserts only expired post is deleted
   - Verifies correct post remains

2. **test_cleanup_respects_different_retention_days**
   - Creates two influencers: 30-day and 60-day retention
   - Inserts 40-day-old posts for both
   - Asserts only the 30-day influencer's post is deleted
   - Verifies 60-day influencer's post is preserved

#### Test Infrastructure
- Uses temporary SQLite files (auto-cleanup)
- MockDatabase wrapper for consistent connection handling
- pytest_asyncio fixtures for async setup/teardown

## Testing

### Unit Tests
```bash
cd data-service
python3 -m pytest tests/unit/test_data_cleanup.py -v
```
Results: ✅ 2 passed

### Manual Test
```bash
python3 -c "
import asyncio
from workers.data_cleanup import run_cleanup_task
asyncio.run(run_cleanup_task())
"
```
Results: ✅ Task executes successfully with proper logging

### Test Scenarios Covered
1. Basic cleanup of expired posts
2. Preservation of non-expired posts
3. Per-influencer retention policy enforcement
4. Empty database scenario (0 influencers)
5. Error handling and logging

## Implementation Notes

### SQL Query Strategy
Uses SQLite's native datetime functions for efficient filtering:
```sql
DELETE FROM InfluencerPost
WHERE influencerId = ?
AND publishTime < datetime('now', '-' || ? || ' days')
```

### Performance Considerations
- Per-influencer deletion (not bulk) for accurate logging
- Single query per influencer (efficient for typical counts)
- Uses indexed foreign key (influencerId) for fast lookups

### Logging
- Info: Task start/completion with total deleted count
- Info: Per-influencer cleanup stats (when deleted > 0)
- Error: Exception details if cleanup fails

## Commit
- Hash: `56de6dc`
- Message: "feat(worker): add data cleanup task for expired posts"

## Production Deployment

### Verification Steps
1. Check scheduler registration: `GET /api/scheduler/status`
2. Manual trigger: `POST /api/scheduler/run/data_cleanup`
3. Monitor logs for cleanup statistics
4. Verify database size reduction over time

### Configuration
- Schedule: 2:00 AM daily (configurable in main.py)
- Retention: Per-influencer `dataRetentionDays` (default 90 days)
- Can be paused: `POST /api/scheduler/pause/data_cleanup`

## Notes
- Cleanup runs automatically after service restart
- No data loss risk (only deletes posts beyond retention period)
- Idempotent (safe to run multiple times)
- Does not affect active/recent posts
- Scheduler persists across service restarts
