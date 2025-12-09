# RealtimeWebSocketServer - État actuel

## ⚠️ IMPORTANT : Ce fichier n'est PLUS utilisé dans l'architecture actuelle

### Architecture actuelle (2025)

```
Front → POST /chatbot/realtime/ephemeral-token (RealtimeService)
      → WebRTC direct avec OpenAI (token ek_)
      → POST /assistants/thread/messages (journalisation)
```

Le serveur **ne proxy plus** les connexions WebRTC. Le front se connecte directement à OpenAI.

### Pourquoi ce fichier existe encore ?

1. **Legacy** : Peut être utilisé pour des cas spécifiques (proxy, fallback, etc.)
2. **Référence** : Contient la logique de traitement des événements Realtime (tool calls, etc.)
3. **Future** : Peut servir si besoin de proxy serveur plutôt que WebRTC direct

### Si vous voulez l'utiliser

Pour activer `RealtimeWebSocketServer`, ajoutez dans `main.ts` :

```typescript
import { RealtimeWebSocketServer } from './chatbot/realtime/infrastructure/realtime-ws.server';

async function bootstrap() {
  // ... code existant ...
  
  const server = app.getHttpServer();
  
  // Activer RealtimeWebSocketServer si besoin
  if (process.env.ENABLE_REALTIME_WS_SERVER === 'true') {
    const realtimeWs = new RealtimeWebSocketServer(server);
    console.log('✅ RealtimeWebSocketServer activé');
  }
}
```

### Recommandation

- **Par défaut** : Ne pas utiliser (architecture WebRTC directe)
- **Si besoin de proxy** : Activer avec `ENABLE_REALTIME_WS_SERVER=true`
- **Pour tests** : Peut servir pour tester sans frontend

### Migration

Si vous migrez vers WebRTC direct :
1. ✅ Supprimer l'instanciation de `RealtimeWebSocketServer` (si présente)
2. ✅ Vérifier que le front utilise `RealtimeService.createEphemeralToken()`
3. ✅ Implémenter les hooks de journalisation dans le front (voir `FRONT_REALTIME_INTEGRATION.md`)



