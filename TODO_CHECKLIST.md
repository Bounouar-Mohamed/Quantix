# ✅ Checklist : Ce qui reste à faire

## 🔴 CRITIQUE - À faire immédiatement

### 1. Frontend Realtime - Journalisation messages
**Statut** : ⚠️ NON FAIT - Bloquant pour mémoire unifiée

Le frontend Realtime doit envoyer les messages au backend pour journalisation dans le thread.

**À faire** :
- [ ] Implémenter POST `/api/v1/assistants/thread/messages` dans le frontend
  - Hook 1 : `input_transcription.completed` → journaliser message user
  - Hook 2 : `response.completed` → journaliser message assistant
- [ ] Vérifier que `conversationId` et `tenantId` sont transmis correctement

**Fichier de référence** : `FRONT_REALTIME_INTEGRATION.md`

---

## 🟡 IMPORTANT - À faire bientôt

### 2. Déduplication par eventId
**Statut** : ⚠️ PARTIELLEMENT FAIT

Le système accepte `eventId` mais ne fait pas de déduplication réelle.

**À faire** :
- [ ] Créer table `MessageEvent` ou utiliser cache Redis pour stocker `eventId`
- [ ] Vérifier `eventId` avant d'ajouter un message
- [ ] Retourner 200 OK si message déjà journalisé (idempotent)

**Fichier** : `src/ai/services/assistants.service.ts` ligne ~97

---

### 3. Gestion d'erreur et fallback robuste
**Statut** : ⚠️ PARTIELLEMENT FAIT

Les runs Assistants échouent parfois (`server_error`). Le fallback fonctionne mais peut être amélioré.

**À faire** :
- [ ] Améliorer logs d'erreur avec plus de contexte
- [ ] Implémenter retry logic pour erreurs transitoires
- [ ] Ajouter métriques/monitoring pour taux d'échec

**Fichier** : `src/ai/services/assistants.service.ts` ligne ~242

---

### 4. Récupération usage tokens depuis runs
**Statut** : ⚠️ NON FAIT

Le code retourne `usage: { promptTokens: 0, ... }` au lieu des vrais tokens.

**À faire** :
- [ ] Récupérer `run.usage` depuis l'API OpenAI
- [ ] Stocker usage par conversation pour analytics
- [ ] Retourner usage réel dans `AiResponse`

**Fichier** : `src/ai/services/assistants.service.ts` ligne ~250
**Fichier** : `src/ai/controllers/generation.controller.ts` ligne ~100

---

### 5. Configuration assistant unique
**Statut** : ⚠️ PARTIELLEMENT FAIT

Un nouvel assistant est créé à chaque démarrage si `OPENAI_ASSISTANT_ID` n'est pas configuré.

**À faire** :
- [ ] Documenter qu'il faut configurer `OPENAI_ASSISTANT_ID` dans `.env`
- [ ] Ajouter log d'avertissement si assistant créé automatiquement
- [ ] Créer assistant une seule fois et le stocker en DB (optionnel)

**Fichier** : `src/ai/services/assistants.service.ts` ligne ~375

---

## 🟢 NICE TO HAVE - Améliorations futures

### 6. Support Prompts (nouvelle architecture OpenAI)
**Statut** : ✅ INTERFACE CRÉÉE - Implémentation à faire

**À faire** :
- [ ] Créer `PromptsService` qui implémente `PromptAdapter`
- [ ] Intégrer dans `AssistantsService` avec fallback
- [ ] Intégrer dans `RealtimeService`
- [ ] Tester avec Responses API quand disponible

**Fichiers** :
- `src/ai/interfaces/prompt-adapter.interface.ts` ✅ Créé
- `src/ai/services/prompts.service.ts` ⏳ À créer
- `src/chatbot/realtime/realtime.service.ts` ligne ~68 (TODO ajouté)

---

### 7. Intégration MCP
**Statut** : ✅ STRUCTURE CRÉÉE - Implémentation à faire

**À faire** :
- [ ] Implémenter connexions MCP réelles quand disponible
- [ ] Intégrer MCP dans `ResponsesAssistantAdapter` (futur)
- [ ] Tester connexions MCP avec Prompts

**Fichier** : `src/ai/services/mcp.service.ts` ✅ Créé

---

### 8. Migration vers Responses API
**Statut** : ✅ ARCHITECTURE PRÉPARÉE - Implémentation à faire

**À faire** :
- [ ] Créer `ResponsesAssistantAdapter` quand Responses API disponible
- [ ] Implémenter streaming pour Responses API
- [ ] Tester migration progressive legacy → responses

**Fichiers** :
- `src/ai/interfaces/assistant-adapter.interface.ts` ✅ Créé
- `src/ai/adapters/legacy-assistant.adapter.ts` ✅ Créé
- `src/ai/adapters/responses-assistant.adapter.ts` ⏳ À créer

---

### 9. Tests E2E
**Statut** : ⚠️ PARTIELLEMENT FAIT

**À faire** :
- [ ] Tests automatisés pour threads unifiés
- [ ] Tests REST → Realtime → REST (mémoire)
- [ ] Tests avec outils (web_search, etc.)
- [ ] Tests multi-tenant

**Fichier** : `test-threads.sh` ✅ Créé mais peut être amélioré

---

### 10. Documentation
**Statut** : ✅ PARTIELLEMENT FAIT

**À faire** :
- [ ] Documenter configuration complète `.env`
- [ ] Guide déploiement production
- [ ] Troubleshooting guide
- [ ] Diagramme architecture

**Fichiers existants** :
- `FRONT_REALTIME_INTEGRATION.md` ✅
- `MIGRATION_RESPONSES_API.md` ✅
- `MIGRATION_PROMPTS.md` ✅

---

## 📊 Résumé

| Priorité | Items | Statut |
|----------|-------|--------|
| 🔴 Critique | 1 | ⚠️ À faire |
| 🟡 Important | 4 | ⚠️ Partiellement fait |
| 🟢 Nice to have | 5 | ✅ Structure créée |

## 🎯 Prochaines actions recommandées

1. **IMMÉDIAT** : Implémenter journalisation frontend Realtime (item #1)
2. **URGENT** : Déduplication eventId (item #2)
3. **IMPORTANT** : Récupérer usage tokens (item #4)
4. **Bientôt** : Support Prompts quand disponible (item #6)

## ✅ Ce qui fonctionne déjà

- ✅ Threads unifiés (conversationId → assistant_thread_id)
- ✅ Journalisation Chat REST dans threads
- ✅ Récupération historique thread pour Chat Completions
- ✅ Support multi-tenant (tenantId)
- ✅ Fallback Chat Completions si run échoue
- ✅ Architecture prête pour Prompts/Responses/MCP
- ✅ Instructions unifiées Chat + Realtime (via assistant configuré)



