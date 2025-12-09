# Tests - Mémoire conversationnelle unifiée (Threads)

## Architecture actuelle

```
┌─────────────────────────────────────────────────────────┐
│ FLUX REALTIME                                           │
│ Front → POST /chatbot/realtime/ephemeral-token         │
│      → WebRTC direct OpenAI (ek_)                       │
│      → POST /assistants/thread/messages (journalisation)│
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ FLUX REST CHAT                                          │
│ Front → POST /ai/generate (avec X-Use-Assistants: true)│
│      → AssistantsService (thread + run)                │
│      → Réponse dans thread automatiquement              │
└─────────────────────────────────────────────────────────┘

NOTE: RealtimeWebSocketServer (realtime-ws.server.ts) n'est PLUS utilisé
```

## Prérequis

1. **Base de données** : Migration exécutée
   ```bash
   npx prisma migrate deploy  # ou prisma db push en dev
   ```

2. **Variables d'environnement** :
   ```env
   OPENAI_API_KEY=sk-...
   DATABASE_URL=postgresql://...
   USE_ASSISTANTS_API=true              # Pour activer threads en REST
   JOURNALIZE_CHAT_COMPLETIONS=true     # Journaliser même en Chat Completions
   OPENAI_ASSISTANT_ID=asst_...         # Optionnel (créé auto si absent)
   ```

3. **Frontend** : Les 2 hooks de journalisation Realtime doivent être implémentés
   - Voir `FRONT_REALTIME_INTEGRATION.md`

## Tests backend (sans front)

### Test 1 : Créer/récupérer un thread

```bash
# Créer un thread
curl -X POST http://localhost:3001/api/v1/assistants/thread/upsert \
  -H "Content-Type: application/json" \
  -H "tenant-id: tenant-test" \
  -d '{
    "conversationId": "conv-test-123",
    "tenantId": "tenant-test"
  }'

# Réponse attendue :
# {
#   "assistant_thread_id": "thread_abc123..."
# }

# Récupérer le même thread (doit retourner le même ID)
curl -X POST http://localhost:3001/api/v1/assistants/thread/upsert \
  -H "Content-Type: application/json" \
  -H "tenant-id: tenant-test" \
  -d '{
    "conversationId": "conv-test-123",
    "tenantId": "tenant-test"
  }'

# Vérifier : même assistant_thread_id retourné
```

### Test 2 : Ajouter message user (endpoint front-friendly)

```bash
curl -X POST http://localhost:3001/api/v1/assistants/thread/messages \
  -H "Content-Type: application/json" \
  -H "tenant-id: tenant-test" \
  -d '{
    "conversationId": "conv-test-123",
    "tenantId": "tenant-test",
    "role": "user",
    "content": "Bonjour, je cherche une villa à Dubai",
    "eventId": "evt-user-1"
  }'

# Réponse attendue :
# {
#   "success": true,
#   "thread_id": "thread_abc123..."
# }
```

### Test 3 : Ajouter message assistant (simulation front Realtime)

```bash
curl -X POST http://localhost:3001/api/v1/assistants/thread/messages \
  -H "Content-Type: application/json" \
  -H "tenant-id: tenant-test" \
  -d '{
    "conversationId": "conv-test-123",
    "tenantId": "tenant-test",
    "role": "assistant",
    "content": "Bonjour ! Je peux vous aider à trouver une villa à Dubai.",
    "eventId": "evt-assistant-1"
  }'
```

### Test 4 : Chat REST avec threads (flag activé)

```bash
# Tour 1 : Message utilisateur
curl -X POST http://localhost:3001/api/v1/ai/generate \
  -H "Content-Type: application/json" \
  -H "X-Use-Assistants: true" \
  -H "conversation-id: conv-test-123" \
  -H "tenant-id: tenant-test" \
  -d '{
    "messages": [
      {
        "role": "user",
        "content": "Budget 10M AED villa 3BR à Dubai Hills"
      }
    ],
    "userId": "user-test"
  }'

# Réponse attendue : contenu de la réponse + usage tokens
# Vérifier logs : "Thread créé/récupéré", "Message ajouté", "Run créé"
```

### Test 5 : Vérifier mémoire (deuxième tour REST)

```bash
# Tour 2 : Le modèle doit se souvenir du contexte
curl -X POST http://localhost:3001/api/v1/ai/generate \
  -H "Content-Type: application/json" \
  -H "X-Use-Assistants: true" \
  -H "conversation-id: conv-test-123" \
  -H "tenant-id: tenant-test" \
  -d '{
    "messages": [
      {
        "role": "user",
        "content": "et l'espacement entre les villas ?"
      }
    ],
    "userId": "user-test"
  }'

# Vérifier : La réponse doit mentionner "Dubai Hills", "3BR", "10M AED"
# → Preuve que le thread contient l'historique
```

### Test 6 : Chat REST sans flag (Chat Completions + journalisation)

```bash
# Sans flag X-Use-Assistants, utilise Chat Completions MAIS journalise quand même
curl -X POST http://localhost:3001/api/v1/ai/generate \
  -H "Content-Type: application/json" \
  -H "conversation-id: conv-test-123" \
  -H "tenant-id: tenant-test" \
  -d '{
    "messages": [
      {
        "role": "user",
        "content": "fais-moi 3 comparatifs sous 9.5M"
      }
    ],
    "userId": "user-test"
  }'

# Vérifier logs : "Thread créé/récupéré", "Message ajouté (user)", "Message ajouté (assistant)"
# Même sans Assistants Runs, la journalisation permet la mémoire unifiée
```

