# 🔧 Fix intégration com-api → ai-management-service

## Problème identifié

Le front envoie `conversationId: '31a6d69b-8dce-488a-8f7b-3fbf9c91040d'` (fixe) mais :
- ✅ Le serveur fonctionne techniquement
- ❌ Com-api ne transmet pas le `conversationId` à `ai-management-service`
- ❌ `USE_ASSISTANTS_API` n'est pas activé → chaque requête crée un nouveau thread

## Solution 1 : Activer USE_ASSISTANTS_API

Dans `.env` ou variables d'environnement :
```env
USE_ASSISTANTS_API=true
```

Ou passer le header dans chaque requête depuis com-api :
```http
X-Use-Assistants: true
```

## Solution 2 : Com-api doit transmettre conversationId

### Option A : Header `conversation-id`

Quand com-api appelle `ai-management-service`, ajouter le header :

```typescript
// Dans com-api, quand vous appelez ai-management-service
const response = await fetch('http://ai-management:3001/api/v1/ai/generate', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'conversation-id': conversationId, // ← AJOUTER CETTE LIGNE
    'x-use-assistants': 'true',        // ← AJOUTER CETTE LIGNE aussi
  },
  body: JSON.stringify({
    messages: [...],
    // ... autres champs
  }),
});
```

### Option B : Utiliser `sessionId` dans le body

Si vous préférez passer dans le body :

```typescript
const response = await fetch('http://ai-management:3001/api/v1/ai/generate', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-use-assistants': 'true',
  },
  body: JSON.stringify({
    messages: [...],
    sessionId: conversationId, // ← Le controller l'utilisera
    // ... autres champs
  }),
});
```

### Option C : Utiliser directement `/assistants/chat`

Utiliser l'endpoint dédié qui attend `conversationId` dans le body :

```typescript
const response = await fetch('http://ai-management:3001/api/v1/assistants/chat', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'conversation-id': conversationId, // ← Header
    'tenant-id': tenantId,              // ← Si multi-tenant
  },
  body: JSON.stringify({
    conversationId: conversationId,    // ← Body aussi (redundant mais sûr)
    userText: userMessage,             // ← Texte utilisateur
    userId: userId,
    tenantId: tenantId,
  }),
});
```

## Vérification

Après ces modifications, vous devriez voir dans les logs `ai-management-service` :

```
[Nest] ... LOG [AssistantsService] Thread existant trouvé pour conversationId: 31a6d69b-8dce-488a-8f7b-3fbf9c91040d
```

Au lieu de :
```
[Nest] ... LOG [AssistantsService] Création nouveau thread pour conversationId: conv_1761872415545
```

## Test de mémoire

Une fois corrigé, testez :
1. **Tour 1** : "combien d'habitant à dubai ?"
2. **Tour 2** : "et la en 2025 ?" 
   → Doit répondre en se basant sur la question précédente (population)

Si Tour 2 ne mentionne pas la question Tour 1, vérifier :
- ✅ `conversationId` transmis
- ✅ `USE_ASSISTANTS_API=true` ou header `X-Use-Assistants: true`
- ✅ Même `tenantId` (si multi-tenant)



