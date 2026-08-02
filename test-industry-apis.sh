#!/bin/bash
# Task 12: Test Industry API Routes
# This script tests the 4 new Next.js API routes

BASE_URL="http://localhost:3000"
echo "Testing Industry API Routes"
echo "============================"
echo ""

# Test 1: GET /api/graph/industries - List all industries
echo "1. Testing GET /api/graph/industries (List all industries)"
curl -s "$BASE_URL/api/graph/industries" | jq '.' || echo "Failed or service not running"
echo ""
echo ""

# Test 2: GET /api/graph/industries/[id] - Get single industry
echo "2. Testing GET /api/graph/industries/ai-compute (Get single industry)"
curl -s "$BASE_URL/api/graph/industries/ai-compute" | jq '.' || echo "Failed or service not running"
echo ""
echo ""

# Test 3: GET /api/graph/industries/[id]/graph - Get industry graph
echo "3. Testing GET /api/graph/industries/ai-compute/graph (Get industry graph)"
curl -s "$BASE_URL/api/graph/industries/ai-compute/graph" | jq '.' || echo "Failed or service not running"
echo ""
echo ""

# Test 4: GET /api/graph/industries/[id]/swimlane - Get industry swimlane
echo "4. Testing GET /api/graph/industries/ai-compute/swimlane (Get industry swimlane)"
curl -s "$BASE_URL/api/graph/industries/ai-compute/swimlane" | jq '.' || echo "Failed or service not running"
echo ""
echo ""

# Test 5: 404 Error handling
echo "5. Testing 404 error handling"
curl -s "$BASE_URL/api/graph/industries/non-existent-id" | jq '.' || echo "Failed or service not running"
echo ""

echo "============================"
echo "Test completed!"
