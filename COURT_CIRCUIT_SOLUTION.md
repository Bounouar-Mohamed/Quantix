# ✅ Solution court-circuit : Accepte conversationId dans le body

## Problème résolu

Com-api envoie `conversationId` dans le body mais le DTO le rejetait.

**Solution appliquée** : Ajout de `conversationId` et `tenantId` comme champs optionnels dans `GenerateResponseDto`.

## Changements effectués

1. **DTO mis à jour** : `conversationId` et `tenantId` acceptés dans le body
2. **Controller mis à jour** : Priorité `header > body.conversationId > body.sessionId > généré`

## Ordre de priorité pour conversationId

```typescript
conversationId = 
  header['conversation-id'] ||     // Priorité 1 : Header (recommandé)
  body.conversationId ||            // Priorité 2 : Body (compatibilité com-api)
  body.sessionId ||                 // Priorité 3 : Body sessionId (legacy)
  `conv_${Date.now()}`              // Fallback : généré
```

## Pour activer les threads unifiés

### Option 1 : Variable d'environnement (RECOMMANDÉ)

Dans `.env` de `ai-management-service` :
```env
USE_ASSISTANTS_API=true
```

### Option 2 : Header depuis com-api

Modifier `AiMicroserviceClient` dans com-api pour ajouter :
```typescript
headers: {
  'Content-Type': 'application/json',
  'X-Use-Assistants': 'true',  // ← AJOUTER
}
```

## Résultat attendu

Après redémarrage, com-api pourra :
- ✅ Envoyer `conversationId` dans le body sans erreur
- ✅ Réutiliser le même thread pour la même conversation
- ✅ Avoir une mémoire unifiée entre REST et Realtime

## Test immédiat

Redémarrer `ai-management-service` et tester depuis le front. Vous devriez voir dans les logs :
```
[Nest] ... LOG [AssistantsService] Thread existant trouvé pour conversationId: 31a6d69b-8dce-488a-8f7b-3fbf9c91040d
```

Au lieu de créer un nouveau thread à chaque fois.



