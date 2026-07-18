# Fix 1 Report: Unify Northbound Data Display

## Problem
Northbound fund data displayed inconsistent values across three pages:
- **Dashboard**: showed "0" when northbound was null (due to `|| 0` fallback)
- **Market Overview**: showed "0" when northbound was null (due to `northbound.net` being 0)
- **Capital Flow**: already correctly showed "暂无" when stale

## Root Cause
Each page implemented its own northbound display logic without a shared convention:
- Dashboard used `capitalFlow.northbound?.net || 0`, which coerces null to 0
- Market Overview used `northbound.net` directly, which is 0 when null
- Neither page checked for the `net === 0` case as "no data"

## Changes Made

### 1. Dashboard (`src/app/(dashboard)/dashboard/page.tsx`)
- Replaced `capitalFlow.northbound?.net || 0` pattern with a proper null check
- Added `hasNorthboundData = nb && nb.net !== 0` guard
- Shows "暂无" (styled as muted-foreground) when no data is available
- Shows formatted value with sign, Shenzhen/Shanghai breakdown when data exists

### 2. Market Overview (`src/app/(dashboard)/market/overview/page.tsx`)
- Replaced `northbound ? (...) : "暂无北向资金数据"` with unified logic
- Added `hasNorthboundData = northbound && northbound.net !== 0` guard
- Shows "暂无" when no data is available (consistent with Dashboard)
- Shows formatted value with date and stale indicator when data exists

### 3. Capital Flow (no changes needed)
- Already correctly uses `northboundStale ? '暂无' : ...` pattern

## Unified Display Convention
All three pages now follow the same logic:
```
hasNorthboundData = northbound && northbound.net !== 0
```
- `hasNorthboundData` is true: show formatted value (e.g., "+12.34亿")
- `hasNorthboundData` is false: show "暂无" in muted-foreground style

## Verification
- `npm run typecheck`: no errors in modified files (pre-existing test file errors remain)
- Committed as: `fix: unify northbound data display across pages` (62ca29a)

## Files Modified
- `/Users/jozen.lee/ai-softwares/ai-invest/src/app/(dashboard)/dashboard/page.tsx`
- `/Users/jozen.lee/ai-softwares/ai-invest/src/app/(dashboard)/market/overview/page.tsx`
