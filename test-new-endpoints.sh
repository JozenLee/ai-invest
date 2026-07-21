#!/bin/bash

echo "Testing newly created API endpoints..."
echo "======================================="

# Start services if not running
echo ""
echo "1. Checking if Python service is running..."
if ! curl -s http://localhost:8000/health > /dev/null 2>&1; then
    echo "   Starting Python service..."
    cd /Users/jozen.lee/ai-softwares/ai-invest/data-service
    nohup python3 main.py > /tmp/python-test.log 2>&1 &
    sleep 10
fi

echo "   Python service is running ✓"

echo ""
echo "2. Testing GET /api/domains"
curl -s http://localhost:3000/api/domains | jq '{success, data: (.data | length)}'

echo ""
echo "3. Testing Python scheduler health endpoint"
curl -s http://localhost:8000/schedulers/health | jq '{success, is_running: .data.is_running, total_jobs: .data.total_jobs}'

echo ""
echo "4. Testing Next.js scheduler health proxy"
curl -s http://localhost:3000/api/datasources/schedulers/health | jq '{success, is_running: .data.data.is_running}'

echo ""
echo "5. Testing PATCH /api/datasources/[id]/schedule with domainFilter"
# Get a datasource ID first
DATASOURCE_ID=$(curl -s http://localhost:3000/api/datasources | jq -r '.data[0].id')
echo "   Using datasource ID: $DATASOURCE_ID"

# Test with scheduleConfig including domainFilter
curl -s -X PATCH http://localhost:3000/api/datasources/$DATASOURCE_ID/schedule \
  -H "Content-Type: application/json" \
  -d '{
    "updateFrequency": 60,
    "scheduleConfig": {
      "intervalMinutes": 60,
      "domainFilter": {
        "domainIds": [],
        "mode": "include"
      }
    }
  }' | jq '{success, message}'

echo ""
echo "======================================="
echo "All endpoint tests completed!"
