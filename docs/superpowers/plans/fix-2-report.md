# Fix 2 Report: Align Market Sentiment Display with Unified Algorithm

## Problem
Market Overview page displayed "0/5 个指数上涨" (0/5 indices rising) as the sentiment description, which was incorrect and inconsistent with the Dashboard page.

## Root Cause
Market Overview was calculating index breadth (upCount/total) to derive sentiment, but the system now uses a unified sentiment algorithm based on capital flow (institutional flow 40%, northbound flow 35%, retail divergence 25%).

## Changes Made

### File Modified
`src/app/(dashboard)/market/overview/page.tsx`

### Specific Changes
1. **Removed index breadth calculations** (lines 37-38):
   - Removed `upCount = indices.filter((i) => i.changePct > 0).length`
   - Removed `total = indices.length`
   - Removed the associated comment

2. **Updated sentiment card description** (line 158):
   - Changed from: `{upCount}/{total} 个指数上涨`
   - Changed to: `基于资金流向综合计算`

## Verification
- TypeCheck: Passed (no errors in modified file; pre-existing test file errors unrelated)
- Display now uses `format.sentimentDisplay` from Context, which is calculated by the unified sentiment algorithm
- Display is now consistent with Dashboard page

## Result
Market Overview page now shows the correct unified sentiment score and description ("基于资金流向综合计算") instead of the incorrect index breadth count.
