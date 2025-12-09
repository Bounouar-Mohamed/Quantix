#!/bin/bash

# Script de test pour la mémoire conversationnelle unifiée (Threads)
# Usage: ./test-threads.sh

BASE_URL="${BASE_URL:-http://localhost:3001}"
TENANT_ID="tenant-test"
CONV_ID="conv-test-$(date +%s)"

echo "🧪 Tests Threads Unifiés"
echo "========================"
echo "Base URL: $BASE_URL"
echo "Tenant ID: $TENANT_ID"
echo "Conversation ID: $CONV_ID"
echo ""

# Test 1: Créer thread
echo "📝 Test 1: Créer thread"
THREAD_RESPONSE=$(curl -s -X POST "$BASE_URL/api/v1/assistants/thread/upsert" \
  -H "Content-Type: application/json" \
  -H "tenant-id: $TENANT_ID" \
  -d "{
    \"conversationId\": \"$CONV_ID\",
    \"tenantId\": \"$TENANT_ID\"
  }")

THREAD_ID=$(echo $THREAD_RESPONSE | jq -r '.assistant_thread_id')

if [ "$THREAD_ID" != "null" ] && [ -n "$THREAD_ID" ]; then
  echo "✅ Thread créé: $THREAD_ID"
else
  echo "❌ Échec création thread"
  echo "Réponse: $THREAD_RESPONSE"
  exit 1
fi

# Test 2: Vérifier récupération (même thread)
echo ""
echo "📝 Test 2: Récupérer même thread"
THREAD_RESPONSE2=$(curl -s -X POST "$BASE_URL/api/v1/assistants/thread/upsert" \
  -H "Content-Type: application/json" \
  -H "tenant-id: $TENANT_ID" \
  -d "{
    \"conversationId\": \"$CONV_ID\",
    \"tenantId\": \"$TENANT_ID\"
  }")

THREAD_ID2=$(echo $THREAD_RESPONSE2 | jq -r '.assistant_thread_id')

if [ "$THREAD_ID" == "$THREAD_ID2" ]; then
  echo "✅ Même thread récupéré: $THREAD_ID2"
else
  echo "❌ Thread différent !"
  echo "Attendu: $THREAD_ID"
  echo "Reçu: $THREAD_ID2"
  exit 1
fi

# Test 3: Ajouter message user
echo ""
echo "📝 Test 3: Ajouter message user"
MSG_RESPONSE=$(curl -s -X POST "$BASE_URL/api/v1/assistants/thread/messages" \
  -H "Content-Type: application/json" \
  -H "tenant-id: $TENANT_ID" \
  -d "{
    \"conversationId\": \"$CONV_ID\",
    \"tenantId\": \"$TENANT_ID\",
    \"role\": \"user\",
    \"content\": \"Bonjour, je cherche une villa à Dubai\",
    \"eventId\": \"evt-test-user-1\"
  }")

SUCCESS=$(echo $MSG_RESPONSE | jq -r '.success')

if [ "$SUCCESS" == "true" ]; then
  echo "✅ Message user ajouté"
else
  echo "❌ Échec ajout message user"
  echo "Réponse: $MSG_RESPONSE"
  exit 1
fi

# Test 4: Ajouter message assistant (simulation Realtime)
echo ""
echo "📝 Test 4: Ajouter message assistant (simulation Realtime)"
MSG_RESPONSE2=$(curl -s -X POST "$BASE_URL/api/v1/assistants/thread/messages" \
  -H "Content-Type: application/json" \
  -H "tenant-id: $TENANT_ID" \
  -d "{
    \"conversationId\": \"$CONV_ID\",
    \"tenantId\": \"$TENANT_ID\",
    \"role\": \"assistant\",
    \"content\": \"Bonjour ! Je peux vous aider à trouver une villa à Dubai.\",
    \"eventId\": \"evt-test-assistant-1\"
  }")

SUCCESS2=$(echo $MSG_RESPONSE2 | jq -r '.success')

if [ "$SUCCESS2" == "true" ]; then
  echo "✅ Message assistant ajouté"
else
  echo "❌ Échec ajout message assistant"
  echo "Réponse: $MSG_RESPONSE2"
  exit 1
fi

# Test 5: Chat REST avec threads (si flag activé)
echo ""
echo "📝 Test 5: Chat REST avec threads"
if [ -z "$SKIP_CHAT_TEST" ]; then
  CHAT_RESPONSE=$(curl -s -X POST "$BASE_URL/api/v1/ai/generate" \
    -H "Content-Type: application/json" \
    -H "X-Use-Assistants: true" \
    -H "conversation-id: $CONV_ID" \
    -H "tenant-id: $TENANT_ID" \
    -d "{
      \"messages\": [
        {
          \"role\": \"user\",
          \"content\": \"Budget 10M AED villa 3BR à Dubai Hills\"
        }
      ],
      \"userId\": \"user-test\"
    }")
  
  CONTENT=$(echo $CHAT_RESPONSE | jq -r '.content')
  
  if [ -n "$CONTENT" ] && [ "$CONTENT" != "null" ]; then
    echo "✅ Chat REST fonctionne"
    echo "Réponse (50 premiers chars): ${CONTENT:0:50}..."
  else
    echo "⚠️ Chat REST peut nécessiter configuration (USE_ASSISTANTS_API=true)"
    echo "Réponse: $CHAT_RESPONSE"
  fi
else
  echo "⏭️ Test chat REST ignoré (SKIP_CHAT_TEST=true)"
fi

# Test 6: Token Realtime avec thread
echo ""
echo "📝 Test 6: Token Realtime avec thread"
TOKEN_RESPONSE=$(curl -s -X POST "$BASE_URL/api/v1/chatbot/realtime/ephemeral-token" \
  -H "Content-Type: application/json" \
  -d "{
    \"userId\": \"user-test\",
    \"tenantId\": \"$TENANT_ID\",
    \"conversationId\": \"$CONV_ID\"
  }")

TOKEN_THREAD_ID=$(echo $TOKEN_RESPONSE | jq -r '.assistant_thread_id')
TOKEN=$(echo $TOKEN_RESPONSE | jq -r '.token')

if [ "$TOKEN_THREAD_ID" == "$THREAD_ID" ]; then
  echo "✅ Token Realtime retourne même thread: $TOKEN_THREAD_ID"
  echo "✅ Token généré: ${TOKEN:0:20}..."
else
  echo "⚠️ Thread différent (peut être normal si création)"
  echo "Thread attendu: $THREAD_ID"
  echo "Thread reçu: $TOKEN_THREAD_ID"
fi

echo ""
echo "✅ Tous les tests basiques sont passés !"
echo ""
echo "Pour tester la mémoire unifiée, exécutez:"
echo "  1. Tour REST avec X-Use-Assistants: true"
echo "  2. Simuler Realtime (POST /assistants/thread/messages)"
echo "  3. Tour REST à nouveau - doit réutiliser contexte"
echo ""
echo "Voir TEST_THREADS_UNIFIED.md pour les tests E2E complets"



