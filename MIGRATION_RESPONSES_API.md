# 🔄 Migration vers Responses API + MCP

## Vue d'ensemble

OpenAI migre vers une nouvelle **Responses API** qui :
- Remplace le polling par du streaming natif
- Supporte MCP (Model Context Protocol) pour connexions externes
- Offre une meilleure gestion des tool calls
- Améliore les performances

## Architecture préparée

### Couche d'abstraction créée

✅ **Interface `AssistantAdapter`** : Abstraction pour les différentes implémentations
✅ **`LegacyAssistantAdapter`** : Implémentation actuelle (beta.threads)
✅ **`ResponsesAssistantAdapter`** (à créer) : Nouvelle implémentation Responses API + MCP

### Structure

```
src/ai/
├── interfaces/
│   └── assistant-adapter.interface.ts  ← Interface unifiée
├── adapters/
│   ├── legacy-assistant.adapter.ts      ← Implémentation actuelle
│   └── responses-assistant.adapter.ts   ← À créer (Responses API + MCP)
└── services/
    └── assistants.service.ts            ← Utilise l'adapter configuré
```

## Plan de migration

### Phase 1 : Préparation (✅ FAIT)
- [x] Créer l'interface `AssistantAdapter`
- [x] Créer `LegacyAssistantAdapter` (wrap code actuel)
- [x] Documenter la migration

### Phase 2 : Adapter le service (À FAIRE)
- [ ] Modifier `AssistantsService` pour utiliser `AssistantAdapter`
- [ ] Ajouter configuration pour choisir l'adapter (legacy vs responses)
- [ ] Tester avec legacy adapter

### Phase 3 : Implémenter Responses API (FUTUR)
- [ ] Créer `ResponsesAssistantAdapter`
- [ ] Implémenter streaming pour Responses API
- [ ] Tester avec nouvelle API

### Phase 4 : Intégration MCP (FUTUR)
- [ ] Créer service MCP pour gérer connexions
- [ ] Intégrer MCP dans `ResponsesAssistantAdapter`
- [ ] Tester connexions MCP

## Utilisation MCP

MCP (Model Context Protocol) permet de connecter des contextes externes :

```typescript
// Exemple d'utilisation future
const result = await assistantAdapter.runAndGetResponse(threadId, assistantId, {
    userId: 'user123',
    mcpConnections: [
        'mcp://database',
        'mcp://crm',
        'mcp://external-api'
    ]
});
```

## Configuration

### Actuellement (Legacy)
```env
OPENAI_ASSISTANT_ID=asst_xxx
USE_ASSISTANTS_API=true
```

### Après migration (Responses API)
```env
OPENAI_ASSISTANT_ID=asst_xxx
USE_ASSISTANTS_API=true
ASSISTANT_API_VERSION=responses  # nouveau
MCP_ENABLED=true                 # nouveau
MCP_CONNECTIONS=database,crm      # nouveau
```

## Changements nécessaires dans AssistantsService

### Avant (code actuel)
```typescript
// Utilise directement openai.beta.threads.*
const run = await this.openai.beta.threads.runs.create(threadId, {
    assistant_id: assistantId,
});
```

### Après (avec adapter)
```typescript
// Utilise l'adapter abstrait
const adapter = this.getAdapter(); // legacy ou responses selon config
const result = await adapter.runAndGetResponse(threadId, assistantId, {
    userId,
    mcpConnections: this.getMCPConnections(),
});
```

## Bénéfices de l'abstraction

1. **Migration progressive** : Basculer legacy → responses sans casser le code
2. **Testabilité** : Facile de tester avec un adapter mock
3. **Extensibilité** : Ajouter MCP, nouvelles APIs, etc.
4. **Maintenance** : Code isolé par implémentation

## Prochaines étapes

1. **Maintenant** : Utiliser `LegacyAssistantAdapter` dans `AssistantsService`
2. **Plus tard** : Créer `ResponsesAssistantAdapter` quand OpenAI la rend disponible
3. **Ensuite** : Ajouter support MCP dans l'adapter responses

## Documentation OpenAI

- [Migration Guide](https://platform.openai.com/docs/guides/migrate-to-responses)
- [MCP Documentation](https://modelcontextprotocol.io) (quand disponible)

## Notes

- Le code actuel continue de fonctionner (legacy adapter)
- La migration peut être faite progressivement
- MCP sera intégré quand disponible
- Aucun breaking change pour l'instant



