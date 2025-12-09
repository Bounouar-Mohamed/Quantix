# 🔄 Migration vers Prompts OpenAI (Recommandé)

## Changement d'architecture OpenAI

### Ancien flux (Legacy - en migration)
- **Assistants** : Configuration dans `/assistants` dashboard
- API : `beta.threads.*` (polling)
- ⚠️ En cours de migration vers Responses/Prompts

### Nouveau flux (Recommandé)
- **Prompts** : Configuration dans le dashboard Prompts
- API : Responses API + Prompts
- ✅ Voie recommandée par OpenAI
- ✅ Utilisable dans Responses API ET Realtime sessions

## Architecture proposée

### Structure
```
src/ai/
├── interfaces/
│   ├── assistant-adapter.interface.ts  ← Legacy (Assistants)
│   └── prompt-adapter.interface.ts      ← Nouveau (Prompts) ✅
├── adapters/
│   ├── legacy-assistant.adapter.ts      ← Ancien flux
│   ├── responses-assistant.adapter.ts   ← Migration Assistants → Responses
│   └── prompt.adapter.ts                ← Nouveau flux Prompts ✅
└── services/
    ├── assistants.service.ts            ← Legacy
    └── prompts.service.ts               ← Nouveau ✅
```

## Configuration

### Actuellement (Legacy)
```env
OPENAI_ASSISTANT_ID=asst_xxx
```

### Nouveau (Recommandé)
```env
# Option 1: Prompt ID (recommandé)
OPENAI_PROMPT_ID=prompt_xxx

# Option 2: Garder Assistant pour compatibilité
OPENAI_ASSISTANT_ID=asst_xxx  # Fallback si pas de prompt
```

## Utilisation dans le code

### Avant (Assistants)
```typescript
// Créer/retrouver assistant
const assistantId = await assistantsService.getOrCreateAssistant();

// Utiliser dans run
const result = await assistantsService.runAndPoll(threadId, assistantId);
```

### Après (Prompts)
```typescript
// Utiliser directement le prompt
const promptId = process.env.OPENAI_PROMPT_ID;
const result = await promptsService.runPrompt(promptId, {
    // Variables du prompt
    user_context: userData,
    conversation_history: messages
});
```

## Avantages des Prompts

1. **Configuration centralisée** : Dashboard dédié pour prompts
2. **Variables** : Support natif des variables dans les prompts
3. **Réutilisable** : Même prompt pour Responses API et Realtime
4. **Plus simple** : Pas besoin de gérer threads/runs manuellement
5. **Meilleure performance** : Streaming natif dans Responses API

## Migration progressive

### Phase 1 : Support hybride (recommandé maintenant)
- Garder `OPENAI_ASSISTANT_ID` (legacy) pour compatibilité
- Ajouter `OPENAI_PROMPT_ID` (nouveau)
- Si prompt existe → utiliser Prompts
- Sinon → fallback sur Assistants

### Phase 2 : Migration complète
- Basculer vers Prompts uniquement
- Désactiver Assistants legacy

## Intégration Realtime

### Avant (Assistants)
```typescript
// Récupérer instructions de l'assistant
const assistantConfig = await assistantsService.getAssistantConfig();
const instructions = assistantConfig.instructions;
```

### Après (Prompts)
```typescript
// Utiliser prompt directement dans Realtime
const promptConfig = await promptsService.usePromptInRealtime(promptId, {
    model: 'gpt-4o-realtime-preview',
    voice: 'alloy',
    variables: { /* variables du prompt */ }
});
// promptConfig contient instructions + tools prêts pour Realtime
```

## Implémentation

### 1. Créer PromptAdapter
- Récupérer config depuis dashboard OpenAI
- Support Responses API
- Support Realtime sessions

### 2. Modifier AssistantsService
- Ajouter support Prompts en plus des Assistants
- Fallback Assistants si prompt non configuré

### 3. Modifier RealtimeService
- Utiliser Prompts au lieu d'Assistants pour instructions

## Variables de prompt

Les Prompts supportent des variables qui peuvent être injectées dynamiquement :

```typescript
// Prompt dans dashboard avec variables:
// "Bonjour {{user_name}}, je suis {{assistant_name}}..."

// Utilisation:
await promptsService.runPrompt(promptId, {
    user_name: 'Mohamed',
    assistant_name: 'John'
});
```

## Plan d'action

1. **Maintenant** : Créer `PromptAdapter` + `PromptsService`
2. **Ensuite** : Modifier `AssistantsService` pour supporter Prompts
3. **Puis** : Modifier `RealtimeService` pour utiliser Prompts
4. **Enfin** : Basculer configuration vers Prompts

## Documentation OpenAI

- Dashboard Prompts : https://platform.openai.com/prompts
- Responses API : https://platform.openai.com/docs/guides/responses-api
- Migration guide : https://platform.openai.com/docs/guides/migrate-to-responses

## Note importante

Les **Assistants** continuent de fonctionner mais sont en migration.
Les **Prompts** sont la voie recommandée pour nouvelles configurations.

Nous allons supporter les deux pendant la transition, avec priorité aux Prompts si configurés.



