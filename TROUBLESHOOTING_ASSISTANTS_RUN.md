# 🔍 Troubleshooting : Run Assistants échoue

## Erreur observée

```
Run run_YsbHYnCDVqd78ljfj1qoUmek échoué: Sorry, something went wrong.
```

## Causes possibles

1. **Assistant mal configuré** : L'assistant créé automatiquement peut avoir des problèmes
2. **Instructions trop longues** : Les instructions du profil peuvent dépasser la limite
3. **Tools incompatibles** : Les tools définis peuvent ne pas être compatibles avec l'API Assistants
4. **Rate limiting OpenAI** : Trop de requêtes simultanées

## Solutions

### Solution 1 : Fallback automatique (DÉJÀ IMPLÉMENTÉ)

Le système fait maintenant un **fallback automatique** vers Chat Completions si le run échoue.

### Solution 2 : Vérifier l'assistant créé

L'assistant est créé automatiquement avec `profileJohn`. Vérifiez dans le dashboard OpenAI :
https://platform.openai.com/assistants

Cherchez l'assistant créé récemment et vérifiez :
- ✅ Instructions sont valides
- ✅ Tools sont bien définis
- ✅ Modèle est supporté

### Solution 3 : Créer l'assistant manuellement

1. Aller sur https://platform.openai.com/assistants
2. Créer un assistant avec :
   - **Nom** : John
   - **Instructions** : (copier depuis `profileJohn.instructions`)
   - **Modèle** : `gpt-4o-mini` ou `gpt-4o`
   - **Tools** : web_search, web_open (si disponible)
3. Copier l'`assistant_id` généré
4. Dans `.env` :
   ```env
   OPENAI_ASSISTANT_ID=asst_...votre_id...
   ```

### Solution 4 : Désactiver temporairement Assistants

Si les runs échouent systématiquement, désactiver dans `.env` :
```env
USE_ASSISTANTS_API=false
```

Le système utilisera Chat Completions mais journalisera quand même dans le thread (mémoire unifiée fonctionne).

### Solution 5 : Vérifier les logs détaillés

Les logs ont été améliorés pour afficher :
- Code d'erreur
- Type d'erreur
- Détails complets de l'erreur

Vérifiez les logs pour plus d'infos sur la cause exacte.

## Comportement actuel

✅ **Fallback automatique activé** : Si run échoue → Chat Completions
✅ **Journalisation toujours active** : Même en fallback, messages journalisés dans thread
✅ **Mémoire unifiée fonctionne** : Thread créé/récupéré même en Chat Completions

## Recommandation immédiate

Pour éviter l'erreur, vous pouvez :

1. **Option rapide** : Désactiver temporairement `USE_ASSISTANTS_API` dans `.env`
   - Le système utilisera Chat Completions (qui fonctionne)
   - La journalisation dans le thread continue
   - Mémoire unifiée fonctionne

2. **Option long terme** : Créer l'assistant manuellement et configurer `OPENAI_ASSISTANT_ID`

3. **Debug** : Vérifier les logs détaillés pour identifier la cause exacte