### Test 7 : Token Realtime avec thread

```bash
curl -X POST http://localhost:3001/api/v1/chatbot/realtime/ephemeral-token \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user-test",
    "tenantId": "tenant-test",
    "conversationId": "conv-test-123"
  }'

# Réponse attendue :
# {
#   "token": "ek_...",
#   "expires_in": 900,
#   "sessionId": "sess_...",
#   "assistant_thread_id": "thread_abc123..."  ← MÊME thread que REST !
# }
```

### Test 8 : Isolation multi-tenant

```bash
# Thread pour tenant-1
curl -X POST http://localhost:3001/api/v1/assistants/thread/upsert \
  -H "Content-Type: application/json" \
  -d '{
    "conversationId": "conv-shared",
    "tenantId": "tenant-1"
  }'

# Thread pour tenant-2 (même conversationId mais tenant différent = thread différent)
curl -X POST http://localhost:3001/api/v1/assistants/thread/upsert \
  -H "Content-Type: application/json" \
  -d '{
    "conversationId": "conv-shared",
    "tenantId": "tenant-2"
  }'

# Vérifier : 2 threads différents retournés (isolation garantie)
```

## Test E2E complet (REST → Realtime → REST)

### Scénario : Conversation mixte

1. **Tour 1 (REST)** :
   ```bash
   curl -X POST http://localhost:3001/api/v1/ai/generate \
     -H "X-Use-Assistants: true" \
     -H "conversation-id: conv-e2e" \
     -H "tenant-id: tenant-test" \
     -d '{"messages":[{"role":"user","content":"Budget 10M AED villa 3BR à Dubai Hills"}]}'
   ```
   **Attendu** : Réponse sur Dubai Hills, 3BR, 10M

2. **Tour 2 (Realtime - simulé via POST)** :
   ```bash
   # Simuler transcription utilisateur
   curl -X POST http://localhost:3001/api/v1/assistants/thread/messages \
     -H "Content-Type: application/json" \
     -d '{
       "conversationId": "conv-e2e",
       "tenantId": "tenant-test",
       "role": "user",
       "content": "et l'\''espacement entre les villas ?",
       "eventId": "evt-realtime-user-1"
     }'
   
   # Simuler réponse assistant (générée par Realtime)
   curl -X POST http://localhost:3001/api/v1/assistants/thread/messages \
     -H "Content-Type: application/json" \
     -d '{
       "conversationId": "conv-e2e",
       "tenantId": "tenant-test",
       "role": "assistant",
       "content": "L'\''espacement entre les villas à Dubai Hills est généralement de 3-5 mètres.",
       "eventId": "evt-realtime-assistant-1"
     }'
   ```

3. **Tour 3 (REST)** :
   ```bash
   curl -X POST http://localhost:3001/api/v1/ai/generate \
     -H "X-Use-Assistants: true" \
     -H "conversation-id: conv-e2e" \
     -H "tenant-id: tenant-test" \
     -d '{"messages":[{"role":"user","content":"fais-moi 3 comparatifs sous 9.5M"}]}'
   ```
   **Attendu** : La réponse doit mentionner :
   - Dubai Hills (tour 1)
   - Espacement 3-5m (tour 2)
   - Comparatifs sous 9.5M (nouveau)
   → **PREUVE de mémoire unifiée**

## Vérifications manuelles

### 1. Logs serveur

Rechercher dans les logs :
- ✅ `Thread créé: thread_... pour conversationId: ...`
- ✅ `Thread existant trouvé pour conversationId: ...`
- ✅ `Message ajouté au thread ...: user`
- ✅ `Message ajouté au thread ...: assistant`
- ✅ `Run créé: ... pour thread ...`

### 2. Base de données

```sql
-- Vérifier les threads créés
SELECT * FROM "ConversationThread" WHERE "conversationId" = 'conv-test-123';

-- Vérifier l'isolation multi-tenant
SELECT * FROM "ConversationThread" WHERE "conversationId" = 'conv-shared';
```

### 3. OpenAI Dashboard

- Aller sur https://platform.openai.com/assistants
- Vérifier que les threads existent
- Vérifier les messages dans chaque thread

## Points de vérification critiques

- [ ] **Thread unique par conversation** : Même `assistant_thread_id` pour REST et Realtime
- [ ] **Isolation multi-tenant** : `tenantId` différent = thread différent même avec même `conversationId`
- [ ] **Mémoire persistante** : Tour 3 réutilise infos tours 1 et 2
- [ ] **Journalisation Chat Completions** : Même sans flag, messages journalisés dans thread
- [ ] **Déduplication eventId** : Pas de doublons si front retry
- [ ] **Tool calls** : Fonctions exécutées via `toolRegistry` et outputs soumis au run

## Erreurs courantes

### "Thread not found"
→ Vérifier que `conversationId` et `tenantId` sont identiques entre les appels

### "Permission denied to create database" (migration)
→ En dev : `npx prisma db push` au lieu de `migrate dev`
→ En prod : Vérifier droits DB utilisateur

### "Assistant thread_id manquant"
→ Vérifier que `AssistantsService` est injecté dans `RealtimeService`
→ Vérifier que `RealtimeModule` importe `AiModule`

### Messages non journalisés
→ Vérifier que le front POSTe vers `/assistants/thread/messages`
→ Vérifier logs backend pour erreurs HTTP
→ Vérifier que `conversationId` est cohérent

## Next steps après tests

1. ✅ Si tous les tests passent → Prêt pour intégration front
2. ⚠️ Si échecs → Vérifier logs et corriger
3. 📝 Documenter les résultats de tests



