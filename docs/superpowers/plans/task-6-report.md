# Task 6 Report: Market Overview Page uses MarketContext

**Status:** DONE

## What was implemented

Rewrote `src/app/(dashboard)/market/overview/page.tsx` to consume `useMarketContext` instead of independent state management.

**Removed:**
- 6 independent `useState` hooks (indices, capitalFlow, northbound, isLoading, error, source, lastUpdate)
- `useCallback`/`useEffect` for data fetching with 3 fetch calls (overview, capital-flow, macro/capital-flow)
- Local `NorthboundData` and `CapitalFlowData` type definitions
- Inline source display logic (hardcoded string mapping)

**Added:**
- Single `useMarketContext()` call destructuring: indices, capitalFlow, northbound, sentiment, marketMeta, isLoading, error, lastUpdate, refetch, format
- `format.sourceDisplay` for data source badge (icon + text)
- `format.timeDisplay` for formatted update timestamp
- `format.sentimentDisplay` for sentiment score/label/color
- `Clock` icon import for time display
- Northbound stale data indicator (shows "历史数据" when `northbound.stale` is true)
- Loading skeleton state when `isLoading` is true

**Net change:** -127 lines, +39 lines (file went from 329 to 162 lines -- a 51% reduction).

## Test results

`npm run typecheck` produced only pre-existing errors in `src/lib/__tests__/data-client.test.ts` (missing `@types/jest` -- unrelated to this change). No errors from the market overview page or any related files.

## Commit

```
459969b refactor: use MarketContext in Market Overview page
```

## Concerns

None. The refactoring is clean -- the page now shares data with Dashboard and Capital Flow pages through the unified MarketContext, eliminating duplicate fetch calls and ensuring data consistency across all three pages.
