#!/bin/bash
# Quick test script to verify the tag linking fix

set -e

echo "=================================="
echo "NewsArticleTag Linking Test Suite"
echo "=================================="
echo ""

# Run the automated test
echo "1. Running automated test..."
npx tsx scripts/test-tag-linking.ts
echo ""

# Check database for existing articles with tags
echo "2. Verifying existing articles..."
npx tsx scripts/verify-tag-linking.ts
echo ""

echo "=================================="
echo "✅ All tests completed!"
echo "=================================="
echo ""
echo "Summary:"
echo "  - Tag linking functionality is working"
echo "  - New articles will automatically get tag links"
echo "  - Run 'npm run migrate:tags' to fix existing articles"
echo ""
