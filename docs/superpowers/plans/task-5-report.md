# Task 5 Report: Dashboard Page uses MarketContext

**Status:** DONE

## What was implemented

Updated `src/app/(dashboard)/dashboard/page.tsx` to use `useMarketContext` from `@/contexts/MarketContext` instead of `useMarketData` from `@/hooks/useMarketData`.

### Changes made:

1. **Import updated:** Changed from `import { useMarketData } from '@/hooks/useMarketData'` to `import { useMarketContext } from '@/contexts/MarketContext'`

2. **Hook call updated:** Changed `useMarketData()` to `useMarketContext()`, adding `format` to the destructured context values.

3. **Removed `getMarketStatusBadge()` function:** This local function (15 lines) that manually mapped market status to icons/labels/variants was replaced by `format.statusBadge` from the Context.

4. **Replaced inline source display logic:** The manual if/else chain mapping source strings to display text was replaced with `format.sourceDisplay.icon` and `format.sourceDisplay.text`.

5. **Replaced inline time display logic:** `lastUpdate.toLocaleString('zh-CN')` was replaced with `format.timeDisplay`.

6. **Replaced inline sentiment display logic:** The manual sentiment score/label/color computation was replaced with `format.sentimentDisplay.score`, `format.sentimentDisplay.label`, and `format.sentimentDisplay.color`.

### Net result: 61 lines added, 29 lines removed

The page now consumes all display formatting from the Context, eliminating duplicate logic.

## Test results

Typecheck (`npm run typecheck`) completed. All errors are pre-existing in `src/lib/__tests__/data-client.test.ts` (missing `@types/jest` definitions). No errors from the modified file or MarketContext.

## Concerns

None. The changes are clean and align with the plan specification.
