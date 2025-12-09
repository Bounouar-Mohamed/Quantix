# 🔧 Configuration Assistant OpenAI

## Comment ça fonctionne

### 1. Assistant depuis la plateforme OpenAI

Si vous définissez `OPENAI_ASSISTANT_ID` dans `.env` :
```env
OPENAI_ASSISTANT_ID=asst_votre_id_ici
```

✅ **Le code utilisera CET assistant** (pas de création automatique)  
✅ **Les instructions** que vous définissez sur la plateforme seront utilisées  
✅ **Les functions/tools** que vous ajoutez sur la plateforme seront appelés

### 2. Assistant créé automatiquement

Si `OPENAI_ASSISTANT_ID` n'est **pas défini** :
- Le code crée automatiquement un assistant depuis `profileJohn`
- ⚠️ **Sans tools** (pour éviter erreurs OpenAI)
- Les instructions viennent de `profileJohn.instructions`

## Les Functions/Tools sur la plateforme

### Types de functions supportés

#### ✅ Serverless Functions (OpenAI)
Si vous définissez des **serverless functions** sur la plateforme OpenAI :
- Elles sont exécutées directement par OpenAI
- **Aucun code backend requis** de votre côté
- Parfait pour des fonctions simples

#### ✅ Function Calling avec Endpoint
Si vous définissez des **functions** qui nécessitent un endpoint externe :
- Le run passera en statut `requires_action`
- Le code actuel (`runAndPoll`) détecte `requires_action`
- **MAIS** actuellement, il exécute seulement via `executeTool` (votre toolRegistry)
- Il faut adapter pour appeler vos endpoints personnalisés

### 3. Votre Tool Registry actuel

Le code actuel utilise un `toolRegistry` avec :
- `web_search`
- `web_open`

Ces tools sont **exécutés côté serveur** via `executeTool()`.

## ⚠️ Problème actuel

Si vous ajoutez des functions sur la plateforme OpenAI qui :
- Nécessitent un endpoint externe
- Sont différentes de `web_search` / `web_open`

→ Le code actuel ne les gérera pas automatiquement.

## ✅ Solution : Utiliser l'assistant de la plateforme + adapter le code

### Étapes recommandées

1. **Créer l'assistant sur la plateforme** :
   - https://platform.openai.com/assistants
   - Ajouter vos instructions
   - Ajouter vos functions (serverless ou avec endpoints)

2. **Configurer dans `.env`** :
   ```env
   OPENAI_ASSISTANT_ID=asst_votre_id
   ```

3. **Adapter le code pour vos functions** (si nécessaire) :

   Si vous avez des functions personnalisées qui nécessitent un endpoint :
   
   Modifier `runAndPoll()` dans `assistants.service.ts` :
   
   ```typescript
   if (run.status === 'requires_action') {
       const toolCalls = run.required_action?.submit_tool_outputs?.tool_calls || [];
       
       for (const toolCall of toolCalls) {
           const functionName = toolCall.function.name;
           
           // Si c'est une function de votre toolRegistry
           if (['web_search', 'web_open'].includes(functionName)) {
               // Exécuter via toolRegistry
               const output = await executeTool(functionName, args);
           } else {
               // Appeler votre endpoint personnalisé
               const output = await callYourCustomEndpoint(functionName, args);
           }
       }
   }
   ```

## 🎯 Recommandation

Pour éviter la complexité :

1. **Option A** : Utiliser uniquement **Serverless Functions** sur OpenAI
   - Configurées directement sur la plateforme
   - Exécutées par OpenAI
   - Aucun code backend requis

2. **Option B** : Utiliser uniquement votre **toolRegistry** actuel
   - Définir les functions sur la plateforme comme "external"
   - Adapter `runAndPoll()` pour les gérer

3. **Option C** : Mélange
   - Serverless functions pour fonctions simples
   - ToolRegistry pour fonctions complexes nécessitant votre backend

## Test

Pour vérifier que votre assistant est bien utilisé :

```bash
# Regardez les logs au démarrage
# Vous devriez voir :
# ✅ [AssistantsService] Utilisation assistant configuré: asst_votre_id
# Au lieu de :
# ⚠️ [AssistantsService] Création assistant depuis profileJohn
```

## Questions fréquentes

**Q: Si je change les instructions sur la plateforme, est-ce que ça prend effet immédiatement ?**  
A: Oui, car le code utilise toujours l'assistant via son ID. Les modifications sur la plateforme sont prises en compte immédiatement.

**Q: Les tools que j'ajoute sur la plateforme fonctionnent-ils automatiquement ?**  
A: Ça dépend :
- ✅ **Serverless functions** : Oui, automatiquement
- ⚠️ **Functions avec endpoints** : Non, il faut adapter le code pour les gérer

**Q: Puis-je avoir des tools différents pour Chat Completions vs Assistants ?**  
A: Oui, mais actuellement Chat Completions utilise `profileJohn.tools` et Assistants utilise les tools de l'assistant configuré.



