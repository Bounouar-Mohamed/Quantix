# 🔧 Comment ajouter des functions à votre Assistant

## Résumé rapide

✅ **Oui**, l'assistant configuré sur https://platform.openai.com/assistants est utilisé si vous définissez `OPENAI_ASSISTANT_ID`  
⚠️ **Mais**, seules les functions qui sont dans `toolRegistry.ts` fonctionnent actuellement

## 3 Types de Functions

### 1. ✅ Serverless Functions (OpenAI)
**Fonctionnent automatiquement**

- Configurées directement sur la plateforme OpenAI
- Exécutées par OpenAI (pas votre backend)
- Aucun code à écrire

**Exemple** : `code_interpreter`, functions OpenAI natives

### 2. ✅ Functions dans toolRegistry.ts
**Fonctionnent si ajoutées dans le code**

Actuellement disponibles :
- `web_search` ✅
- `web_open` ✅
- `create_automation` (stub)
- `analyze_client` (stub)
- `log_to_crm` (stub)

### 3. ❌ Functions personnalisées sur la plateforme
**Ne fonctionnent PAS automatiquement**

Si vous ajoutez une function sur la plateforme qui n'est pas dans `toolRegistry.ts`, elle échouera.

## Comment ajouter une nouvelle function

### Étape 1 : Définir sur la plateforme OpenAI

1. Allez sur https://platform.openai.com/assistants
2. Sélectionnez votre assistant
3. Ajoutez une function avec le schéma JSON

Exemple :
```json
{
  "name": "get_property_listings",
  "description": "Get available property listings for a location",
  "parameters": {
    "type": "object",
    "properties": {
      "location": {"type": "string"},
      "min_price": {"type": "number"},
      "max_price": {"type": "number"}
    },
    "required": ["location"]
  }
}
```

### Étape 2 : Implémenter dans toolRegistry.ts

Ajoutez le handler dans `/src/ai/toolRegistry.ts` :

```typescript
export const toolHandlers: Record<string, ToolHandler> = {
    // ... fonctions existantes ...
    
    async get_property_listings(args, ctx) {
        const { location, min_price, max_price } = args;
        
        // Votre logique métier ici
        const listings = await yourPropertyService.search({
            location,
            minPrice: min_price,
            maxPrice: max_price
        });
        
        return { listings };
    }
};
```

### Étape 3 : Tester

Redémarrez le serveur et testez. Les logs afficheront :
```
🔧 [TOOL] Exécution tool: get_property_listings
✅ [TOOL] Tool get_property_listings exécuté avec succès
```

## Exemple complet : Ajouter une function CRM

### 1. Sur la plateforme OpenAI

Ajoutez la function :
```json
{
  "name": "update_client_notes",
  "description": "Update notes for a client in CRM",
  "parameters": {
    "type": "object",
    "properties": {
      "client_id": {"type": "string"},
      "notes": {"type": "string"}
    },
    "required": ["client_id", "notes"]
  }
}
```

### 2. Dans toolRegistry.ts

```typescript
async update_client_notes(args, ctx) {
    const { client_id, notes } = args;
    
    // Appeler votre API CRM
    const result = await crmService.updateNotes(client_id, notes, {
        userId: ctx.userId
    });
    
    return {
        success: true,
        message: `Notes updated for client ${client_id}`
    };
}
```

### 3. Résultat

L'assistant pourra maintenant appeler cette function automatiquement quand l'utilisateur demande de mettre à jour des notes client.

## Comment vérifier que ça marche

1. **Logs au démarrage** :
   ```
   ✅ [AssistantsService] Utilisation assistant configuré: asst_xxx
   ```
   (Si vous voyez "Création assistant depuis profileJohn", l'assistant de la plateforme n'est pas utilisé)

2. **Logs lors de l'appel** :
   ```
   🔧 [TOOL] Exécution tool: votre_function
   ✅ [TOOL] Tool votre_function exécuté avec succès
   ```

3. **Si erreur** :
   ```
   ⚠️ [TOOL] Tool votre_function non trouvé dans toolRegistry
   ```
   → Ajoutez-la dans `toolRegistry.ts`

## Questions fréquentes

**Q: Puis-je utiliser des functions qui appellent d'autres APIs externes ?**  
A: Oui ! C'est exactement le but. Dans le handler, faites votre appel API et retournez le résultat.

**Q: Les functions peuvent-elles accéder à la base de données ?**  
A: Oui, importez vos services Prisma ou autres dans `toolRegistry.ts`.

**Q: Comment gérer les erreurs ?**  
A: Throws une erreur dans le handler. Elle sera catchée et retournée à l'assistant comme `{ error: "message" }`.

**Q: Puis-je avoir des functions différentes pour Chat vs Realtime ?**  
A: Techniquement oui, mais actuellement le même `toolRegistry` est utilisé pour les deux.

## Liste des functions actuellement disponibles

Voir `/src/ai/toolRegistry.ts` pour la liste complète.

Pour ajouter une nouvelle function :
1. Définir sur la plateforme OpenAI
2. Ajouter le handler dans `toolRegistry.ts`
3. Redémarrer le serveur

C'est tout ! 🎉



