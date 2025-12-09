# 📊 Architecture de Données - Microservice IA

## 🗄️ Schéma de Base de Données (PostgreSQL + Prisma)

### Tables Principales

```
┌─────────────────────────────────────────────────────────────┐
│                    UserUsage                                 │
├─────────────────────────────────────────────────────────────┤
│ id: String (PK) = "userId-channel"                           │
│ userId: String                                              │
│ tenantId: String?                                            │
│ channel: Channel (chat | realtime)                            │
│ firstSeen: DateTime                                          │
│ lastSeen: DateTime                                           │
│ requests: Int (cumulatif)                                    │
│ tokensIn: Int (cumulatif)                                    │
│ tokensOut: Int (cumulatif)                                   │
│ totalTokens: Int (cumulatif)                                 │
│ totalCost: Float (USD, cumulatif)                            │
└─────────────────────────────────────────────────────────────┘
                          │
                          │ (one-to-many)
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                  SessionUsage                                │
├─────────────────────────────────────────────────────────────┤
│ id: String (PK, CUID)                                        │
│ sessionId: String? (ex: "sess_1761784781957_xxx")            │
│ conversationId: String? (ex: "conv_1761780666290")          │
│ userId: String                                               │
│ model: String (ex: "gpt-4o-mini", "gpt-4o-realtime-preview")│
│ channel: Channel (chat | realtime)                           │
│ startAt: DateTime                                            │
│ endAt: DateTime? (null si session active)                   │
│ tokensIn: Int (session seulement)                           │
│ tokensOut: Int (session seulement)                           │
│ totalCost: Float (USD, session seulement)                     │
└─────────────────────────────────────────────────────────────┘
                          │
                          │ (one-to-many)
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                    EventUsage                                │
├─────────────────────────────────────────────────────────────┤
│ id: String (PK, CUID)                                        │
│ ts: DateTime (timestamp événement)                           │
│ userId: String?                                              │
│ sessionId: String? (référence SessionUsage)                  │
│ type: String (ex: "chat.generate", "webrtc.metrics", etc.)  │
│ meta: Json (données flexibles par type)                      │
└─────────────────────────────────────────────────────────────┘
```

## 🔄 Flux de Données

### 1. Chat REST (POST /api/v1/ai/generate)

```
Client Front
    │
    ├─> POST /api/v1/ai/generate
    │   { messages, conversationId, model, ... }
    │
    ├─> OpenAI API
    │   └─> Response: { content, usage: { prompt_tokens, completion_tokens } }
    │
    └─> Microservice
        │
        ├─> UserUsage.upsert (cumul userId + channel="chat")
        │   ├─ requests++
        │   ├─ tokensIn += prompt_tokens
        │   ├─ tokensOut += completion_tokens
        │   └─ totalCost += computeCost(model, tokens)
        │
        ├─> SessionUsage.create (si nouvelle session)
        │   └─ startAt = now()
        │
        └─> EventUsage.create
            └─ type: "chat.generate"
               meta: { model, duration, promptTokens, completionTokens }
```

### 2. Realtime WebRTC (POST /api/v1/chatbot/realtime/ephemeral-token)

```
Client Front
    │
    ├─> POST /ephemeral-token
    │   { userId, tenantId, conversationId }
    │
    ├─> OpenAI Realtime Sessions API
    │   └─> Response: { client_secret: { value: "ek_...", expires_at } }
    │
    └─> Microservice
        │
        ├─> SessionUsage.create
        │   ├─ channel: "realtime"
        │   ├─ startAt = now()
        │   └─ sessionId = généré
        │
        └─> EventUsage.create
            └─ type: "realtime.token_issued"
               meta: { expiresInSec }
```

### 3. Realtime Metrics (POST /api/v1/chatbot/realtime/metrics/*)

```
Client Front (WebRTC SDK)
    │
    ├─> ICE Connected → POST /metrics/webrtc
    │   { sessionId, userId, sdpOfferSize, iceConnectMs, ... }
    │   └─> EventUsage.create (type: "webrtc.metrics")
    │
    ├─> VAD Segment → POST /metrics/vad
    │   { sessionId, speechSegments, totalSpeechMs, bargeInCount, ... }
    │   └─> EventUsage.create (type: "vad.metrics")
    │
    ├─> Audio Stats → POST /metrics/audio (périodique)
    │   { sessionId, inputMs, outputMs, jitterMs, ... }
    │   └─> EventUsage.create (type: "audio.metrics")
    │
    └─> Session End → POST /session/end
        { sessionId, userId, tokensIn, tokensOut, model }
        │
        ├─> SessionUsage.updateMany
        │   ├─ endAt = now()
        │   ├─ tokensIn/Out = fournis
        │   └─ totalCost = calculé
        │
        ├─> UserUsage.update (cumul)
        │   └─ tokensIn/Out/Cost ajoutés
        │
        └─> EventUsage.create
            └─ type: "realtime.session_end"
```

