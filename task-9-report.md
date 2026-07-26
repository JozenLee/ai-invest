# Task 9: Update Detail Page to Display Schedule Fields

## Status: DONE

## Changes Made

### Updated Influencer Detail Page
- **File**: `src/app/(dashboard)/events/influencers/[id]/page.tsx`

#### Interface Updates
- Added schedule configuration fields to `Influencer` interface:
  - `scheduleType: 'polling' | 'daily'`
  - `fetchInterval: number`
  - `dailyFetchTimes: string[] | null`
  - `dataRetentionDays: number`

#### UI Enhancements
- Added "监控配置" (Monitoring Configuration) card after "基本信息" card
- Displays schedule type (轮询模式/定时模式)
- Conditionally shows:
  - Polling interval in minutes (for polling mode)
  - Daily fetch times as badges (for daily mode)
- Shows data retention period in days

## Implementation Details

### Schedule Type Display
- Polling mode: Shows fetch interval (e.g., "30 分钟")
- Daily mode: Shows time badges (e.g., "09:00", "15:00", "21:00")

### Layout
- Uses 2-column grid for configuration items
- Consistent with existing "基本信息" card styling
- Uses Badge components for daily fetch times

## Testing

### Manual Testing Required
1. Start dev server: `npm run dev`
2. Navigate to influencer detail page
3. Verify schedule configuration card displays:
   - Schedule type label
   - Fetch interval (polling) or times (daily)
   - Data retention days

## Commit
- Hash: `6d2220a`
- Message: "feat(ui): display schedule config in influencer detail page"

## Notes
- Frontend-only change, no backend dependencies
- Depends on API returning new fields (from previous tasks)
- Gracefully handles null dailyFetchTimes for polling mode
