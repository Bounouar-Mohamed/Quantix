# ✅ Test immédiat - Vérifier que ça marche

## État actuel

✅ **Serveur fonctionne** : Threads créés, messages ajoutés, plus d'erreurs  
⚠️ **Problème** : Chaque requête crée un nouveau thread car `conversationId` n'est pas transmis

## Test rapide depuis le terminal

### Test 1 : Créer un thread avec conversationId connu

```bash
curl -X POST http://localhost:3001/api/v1/assistants/thread/upsert \
  -H "Content-Type: application/json" \
  -H "tenant-id: global" \
  -d '{
    "conversationId": "31a6d69b-8dce-488a-8f7b-3fbf9c91040d",
    "tenantId": "global"
  }'
```

Vous devriez voir dans les logs :
```
[Nest] ... LOG [AssistantsService] Création nouveau thread pour conversationId: 31a6d69b-8dce-488a-8f7b-3fbf9c91040d
[Nest] ... LOG [AssistantsService] Thread créé: thread_...
```

### Test 2 : Récupérer le même thread (doit être le même)

```bash
curl -X POST http://localhost:3001/api/v1/assistants/thread/upsert \
  -H "Content-Type: application/json" \
  -H "tenant-id: global" \
  -d '{
    "conversationId": "31a6d69b-8dce-488a-8f7b-3fbf9c91040d",
    "tenantId": "global"
  }'
```

Vous devriez voir :
```
[Nest] ... LOG [AssistantsService] Thread existant trouvé pour conversationId: 31a6d69b-8dce-488a-8f7b-3fbf9c91040d
```

### Test 3 : Chat avec conversationId + flag Assistants

```bash
curl -X POST http://localhost:3001/api/v1/ai/generate \
  -H "Content-Type: application/json" \
  -H "conversation-id: 31a6d69b-8dce-488a-8f7b-3fbf9c91040d" \
  -H "X-Use-Assistants: true" \
  -H "tenant-id: global" \
  -d '{
    "messages": [
      {
        "role": "user",
        "content": "combien d'\''habitant à dubai ?"
      }
    ]
  }'
```

Vous devriez voir :
```
[Nest] ... LOG [AssistantsService] Thread existant trouvé... (si thread créé avant)
[Nest] ... LOG [AssistantsService] Message ajouté au thread ...: user
[Nest] ... LOG [AssistantsService] Run créé: ...
[Nest] ... LOG [AssistantsService] Message ajouté au thread ...: assistant
```

### Test 4 : Deuxième message (test mémoire)

```bash
curl -X POST http://localhost:3001/api/v1/ai/generate \
  -H "Content-Type: application/json" \
  -H "conversation-id: 31a6d69b-8dce-488a-8f7b-3fbf9c91040d" \
  -H "X-Use-Assistants: true" \
  -H "tenant-id: global" \
  -d '{
    "messages": [
      {
        "role": "user",
        "content": "et la en 2025 ?"
      }
    ]
  }'
```

**Important** : La réponse devrait mentionner "population" ou "habitants" → preuve que le thread contient l'historique.

## Si les tests passent

✅ Le système fonctionne, il faut juste que **com-api** transmette :
1. Header `conversation-id` avec le bon ID
2. Header `X-Use-Assistants: true` (ou `USE_ASSISTANTS_API=true` dans `.env`)

Voir `FIX_COM_API_INTEGRATION.md` pour les modifications à faire dans com-api.