### 4. Tools Execution (POST /api/v1/chatbot/tools/execute)

```
Client Front (via OpenAI Realtime tool call)
    │
    ├─> POST /tools/execute
    │   { name, arguments, sessionId, userId }
    │
    ├─> executeTool(name, args, { userId })
    │   └─> Résultat retourné
    │
    └─> EventUsage.create
        └─ type: "tool.execute"
           meta: { name, args, latency }
```

## 📈 Types d'Événements Collectés

### Events Par Canal

| Type | Channel | Description | Meta Fields |
|------|---------|------------|-------------|
| `chat.generate` | chat | Génération texte REST | model, duration, promptTokens, completionTokens |
| `realtime.token_issued` | realtime | Token éphémère créé | expiresInSec |
| `realtime.session_end` | realtime | Session terminée | tokensIn, tokensOut |
| `webrtc.metrics` | realtime | Connexion WebRTC établie | sdpOfferSize, sdpAnswerSize, iceConnectMs, iceGatheringMs, networkType |
| `vad.metrics` | realtime | Statistiques VAD | speechSegments, totalSpeechMs, totalSilenceMs, bargeInCount, avgUtteranceMs |
| `audio.metrics` | realtime | Statistiques audio | inputMs, outputMs, jitterMs, droppedFrames, ttsChars, sttTokens |
| `tool.execute` | both | Exécution d'un tool | name, args, latency |

## 🔗 Relations Implicites

```
UserUsage (userId="u1", channel="chat")
    │
    └─> SessionUsage (userId="u1", channel="chat", conversationId="conv_123")
            │
            └─> EventUsage (sessionId="sess_...", type="chat.generate")
                  └─> EventUsage (sessionId="sess_...", type="tool.execute")
```

```
UserUsage (userId="u1", channel="realtime")
    │
    └─> SessionUsage (userId="u1", channel="realtime", sessionId="sess_...")
            │
            ├─> EventUsage (type="realtime.token_issued")
            ├─> EventUsage (type="webrtc.metrics")
            ├─> EventUsage (type="vad.metrics")
            ├─> EventUsage (type="audio.metrics") [plusieurs]
            └─> EventUsage (type="realtime.session_end")
```

## 📊 Agrégations et Requêtes Typiques

### Requête 1: Coût total par utilisateur (derniers 30 jours)
```sql
SELECT 
  userId,
  SUM(totalCost) as total_cost,
  SUM(requests) as total_requests,
  SUM(totalTokens) as total_tokens
FROM "UserUsage"
WHERE lastSeen >= NOW() - INTERVAL '30 days'
GROUP BY userId
ORDER BY total_cost DESC;
```

### Requête 2: Sessions actives (non terminées)
```sql
SELECT id, userId, sessionId, conversationId, startAt, model
FROM "SessionUsage"
WHERE endAt IS NULL
ORDER BY startAt DESC;
```

### Requête 3: Événements par type (dernière heure)
```sql
SELECT type, COUNT(*) as count, MAX(ts) as last_occurrence
FROM "EventUsage"
WHERE ts >= NOW() - INTERVAL '1 hour'
GROUP BY type
ORDER BY count DESC;
```

### Requête 4: Latence moyenne WebRTC par session
```sql
SELECT 
  sessionId,
  AVG((meta->>'iceConnectMs')::int) as avg_ice_connect_ms,
  AVG((meta->>'iceGatheringMs')::int) as avg_ice_gathering_ms
FROM "EventUsage"
WHERE type = 'webrtc.metrics'
GROUP BY sessionId;
```

## 🎯 Points Clés

1. **UserUsage**: Agrégations par utilisateur + canal (cumulatif, mis à jour à chaque requête)
2. **SessionUsage**: Une ligne par session (chat ou realtime), clôturée avec tokens/cost finaux
3. **EventUsage**: Traces temporelles détaillées (tous les événements, métriques, outils)

### Conservation des Données
- ✅ **Rétention**: À vie (pas de purge automatique)
- ✅ **Performance**: Index recommandés sur `userId`, `sessionId`, `type`, `ts`

### Extension Future
Le champ `meta: Json` permet d'ajouter des métriques sans migration :
- Nouvelles métriques WebRTC
- Statistiques custom
- Tags/annotations



