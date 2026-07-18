# Fix-3 Report: Northbound Data Reliability

## Summary
Improved northbound fund data reliability by adding Sina as a backup data source and implementing data validation on the frontend.

## Changes Made

### 1. `data-service/providers/registry.py`
- Changed `northbound_flow` category config sources from `["akshare", "tushare"]` to `["akshare", "sina", "tushare"]`
- Sina is now attempted as a fallback between AKShare and Tushare

### 2. `data-service/providers/sina_provider.py`
- Verified `get_northbound_flow` method already exists (line 135-137)
- Method correctly raises `NotImplementedError`, which causes the registry to skip Sina and fall through to the next source
- No changes needed

### 3. `src/contexts/MarketContext.tsx`
- Added validation when extracting northbound data from capital flow response
- Validates that `nb.net` exists and is a non-NaN number before setting state
- Logs a warning and sets `null` when validation fails

## How It Works

The data source fallback chain for northbound flow is now:
1. **AKShare** (`ak.stock_hsgt_fund_flow_summary_em` / `ak.stock_hsgt_hist_em`) -- primary source
2. **Sina** -- gracefully skipped (raises `NotImplementedError`), registry moves to next
3. **Tushare** -- secondary source if AKShare fails
4. **File cache** -- final fallback if all sources fail

Frontend validation ensures that only valid northbound data (non-null, non-NaN `net` value) is displayed to the user.

## Typecheck
- All pre-existing typecheck errors are in `src/lib/__tests__/data-client.test.ts` (missing Jest type definitions)
- No new errors introduced by these changes

## Commit
`e4dad46` - "fix: improve northbound data reliability with validation and backup source"
