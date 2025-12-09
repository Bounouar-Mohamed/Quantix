# Intégration Front Realtime → Thread unifié

## Problème

Le front se connecte directement à OpenAI Realtime via WebRTC (`ek_` token). Le serveur ne voit donc **jamais** les événements Realtime (transcriptions, réponses).

**Solution** : Le front doit journaliser les événements Realtime dans le thread via POST vers `ai-management-service`.

## Endpoints backend disponibles

### POST `/api/v1/assistants/thread/messages` (RECOMMANDÉ)

Le front n'a besoin que de `tenantId` + `conversationId`, le serveur résout le `threadId` automatiquement.

```typescript
// Request
POST /api/v1/assistants/thread/messages
Content-Type: application/json

{
  "tenantId": "tenant-123",          // Optionnel si envoyé dans header
  "conversationId": "conv-456",
  "role": "user" | "assistant",
  "content": "Le texte du message",
  "eventId": "evt_abc123",          // Optionnel : pour déduplication
  "meta": { ... }                    // Optionnel : métadonnées
}

// Response
{
  "success": true,
  "thread_id": "thread_xyz789"       // Retourné pour info
}
```

### POST `/api/v1/assistants/thread/:threadId/messages` (si vous avez déjà threadId)

```typescript
POST /api/v1/assistants/thread/thread_xyz789/messages
{
  "role": "user" | "assistant",
  "content": "...",
  "eventId": "evt_abc123"
}
```

## Intégration Front (2 hooks à ajouter)

### 1. Transcription utilisateur terminée

Quand l'utilisateur finit de parler, journaliser dans le thread :

```typescript
// Exemple avec @openai/realtime
session.on('input_transcription.completed', async (event) => {
  const text = event.transcript || event.text || event.content;
  
  if (!text || text.trim().length === 0) return;
  
  try {
    await fetch('/api/v1/assistants/thread/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'tenant-id': tenantId,  // Ou dans le body
      },
      body: JSON.stringify({
        tenantId: tenantId,
        conversationId: conversationId,
        role: 'user',
        content: text,
        eventId: event.event_id || event.id, // Pour déduplication
      }),
    });
    
    console.log('✅ Message utilisateur journalisé dans thread');
  } catch (error) {
    console.warn('⚠️ Erreur journalisation message user:', error);
    // Non-bloquant : continuer même si échec
  }
});
```

### 2. Réponse assistant terminée

Quand l'IA finit de répondre, journaliser dans le thread :

```typescript
// Exemple avec @openai/realtime
session.on('response.completed', async (event) => {
  // Extraire le texte de la réponse
  const text = event.output_text || 
                event.text || 
                event.content?.join(' ') || 
                '';
  
  if (!text || text.trim().length === 0) return;
  
  try {
    await fetch('/api/v1/assistants/thread/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'tenant-id': tenantId,
      },
      body: JSON.stringify({
        tenantId: tenantId,
        conversationId: conversationId,
        role: 'assistant',
        content: text,
        eventId: event.event_id || event.response_id || event.id,
      }),
    });
    
    console.log('✅ Message assistant journalisé dans thread');
  } catch (error) {
    console.warn('⚠️ Erreur journalisation message assistant:', error);
    // Non-bloquant
  }
});
```

### Alternative : Bufferiser les deltas

Si votre SDK expose seulement des deltas (`response.output_text.delta`), bufferisez puis envoyez en fin :

```typescript
let assistantTextBuffer = '';

session.on('response.output_text.delta', (event) => {
  assistantTextBuffer += event.delta || '';
});

session.on('response.completed', async () => {
  if (assistantTextBuffer.trim().length > 0) {
    // POST comme ci-dessus avec assistantTextBuffer
    await journalizeMessage('assistant', assistantTextBuffer);
    assistantTextBuffer = ''; // Reset
  }
});
```

## Noms d'événements selon SDK

Les noms exacts dépendent de votre SDK Realtime :

- **@openai/realtime** : `input_transcription.completed`, `response.completed`
- **OpenAI SDK officiel** : Cherchez les équivalents "transcription complete" et "response complete"
- **Autres** : Consultez la doc de votre SDK pour les événements finaux

## Déduplication

Le backend supporte `eventId` pour éviter les doublons si le front retry. Passez toujours l'`event_id` ou un UUID unique par événement.

## Sécurité

- Le front **n'a pas besoin** de connaître `assistant_thread_id`
- Envoyez seulement `tenantId` + `conversationId`
- Le serveur fait le mapping automatiquement
- Le serveur valide les permissions tenant

## Tests

Scénario E2E pour vérifier la mémoire unifiée :

1. **Tour 1 (REST)** : `"Budget 10M AED villa 3BR à Dubai Hills"`
2. **Tour 2 (Realtime)** : `"et l'espacement entre les villas ?"`
3. **Tour 3 (REST)** : `"fais-moi 3 comparatifs sous 9.5M"`

**Attendu** : Le Tour 3 réutilise les infos des tours précédents (zone, typologie, budget).

## Debug

Si les messages ne sont pas journalisés :

1. Vérifiez que les POST arrivent bien au serveur (logs backend)
2. Vérifiez que `conversationId` est le même entre REST et Realtime
3. Vérifiez que `tenantId` est cohérent
4. Vérifiez les logs : `📝 Message journalisé dans thread`

## Exemple complet (React)

```typescript
import { useRealtimeVoice } from './hooks/useRealtimeVoice';

function RealtimeVoiceComponent({ conversationId, tenantId }) {
  const { session, isConnected } = useRealtimeVoice();
  
  useEffect(() => {
    if (!session) return;
    
    // Hook 1: Transcription utilisateur
    const handleUserTranscript = async (event) => {
      const text = event.transcript;
      if (!text) return;
      
      await fetch('/api/v1/assistants/thread/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          conversationId,
          role: 'user',
          content: text,
          eventId: event.event_id,
        }),
      });
    };
    
    // Hook 2: Réponse assistant
    const handleAssistantResponse = async (event) => {
      const text = event.output_text || '';
      if (!text) return;
      
      await fetch('/api/v1/assistants/thread/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          conversationId,
          role: 'assistant',
          content: text,
          eventId: event.event_id,
        }),
      });
    };
    
    session.on('input_transcription.completed', handleUserTranscript);
    session.on('response.completed', handleAssistantResponse);
    
    return () => {
      session.off('input_transcription.completed', handleUserTranscript);
      session.off('response.completed', handleAssistantResponse);
    };
  }, [session, conversationId, tenantId]);
  
  // ... reste du composant
}
```



