#!/bin/bash
# Test script for cache refresh functionality

set -e

echo "=== Testing Cache Refresh Implementation ==="
echo ""

echo "1. Testing Next.js API cache behavior..."
echo "   First call (should fetch fresh data):"
TIMESTAMP1=$(curl -s http://localhost:3000/api/market/overview | jq -r '.data.timestamp')
echo "   Timestamp: $TIMESTAMP1"

echo ""
echo "   Second call (should return cached data):"
sleep 1
TIMESTAMP2=$(curl -s http://localhost:3000/api/market/overview | jq -r '.data.timestamp')
echo "   Timestamp: $TIMESTAMP2"

if [ "$TIMESTAMP1" == "$TIMESTAMP2" ]; then
    echo "   ✓ Cache is working (timestamps match)"
else
    echo "   ✗ Cache not working (timestamps differ)"
fi

echo ""
echo "2. Testing force refresh with ?refresh=true parameter..."
sleep 1
TIMESTAMP3=$(curl -s 'http://localhost:3000/api/market/overview?refresh=true' | jq -r '.data.timestamp')
echo "   Timestamp: $TIMESTAMP3"

if [ "$TIMESTAMP2" != "$TIMESTAMP3" ]; then
    echo "   ✓ Force refresh works (new timestamp)"
else
    echo "   ✗ Force refresh failed (same timestamp)"
fi

echo ""
echo "3. Testing cache clear API..."
curl -s -X POST http://localhost:3000/api/cache/clear | jq '.'

echo ""
echo "4. Testing after cache clear (should fetch fresh)..."
sleep 1
TIMESTAMP4=$(curl -s http://localhost:3000/api/market/overview | jq -r '.data.timestamp')
echo "   Timestamp: $TIMESTAMP4"

if [ "$TIMESTAMP3" != "$TIMESTAMP4" ]; then
    echo "   ✓ Cache clear works (new timestamp)"
else
    echo "   ✗ Cache clear may not have worked (same timestamp)"
fi

echo ""
echo "5. Testing Python service cache API..."
curl -s http://localhost:8000/api/cache/stats | jq '.data | {backend, total_keys, hit_rate}'

echo ""
echo "6. Checking scheduler status..."
curl -s http://localhost:8000/api/scheduler/status | jq '.'

echo ""
echo "=== Test Complete ==="
echo ""
echo "Summary:"
echo "- Manual refresh button: Use ?refresh=true parameter to bypass cache"
echo "- Daily auto-refresh: Python scheduler job runs at 15:30 daily"
echo "- Both caches (Python + Next.js) are cleared and refreshed"
