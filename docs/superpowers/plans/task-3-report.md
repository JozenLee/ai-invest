# Task 3 Report: Refactor useMarketData Hook

**Status:** DONE

## What was implemented

Replaced `src/hooks/useMarketData.ts` with a simple re-export of `useMarketContext` from `src/contexts/MarketContext.tsx`. The file went from 168 lines of data fetching logic to a single re-export:

```typescript
'use client'

export { useMarketContext as useMarketData } from '@/contexts/MarketContext'
```

This ensures that any consumer importing `useMarketData` will now get data from the centralized `MarketProvider`, achieving data consistency across dashboard, market overview, and capital flow pages.

## Test results

`npm run typecheck` completed with no errors related to this change. The only errors are pre-existing issues in `src/lib/__tests__/data-client.test.ts` (missing Jest type definitions), which are unrelated to this task.

## Commit

```
0735f0c refactor: redirect useMarketData to MarketContext
```

## Concerns

None. The change is a clean, minimal refactor that redirects the old hook to the context without breaking any existing consumers.
