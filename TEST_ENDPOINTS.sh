#!/bin/bash

# Script de test pour les nouveaux endpoints Realtime

BASE_URL="http://localhost:3001/api/v1/chatbot"

echo "🧪 Testing Realtime endpoints..."
echo ""

echo "1️⃣ Testing HEARTBEAT..."
curl -s "$BASE_URL/realtime/heartbeat" | jq '.' || echo "❌ Heartbeat failed"
echo ""
sleep 1

echo "2️⃣ Testing CONFIG..."
curl -s -H "user-id: test-123" -H "tenant-id: test-456" "$BASE_URL/realtime/config" | jq '.' || echo "❌ Config failed"
echo ""
sleep 1

echo "3️⃣ Testing EPHEMERAL TOKEN..."
curl -s -X POST "$BASE_URL/realtime/ephemeral-token" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user-123",
    "tenantId": "test-tenant-456",
    "locale": "fr"
  }' | jq '.' || echo "❌ Token failed"
echo ""
sleep 1

echo "✅ Tests completed"

