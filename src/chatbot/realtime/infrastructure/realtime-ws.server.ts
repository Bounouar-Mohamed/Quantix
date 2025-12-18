/**
 * Serveur WebSocket pour Realtime AI
 * Gère le proxy vers OpenAI Realtime API
 */

import WebSocket from 'ws';
import { Server } from 'http';
import OpenAI, { toFile } from 'openai';
import { defaultProfile } from '../../../ai/modelProfile';
import { buildRealtimeSessionUpdate } from '../ai/transports/openaiRealtime';
import { executeTool } from '../ai/toolRegistry';
import { ChatService } from '../ai/services/chatService';
import { generateTTS } from '../ai/services/ttsService';
import { 
    forwardAssistantText, 
    forwardAssistantAudioDelta, 
    forwardAssistantCitations, 
    forwardUserTranscript 
} from '../ai/eventRouter';

/**
 * Interface pour une connexion Realtime
 */
interface RealtimeConnection {
    userId: string;
    threadId: string;
    conversationId?: string; // Pour journalisation dans thread
    tenantId?: string; // Pour isolation multi-tenant
    assistantThreadId?: string; // ID thread OpenAI
    openaiWs: WebSocket;
    connectedAt: Date;
}

interface UserSTTState {
    pcmChunks: Buffer[];
    sampleRate: number;
    hasReceivedTranscription: boolean;
    lastTranscript?: string; // Pour le fallback REST
    accumulatedTranscript?: string; // Accumulateur de deltas
    responseGenerationStarted?: boolean; // Flag pour éviter double génération
}


/**
 * Serveur WebSocket pour Realtime
 */
export class RealtimeWebSocketServer {
    private wss: WebSocket.Server;
    private connections = new Map<WebSocket, RealtimeConnection>();
    private userSTTStates = new Map<string, UserSTTState>();
    private openai: OpenAI;
    private chatService: ChatService;

    constructor(server: Server) {
        this.wss = new WebSocket.Server({
            server,
            path: process.env.REALTIME_WS_PATH || '/realtime',
        });

        // Initialiser OpenAI
        if (!process.env.OPENAI_API_KEY) {
            throw new Error('OPENAI_API_KEY manquante');
        }

        this.openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
        });

        // Initialiser le service Chat
        this.chatService = new ChatService(this.openai);

        this.setupEventHandlers();

        console.log('✅ Serveur WebSocket Realtime initialisé sur /realtime');
        
        // Log état de la recherche web
        const webSearchEnabled = process.env.WEB_SEARCH_ENABLED === 'true';
        const hasGoogleApiKey = !!process.env.GOOGLE_CUSTOM_SEARCH_API_KEY;
        const hasGoogleEngineId = !!process.env.GOOGLE_CUSTOM_SEARCH_ENGINE_ID;
        
        if (webSearchEnabled) {
            console.log('🔍 Recherche web: ACTIVÉE');
            if (hasGoogleApiKey && hasGoogleEngineId) {
                console.log('   ✅ Google Custom Search configuré');
            } else {
                console.warn('   ⚠️ GOOGLE_CUSTOM_SEARCH_API_KEY ou GOOGLE_CUSTOM_SEARCH_ENGINE_ID manquants');
            }
        } else {
            console.log('🔍 Recherche web: DÉSACTIVÉE');
        }
    }

    /**
     * Configuration des handlers
     */
    private setupEventHandlers() {
        this.wss.on('connection', (clientWs: WebSocket, req) => {
            this.handleConnection(clientWs, req);
        });
    }

    /**
     * NOTE: La journalisation des messages Realtime dans le thread est maintenant gérée par le FRONT.
     * 
     * Le front se connecte directement à OpenAI Realtime (WebRTC) donc le serveur ne voit pas les événements.
     * Le front doit POSTer vers /api/v1/assistants/thread/messages pour chaque événement :
     * - input_transcription.completed → role: 'user'
     * - response.completed → role: 'assistant'
     * 
     * Voir FRONT_REALTIME_INTEGRATION.md pour les détails d'intégration front.
     * 
     * Cette méthode n'est plus utilisée mais conservée pour référence.
     */
    private async journalizeMessage(
        conversationId: string,
        role: 'user' | 'assistant',
        content: string,
        tenantId?: string
    ): Promise<void> {
        // Désactivé : le front journalise directement via POST /assistants/thread/messages
        console.warn(`⚠️ journalizeMessage appelée mais désactivée - le front doit journaliser directement`);
    }

    /**
     * Gérer une nouvelle connexion
     */
    private async handleConnection(clientWs: WebSocket, req: any) {
        try {
            // Extraire les paramètres depuis l'URL
            const url = new URL(req.url, `http://${req.headers.host}`);
            const threadId = url.searchParams.get('threadId');
            const userId =
                url.searchParams.get('userId') ??
                url.searchParams.get('conversationId') ??
                undefined;
            const conversationId = url.searchParams.get('conversationId') || userId;
            const assistantThreadId = url.searchParams.get('assistant_thread_id') || undefined;
            const tenantId = url.searchParams.get('tenantId') || undefined;

            if (!threadId || !userId) {
                clientWs.close(1008, 'threadId et userId requis');
                return;
            }

            console.log(`✅ Connexion Realtime: userId=${userId}, threadId=${threadId}, conversationId=${conversationId}, tenantId=${tenantId}`);

            // Ouvrir WebSocket vers OpenAI - le modèle détecte automatiquement la langue
            const openaiWs = await this.openOpenAIConnection(threadId);

            // Stocker la connexion
            this.connections.set(clientWs, {
                userId,
                threadId,
                conversationId,
                tenantId,
                assistantThreadId,
                openaiWs,
                connectedAt: new Date(),
            });

            // Proxy bidirectionnel
            this.setupProxy(clientWs, openaiWs, userId, threadId, conversationId);

            // Confirmer la connexion
            clientWs.send(JSON.stringify({
                type: 'connected',
                threadId,
                timestamp: new Date(),
            }));
        } catch (error) {
            console.error(`❌ Erreur connexion: ${error.message}`);
            clientWs.close(1011, 'Erreur serveur');
        }
    }

    /**
     * Ouvrir WebSocket vers OpenAI
     * @param threadId - ID du thread
     */
    private async openOpenAIConnection(threadId: string): Promise<WebSocket> {
        const model = process.env.OPENAI_MODEL_REALTIME || 'gpt-realtime-mini';

        const wsUrl = `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(model)}`;
        const ws = new WebSocket(wsUrl, {
            headers: {
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                'OpenAI-Beta': 'realtime=v1',
            },
        });

        return new Promise((resolve, reject) => {
            ws.on('open', () => {
                console.log(`✅ Connexion OpenAI ouverte pour thread: ${threadId}`);

                // ═══════════════════════════════════════════════════════════════════════════
                // REALTIME: Configuration multilingue - le modèle détecte automatiquement la langue
                // ═══════════════════════════════════════════════════════════════════════════
                const sessionConfig = buildRealtimeSessionUpdate(defaultProfile);

                // Log la configuration envoyée (premiers 200 chars des instructions pour debug)
                console.log(`📤 Configuration session multilingue envoyée à OpenAI:`);
                console.log(`   Instructions length: ${sessionConfig.session.instructions.length} chars`);
                console.log(`   Instructions preview: ${sessionConfig.session.instructions.substring(0, 200)}...`);

                ws.send(JSON.stringify(sessionConfig));

                // Résoudre immédiatement pour continuer
                resolve(ws);
            });

            ws.on('error', (error) => {
                console.error(`❌ Erreur OpenAI WebSocket: ${error.message}`);
                reject(error);
            });
        });
    }


    /**
     * Convertir PCM16 en WAV
     */
    private pcm16ToWav(pcm: Buffer, sampleRate = 24000, channels = 1): Buffer {
        const byteRate = sampleRate * channels * 2;
        const blockAlign = channels * 2;
        const wav = Buffer.alloc(44 + pcm.length);

        wav.write('RIFF', 0);
        wav.writeUInt32LE(36 + pcm.length, 4);
        wav.write('WAVE', 8);
        wav.write('fmt ', 12);
        wav.writeUInt32LE(16, 16); // PCM
        wav.writeUInt16LE(1, 20);  // PCM
        wav.writeUInt16LE(channels, 22);
        wav.writeUInt32LE(sampleRate, 24);
        wav.writeUInt32LE(byteRate, 28);
        wav.writeUInt16LE(blockAlign, 32);
        wav.writeUInt16LE(16, 34); // bits per sample
        wav.write('data', 36);
        wav.writeUInt32LE(pcm.length, 40);
        pcm.copy(wav, 44);
        return wav;
    }

    /**
     * Configurer le proxy bidirectionnel
     */
    private setupProxy(
        clientWs: WebSocket,
        openaiWs: WebSocket,
        userId: string,
        threadId: string,
        conversationId?: string,
    ) {
        // État STT pour cette connexion
        const stateKey = `${userId}_${threadId}`;
        if (!this.userSTTStates.has(stateKey)) {
            this.userSTTStates.set(stateKey, {
                pcmChunks: [],
                sampleRate: 24000,
                hasReceivedTranscription: false,
                accumulatedTranscript: '',
                responseGenerationStarted: false,
            });
        }
        const sttState = this.userSTTStates.get(stateKey)!;

        // Realtime audio activé (streaming natif selon doc officielle)
        const realtimeGenEnabled = true; // ✅ Active response.create et audio streaming

        // Etats de tour
        let aiSpeaking = false;
        let awaitingResponse = false;
        let pendingResponseAfterCommit = false; // Flag pour créer une réponse après l'item
        let hasRetriedThisTurn = false; // Flag pour éviter les retries infinis
        const textByResp = new Map<string, string>();
        const audioTranscriptByResp = new Map<string, string>(); // Pour audio_transcript
        const responseStartTimes = new Map<string, string>(); // Timestamp de début de chaque réponse
        const userSpeechStartTimes = new Map<string, string>(); // Timestamp de début de chaque entrée utilisateur
        
        // Store pour function_calls
        type FuncCallAcc = { name?: string; args: string; toolCallId?: string };
        const funcCalls = new Map<string, FuncCallAcc>(); // key = item_id
        
        // Flags pour éviter double voix
        let seenRealtimeAudio = false;
        let sentRestTTS = false;

        // Détection micro muet pour économie
        // ⚠️ DÉSACTIVÉ pour garantir l'audio : garder ["audio","text"] en continu
        let microMuetTimer: NodeJS.Timeout | null = null;
        let audioMode = true; // true = audio+text, false = text only
        const MICRO_MUET_DELAY = 10000; // 10 secondes d'inactivité = text only
        const MICRO_MUET_ENABLED = false; // 👈 DÉSACTIVÉ pour éviter l'interruption audio

        // Fonction pour basculer entre audio+text et text only
        const updateModalities = async (enableAudio: boolean) => {
            if (enableAudio === audioMode) return; // Pas de changement

            audioMode = enableAudio;
            const modes = enableAudio ? ['audio', 'text'] : ['text'];

            console.log(`🔀 Bascule modalities: ${modes.join(', ')}`);

            try {
                openaiWs.send(JSON.stringify({
                    type: 'session.update',
                    session: {
                        modalities: modes,
                    }
                }));
            } catch (e) {
                console.error('❌ Erreur update modalities:', e);
            }
        };

        // Annuler le timer de micro muet
        const cancelMicroMuetTimer = () => {
            if (microMuetTimer) {
                clearTimeout(microMuetTimer);
                microMuetTimer = null;
                console.log('🔄 Timer micro muet annulé (utilisateur actif)');
            }
        };

        // Démarrer le timer de micro muet
        const startMicroMuetTimer = () => {
            if (!MICRO_MUET_ENABLED) return; // 👈 Désactivé
            
            cancelMicroMuetTimer();

            microMuetTimer = setTimeout(() => {
                if (!aiSpeaking && !awaitingResponse && MICRO_MUET_ENABLED) {
                    console.log('🔇 Micro muet détecté → bascule text-only (économie)');
                    updateModalities(false); // Text only
                }
            }, MICRO_MUET_DELAY);
        };

        // Client → OpenAI
        clientWs.on('message', async (data: Buffer) => {
            try {
                if (openaiWs.readyState === WebSocket.OPEN) {
                    const message = JSON.parse(data.toString());
                    
                    // Whitelist stricte des types autorisés vers OpenAI
                    const allowedToOpenAI = new Set([
                        'session.update',
                        'transcription_session.update',
                        'input_audio_buffer.append',
                        'input_audio_buffer.commit',
                        'input_audio_buffer.clear',
                        'conversation.item.create',
                        'conversation.item.truncate',
                        'conversation.item.delete',
                        'conversation.item.retrieve',
                        'response.create',
                        'response.cancel',
                    ]);
                    
                    if (!allowedToOpenAI.has(message.type)) {
                        console.log(`⚠️ Message ignoré (non autorisé): ${message.type}`);
                        return; // Ne pas forwarder les messages non autorisés
                    }
                    
                    console.log(`📤 Client → OpenAI: ${message.type || 'unknown'}`);

                    // Log détaillé du message envoyé (sauf pour l'audio qui est trop long)
                    if (message.type !== 'input_audio_buffer.append') {
                        console.log(`   Message envoyé: ${JSON.stringify(message)}`);
                    }

                    if (message.type === 'input_audio_buffer.append' && message.audio) {
                        // Ne PAS dropper les append - laisser le VAD serveur gérer
                        // Le filtrage automatique est géré par le VAD serveur
                        // Accumuler les chunks PCM
                        const pcm = Buffer.from(message.audio, 'base64');
                        sttState.pcmChunks.push(pcm);

                        const audioMessage = {
                            type: 'input_audio_buffer.append',
                            audio: message.audio,
                        };

                        console.log(`🎤 Formatant audio pour OpenAI: ${message.audio.substring(0, 50)}...`);
                        openaiWs.send(JSON.stringify(audioMessage));

                    } else if (message.type === 'input_audio_buffer.commit') {
                        // En VAD serveur + création auto, on laisse le serveur committer
                        const useServerVAD = true; // Aligné avec session.update
                        if (!useServerVAD) {
                            console.log('📤 Client → OpenAI: input_audio_buffer.commit');
                            openaiWs.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
                            awaitingResponse = true;
                            pendingResponseAfterCommit = realtimeGenEnabled;
                            sttState.hasReceivedTranscription = false;
                        } else {
                            console.log('⏭️ Commit client ignoré (server_vad actif)');
                        }

                    } else if (message.type === 'input_audio_buffer.speech_started') {
                        console.log('🎤 Speech started - cancel response (seulement si IA en parle)');
                        // Ne pas envoyer response.cancel ici, sera fait dans openaiWs.on('message')
                    } else {
                        openaiWs.send(JSON.stringify(message));
                    }
                } else {
                    clientWs.send(JSON.stringify({
                        type: 'error',
                        message: 'Connexion OpenAI fermée',
                    }));
                }
            } catch (error) {
                console.error(`❌ Erreur traitement message: ${error.message}`);
            }
        });

        // OpenAI → Client
        openaiWs.on('message', async (data: Buffer) => {
            try {
                if (clientWs.readyState === WebSocket.OPEN) {
                    const message = JSON.parse(data.toString());

                    // Filtrer les logs d'entrée pour response.* si Realtime désactivé
                    const isRealtimeResponseEvent =
                        typeof message.type === 'string' && message.type.startsWith('response.');

                    if (realtimeGenEnabled || !isRealtimeResponseEvent) {
                        console.log(`📥 OpenAI → Client: ${message.type || 'unknown'}`);
                    }

                    // Vérifier le modèle utilisé
                    if (message.type === 'session.updated') {
                        console.log('🔎 Session model:', message.session?.model);
                        console.log('🔎 Session modals:', message.session?.modalities);
                    }

                    // Log détaillé du message (seulement si ce n'est pas un event response.* ou si Realtime enabled)
                    if (realtimeGenEnabled || !isRealtimeResponseEvent) {
                        if (message.item_id) {
                            console.log(`   item_id: ${message.item_id}`);
                        }
                        if (message.event_id) {
                            console.log(`   event_id: ${message.event_id}`);
                        }
                        if (message.hasAudio !== undefined) {
                            console.log(`   hasAudio: ${message.hasAudio}`);
                        }
                        if (message.hasTranscript !== undefined) {
                            console.log(`   hasTranscript: ${message.hasTranscript}`);
                        }
                        if (message.hasDelta !== undefined) {
                            console.log(`   hasDelta: ${message.hasDelta}`);
                        }
                        if (message.delta) {
                            console.log(`   delta: ${JSON.stringify(message.delta).substring(0, 100)}`);
                        }
                        if (message.transcript) {
                            console.log(`   transcript: ${message.transcript}`);
                        }
                        if (message.text) {
                            console.log(`   text: ${message.text}`);
                        }
                        if (message.audio) {
                            console.log(`   audio length: ${message.audio.length} bytes`);
                        }
                    }

                    if (message.response && realtimeGenEnabled) {
                        console.log(`   response: ${JSON.stringify(message.response).substring(0, 200)}`);
                        // Afficher les erreurs complètes
                        if (message.response.status === 'failed' || message.response.status === 'error') {
                            console.log(`❌ ERREUR OPENAI: ${JSON.stringify(message.response.status_details || message.response.error)}`);
                        }
                    }
                    if (message.error) {
                        // Ne pas logger les erreurs response_cancel_not_active
                        if (message.error.code !== 'response_cancel_not_active') {
                            if (realtimeGenEnabled) {
                                console.log(`❌ ERREUR MESSAGE: ${JSON.stringify(message.error)}`);
                            }
                        }
                    }

                    // Assembler le texte assistant via deltas (texte brut)
                    if (message.type === 'response.output_text.delta') {
                        const id = message.response_id;
                        textByResp.set(id, (textByResp.get(id) ?? '') + (message.delta ?? ''));
                    }
                    if (message.type === 'response.output_text.done') {
                        const id = message.response_id;
                        const full = textByResp.get(id) ?? '';
                        textByResp.delete(id);
                        
                        // NOTE: La journalisation est maintenant gérée par le FRONT.
                        // Le front doit POSTer vers /api/v1/assistants/thread/messages après response.completed.
                        // Voir FRONT_REALTIME_INTEGRATION.md
                        
                        clientWs.send(JSON.stringify({
                            type: 'assistant.text',
                            text: full,
                            responseId: id,
                            timestamp: new Date().toISOString()
                        }));
                    }

                    // Assembler la transcription audio en temps réel
                    if (message.type === 'response.audio_transcript.delta' || message.type === 'response.output_audio_transcript.delta') {
                        const id = message.response_id;
                        const current = audioTranscriptByResp.get(id) ?? '';
                        const updated = current + (message.delta ?? '');
                        audioTranscriptByResp.set(id, updated);
                        console.log(`📝 Transcript audio delta: "${message.delta}"`);
                    }
                    if (message.type === 'response.audio_transcript.done' || message.type === 'response.output_audio_transcript.done') {
                        const id = message.response_id;
                        const full = audioTranscriptByResp.get(id) ?? '';
                        const startTime = responseStartTimes.get(id); // Récupérer le timestamp de début
                        audioTranscriptByResp.delete(id);
                        console.log(`✅ Transcript audio complet: "${full}"`);
                        
                        // Journaliser dans le thread si conversationId disponible
                        const connection = this.connections.get(clientWs);
                        if (connection?.conversationId && full.trim().length > 0) {
                            // Journaliser en arrière-plan (non bloquant)
                            this.journalizeMessage(connection.conversationId, 'assistant', full).catch((err) => {
                                console.warn(`⚠️ Erreur journalisation transcript assistant: ${err.message}`);
                            });
                        }
                        
                        // Envoyer le texte transcrit au client avec le timestamp de début
                        // Paramètres: ws, text, responseId?, source?, timestamp?
                        forwardAssistantText(clientWs, full, id, undefined, startTime);
                        // Nettoyer le timestamp
                        if (startTime) {
                            responseStartTimes.delete(id);
                        }
                    }

                    // STREAMING AUDIO Realtime (selon doc officielle)
                    if (message.type === 'response.output_audio.delta' || message.type === 'response.audio.delta') {
                        // message.audio est base64 PCM16
                        if (message.audio) {
                            seenRealtimeAudio = true; // ✅ Marquer qu'on a vu l'audio Realtime
                            console.log(`🔊 Audio delta reçu (${message.audio.length} bytes)`);
                            try {
                                forwardAssistantAudioDelta(clientWs, message.audio, message.response_id);
                                console.log(`✅ Événement assistant.audio.delta envoyé au client`);
                            } catch (error) {
                                console.error(`❌ Erreur envoi audio delta:`, error);
                            }
                        } else {
                            console.warn(`⚠️ Audio delta sans audio data`);
                        }
                    }

                    if (message.type === 'response.output_audio.done' || message.type === 'response.audio.done') {
                        console.log('✅ Audio streaming terminé');
                        clientWs.send(JSON.stringify({
                            type: 'assistant.audio.done',
                            responseId: message.response_id,
                            timestamp: new Date().toISOString()
                        }));
                    }

                    // Si OpenAI commit (VAD serveur)
                    if (message.type === 'input_audio_buffer.committed') {
                        sttState.hasReceivedTranscription = false;
                        awaitingResponse = true;
                        // Le VAD serveur va créer la réponse automatiquement (create_response: true)
                    }

                    // Log conversation item (pour debug)
                    if (message.type === 'conversation.item.created') {
                        console.log('💬 Item utilisateur créé - Le VAD serveur va générer la réponse automatiquement');
                        // NE PAS créer response.create manuellement
                        // Le serveur avec create_response:true le fait automatiquement
                    }

                    // Gestion des tool calls (fonctions) - FLUX "function_call" (Realtime standard)
                    // Handler 1: Nouveau function_call détecté
                    if (message.type === 'response.output_item.added' && message.item?.type === 'function_call') {
                        const { id: itemId, name, call_id: toolCallId } = message.item;
                        console.log(`🧰 function_call ajouté: ${name}, itemId: ${itemId}, toolCallId: ${toolCallId}`);
                        funcCalls.set(itemId, { name, args: '', toolCallId });
                    }
                    
                    // Handler 2: Accumuler les arguments JSON
                    if (message.type === 'response.function_call_arguments.delta') {
                        const itemId = message.item_id;
                        const acc = funcCalls.get(itemId) || { args: '' };
                        acc.args += (message.delta || '');
                        funcCalls.set(itemId, acc);
                    }
                    
                    // Handler 3: Exécuter le function_call quand terminé
                    if (message.type === 'response.function_call_arguments.done') {
                        const itemId = message.item_id;
                        const acc = funcCalls.get(itemId);
                        
                        if (!acc) {
                            console.warn('⚠️ function_call terminé sans accumulateur');
                        } else {
                            const { name, args } = acc;
                            console.log(`✅ function_call terminé: ${name}, args: ${args.substring(0, 100)}...`);
                            
                            // Exécuter le tool via le registre
                            (async () => {
                                try {
                                    // Exécuter le tool via le registre
                                    let output: any = { error: 'unsupported_function' };
                                    
                                    try {
                                        const toolArgs = JSON.parse(args || '{}');
                                        output = await executeTool(name, toolArgs, { userId });
                                        
                                        // Envoyer les citations pour web_search et web_open
                                        if (name === 'web_search' && process.env.WEB_SEARCH_ENABLED === 'true' && output.results) {
                                            forwardAssistantCitations(clientWs, output.results);
                                        } else if (name === 'web_open' && process.env.WEB_SEARCH_ENABLED === 'true' && output) {
                                            forwardAssistantCitations(clientWs, [output]);
                                        }
                                    } catch (toolError) {
                                        console.error(`❌ Erreur exécution tool ${name}:`, toolError);
                                        output = { error: toolError.message || 'tool_execution_error' };
                                    }
                                    
                                    // IMPORTANT: Utiliser toolCallId (pas itemId) pour le call_id
                                    const toolCallId = acc.toolCallId || itemId; // Fallback si manquant
                                    
                                    openaiWs.send(JSON.stringify({
                                        type: 'conversation.item.create',
                                        item: {
                                            type: 'function_call_output',
                                            call_id: toolCallId, // ✅ Le tool call ID (pas l'item ID)
                                            output: JSON.stringify(output),
                                        },
                                    }));
                                    
                                    console.log(`✅ function_call_output item créé pour ${name} (call_id: ${toolCallId})`);
                                    
                                    // Demander explicitement au modèle de continuer avec audio forcé
                                    openaiWs.send(JSON.stringify({
                                        type: 'response.create',
                                        response: { modalities: ['audio'] } // 👈 FORCER L'AUDIO
                                    }));
                                    
                                    console.log(`✅ response.create envoyé pour continuer`);
                                } catch (e: any) {
                                    console.error(`❌ Erreur function_call handler:`, e);
                                    
                                    // En cas d'erreur, utiliser le toolCallId correct
                                    const toolCallId = acc.toolCallId || itemId;
                                    
                                    openaiWs.send(JSON.stringify({
                                        type: 'conversation.item.create',
                                        item: {
                                            type: 'function_call_output',
                                            call_id: toolCallId, // ✅ Le tool call ID correct
                                            output: JSON.stringify({ error: e?.message || 'tool_error' }),
                                        },
                                    }));
                                    
                                    // Demander au modèle de continuer même en cas d'erreur
                                    openaiWs.send(JSON.stringify({
                                        type: 'response.create',
                                        response: { modalities: ['audio'] } // 👈 FORCER L'AUDIO
                                    }));
                                } finally {
                                    funcCalls.delete(itemId);
                                }
                            })();
                        }
                    }

                    // ❌ Bloc "tool_use" supprimé pour éviter double exécution
                    // On garde uniquement le flux "function_call" ci-dessus

                    // Barge-in: si l'utilisateur parle pendant que l'IA est en train de parler, annuler
                    if (message.type === 'response.created') {
                        // ⛔ Si on n'utilise pas Realtime, on ignore complètement cet event
                        if (!realtimeGenEnabled) {
                            return; // Ne pas traiter cet event du tout
                        }

                        // Enregistrer le timestamp de début de cette réponse
                        const responseId = message.response?.id || '';
                        if (responseId) {
                            responseStartTimes.set(responseId, new Date().toISOString());
                            console.log(`⏱️ Timestamp début réponse ${responseId}: ${responseStartTimes.get(responseId)}`);
                        }

                        const respModalities = message.response?.modalities || [];
                        aiSpeaking = Array.isArray(respModalities) && respModalities.includes('audio');
                        console.log(`✅ Réponse créée, modalities: ${JSON.stringify(respModalities)}, aiSpeaking: ${aiSpeaking}`);

                        // Réactiver l'audio si désactivé (pour entendre l'IA)
                        if (!audioMode && aiSpeaking) {
                            console.log('🔊 Réponse audio → réactivation audio immédiate');
                            updateModalities(true);
                            cancelMicroMuetTimer();
                        }
                    }

                    if (message.type === 'input_audio_buffer.speech_started') {
                        // Enregistrer le timestamp de début de la parole utilisateur
                        const itemId = message.item?.id || '';
                        if (itemId) {
                            userSpeechStartTimes.set(itemId, new Date().toISOString());
                            console.log(`⏱️ Timestamp début parole utilisateur ${itemId}: ${userSpeechStartTimes.get(itemId)}`);
                        }
                        
                        // nouveau tour utilisateur → nettoie le buffer
                        sttState.pcmChunks = [];
                        sttState.hasReceivedTranscription = false;
                        sttState.accumulatedTranscript = '';
                        sttState.responseGenerationStarted = false;
                        
                        // Barge-in assoupli : attendre 200ms avant d'annuler pour éviter les faux positifs
                        if (aiSpeaking) {
                            setTimeout(() => {
                                if (aiSpeaking && clientWs.readyState === WebSocket.OPEN) {
                            openaiWs.send(JSON.stringify({ type: 'response.cancel' }));
                            aiSpeaking = false;
                                    console.log('🛑 Barge-in: response.cancel envoyé à OpenAI (après délai)');
                                }
                            }, 200); // 200ms de délai pour confirmer la parole
                        }

                        // Réactiver l'audio si micro muet (économie) - seulement si activé
                        if (!audioMode && MICRO_MUET_ENABLED) {
                            console.log('🎤 Utilisateur parle → réactivation audio');
                            updateModalities(true);
                        }
                        cancelMicroMuetTimer(); // Annuler le timer
                    }

                    // Accumuler les deltas de transcription pour réponse rapide
                    if (message.type === 'conversation.item.input_audio_transcription.delta') {
                        const delta = message.delta || '';
                        if (!sttState.accumulatedTranscript) {
                            sttState.accumulatedTranscript = '';
                        }
                        sttState.accumulatedTranscript += delta;
                        
                        // ═══════════════════════════════════════════════════════════════════════════
                        // NOTE: Le modèle OpenAI Realtime détecte automatiquement la langue
                        // Pas besoin de mettre à jour la session - le modèle gère cela nativement
                        // ═══════════════════════════════════════════════════════════════════════════

                        // REST fallback anticipé (seulement si Realtime désactivé)
                        if (!sttState.responseGenerationStarted && sttState.accumulatedTranscript.length > 5 && !realtimeGenEnabled) {
                            sttState.responseGenerationStarted = true;
                            const startTime = Date.now();
                            console.log(`📤 Génération REST anticipée (${sttState.accumulatedTranscript.length} chars: "${sttState.accumulatedTranscript}")`);

                            (async () => {
                                try {
                                    const answer = await this.chatService.generateText(sttState.accumulatedTranscript);

                                    const genTime = Date.now() - startTime;
                                    console.log(`✅ Réponse REST générée en ${genTime}ms: "${answer.substring(0, 50)}..."`);

                                    if (clientWs.readyState === WebSocket.OPEN) {
                                        forwardAssistantText(clientWs, answer, undefined, 'rest');

                                        console.log('✅ Texte envoyé immédiatement');

                                        (async () => {
                                            try {
                                                const ttsStartTime = Date.now();
                                                console.log('🎤 Début génération TTS audio...');
                                                const audioBuffer = await generateTTS(answer, process.env.OPENAI_API_KEY || '');
                                                const ttsTime = Date.now() - ttsStartTime;

                                                if (audioBuffer && clientWs.readyState === WebSocket.OPEN) {
                                                    console.log(`✅ Audio TTS généré en ${ttsTime}ms (${audioBuffer.length} bytes)`);
                                                    try {
                                                        clientWs.send(JSON.stringify({
                                                            type: 'assistant.audio',
                                                            audio: audioBuffer.toString('base64'),
                                                            format: 'pcm16',
                                                            sampleRate: 24000,
                                                            source: 'rest-tts',
                                                            timestamp: new Date().toISOString(),
                                                        }));
                                                        console.log('✅ Audio envoyé au client');
                                                    } catch (sendError) {
                                                        console.error('❌ Erreur envoi audio:', sendError);
                                                    }
                                                } else if (!audioBuffer) {
                                                    console.warn('⚠️ Pas d\'audio généré (TTS failed)');
                                                }
                                            } catch (ttsError) {
                                                console.error('❌ Erreur génération TTS:', ttsError);
                                            }
                                        })();
                                    }

                                    awaitingResponse = false;
                                    aiSpeaking = false;
                                } catch (e) {
                                    console.error('❌ REST generation error:', e);
                                }
                            })();
                        }
                    }

                    // Détecter les événements de transcription utilisateur (completion)
                    if (message.type === 'conversation.item.input_audio_transcription.completed') {
                        console.log(`🔍 ÉVÉNEMENT TRANSCRIPTION COMPLETÉ: ${message.type}`);
                        sttState.hasReceivedTranscription = true;

                        const text = message.transcript || message.text || '';
                        if (text) {
                            console.log(`📤 Transcription Realtime reçue: "${text.substring(0, 50)}..."`);
                            
                            // ═══════════════════════════════════════════════════════════════════════════
                            // NOTE: Le modèle OpenAI Realtime détecte automatiquement la langue
                            // Pas besoin de mettre à jour la session - le modèle gère cela nativement
                            // ═══════════════════════════════════════════════════════════════════════════
                            
                            // Récupérer le timestamp de début de cette transcription
                            const itemId = message.item_id || '';
                            const startTime = itemId ? userSpeechStartTimes.get(itemId) : undefined;
                            
                            // Mémoriser la transcription pour le fallback REST
                            sttState.lastTranscript = text;

                            // NOTE: La journalisation est maintenant gérée par le FRONT.
                            // Le front doit POSTer vers /api/v1/assistants/thread/messages après transcription.
                            // Voir FRONT_REALTIME_INTEGRATION.md

                            // Envoyer au client pour affichage UI avec le bon timestamp
                            forwardUserTranscript(clientWs, text, startTime);
                            
                            // Nettoyer le timestamp
                            if (itemId && startTime) {
                                userSpeechStartTimes.delete(itemId);
                            }

                            // REST fallback (seulement si Realtime désactivé)
                            if (!sttState.responseGenerationStarted && !realtimeGenEnabled) {
                                sttState.responseGenerationStarted = true;
                                const startTime = Date.now();
                                console.log(`📤 Génération REST déclenchée après transcription complète`);
                                (async () => {
                                    try {
                                        const answer = await this.chatService.generateText(text);

                                        const genTime = Date.now() - startTime;
                                        console.log(`✅ Réponse REST générée en ${genTime}ms: "${answer.substring(0, 50)}..."`);

                                        if (clientWs.readyState === WebSocket.OPEN) {
                                            forwardAssistantText(clientWs, answer, undefined, 'rest');

                                            console.log('✅ Texte envoyé immédiatement');

                                            (async () => {
                                                try {
                                                    const ttsStartTime = Date.now();
                                                    console.log('🎤 Début génération TTS audio...');
                                                    const audioBuffer = await generateTTS(answer, process.env.OPENAI_API_KEY || '');
                                                    const ttsTime = Date.now() - ttsStartTime;

                                                    if (audioBuffer && clientWs.readyState === WebSocket.OPEN) {
                                                        console.log(`✅ Audio TTS généré en ${ttsTime}ms (${audioBuffer.length} bytes)`);
                                                        try {
                                                            clientWs.send(JSON.stringify({
                                                                type: 'assistant.audio',
                                                                audio: audioBuffer.toString('base64'),
                                                                format: 'pcm16',
                                                                sampleRate: 24000,
                                                                source: 'rest-tts',
                                                                timestamp: new Date().toISOString(),
                                                            }));
                                                            console.log('✅ Audio envoyé au client');
                                                        } catch (sendError) {
                                                            console.error('❌ Erreur envoi audio:', sendError);
                                                        }
                                                    } else if (!audioBuffer) {
                                                        console.warn('⚠️ Pas d\'audio généré (TTS failed)');
                                                    }
                                                } catch (ttsError) {
                                                    console.error('❌ Erreur génération TTS:', ttsError);
                                                }
                                            })();
                                        } else {
                                            console.warn('⚠️ Client déconnecté, réponse non envoyée');
                                        }

                                        awaitingResponse = false;
                                        aiSpeaking = false;
                                    } catch (e) {
                                        console.error('❌ REST generation error:', e);
                                    }
                                })();
                            }
                        }

                        // Reset l'accumulateur
                        sttState.accumulatedTranscript = '';
                        sttState.responseGenerationStarted = false;
                    }

                    // Détecter si la transcription Realtime a échoué
                    if (message.type === 'conversation.item.input_audio_transcription.failed') {
                        console.log('⚠️ Transcription Realtime échouée – fallback STT pour affichage UI');

                        // Déclencher immédiatement le fallback STT pour affichage UI seulement
                        if (sttState.pcmChunks.length > 0) {
                            try {
                                const pcmBuffer = Buffer.concat(sttState.pcmChunks);
                                const wavBuffer = this.pcm16ToWav(pcmBuffer, sttState.sampleRate);
                                const file = await toFile(wavBuffer, 'user.wav');
                                const transcription = await this.openai.audio.transcriptions.create({
                                    model: process.env.STT_FALLBACK_MODEL || 'gpt-4o-transcribe',
                                    file,
                                });
                                const text = (transcription as any).text || '';
                                console.log(`📤 Transcription STT (fallback sur erreur): "${text.substring(0, 50)}..."`);

                                // Envoyer au client POUR AFFICHAGE UI UNIQUEMENT
                                // Utiliser un timestamp approximatif pour le fallback
                                forwardUserTranscript(clientWs, text, new Date().toISOString());

                                // ❌ NE PAS injecter dans la conversation (déjà fait via audio)
                                // ❌ NE PAS créer de response.create
                            } catch (error) {
                                console.error('❌ Erreur STT fallback (sur erreur):', error);
                            } finally {
                                sttState.pcmChunks = [];
                            }
                        }
                    }

                    // Fin de réponse: réinitialiser l'état audio
                    if (message.type === 'response.done') {
                        // Ne plus faire de retry Realtime (génération via REST uniquement)
                        if (realtimeGenEnabled) {
                            console.log('🔚 Réponse terminée, réinitialisation état');
                        }

                        // Nettoyer les maps de texte/transcript
                        const responseId = message.response?.id;
                        if (responseId) {
                            textByResp.delete(responseId);
                            audioTranscriptByResp.delete(responseId);
                        }

                        sttState.pcmChunks = [];
                        sttState.hasReceivedTranscription = false;
                        sttState.accumulatedTranscript = '';
                        sttState.responseGenerationStarted = false;
                        awaitingResponse = false;
                        aiSpeaking = false;
                        pendingResponseAfterCommit = false; // Réinitialiser le flag
                        hasRetriedThisTurn = false; // Reset pour le prochain tour
                        
                        // Réinitialiser les flags pour éviter double voix
                        seenRealtimeAudio = false;
                        sentRestTTS = false;

                        // Démarrer le timer de micro muet (économie après inactivité)
                        startMicroMuetTimer();
                    }

                    // Fallback REST si Realtime échoue ET aucun audio Realtime n'a démarré
                    if ((message.type === 'error' || (message.type === 'response.done' && message.response?.status === 'failed')) &&
                        !seenRealtimeAudio && !sentRestTTS) {
                        const error = message.error || message.response?.status_details?.error;
                        if (error && realtimeGenEnabled) {
                            console.warn(`🚨 Realtime failed → REST fallback: ${error.message || 'unknown error'}`);
                            sentRestTTS = true; // Marquer qu'on a envoyé un TTS REST

                            // Générer avec REST
                            const userPrompt = sttState.lastTranscript || sttState.accumulatedTranscript || 'OK';

                            (async () => {
                                try {
                                    const answer = await this.chatService.generateText(userPrompt);

                                    if (clientWs.readyState === WebSocket.OPEN) {
                                        forwardAssistantText(clientWs, answer, undefined, 'rest-fallback');

                                        // TTS en arrière-plan
                                        (async () => {
                                            try {
                                                const audioBuffer = await generateTTS(answer, process.env.OPENAI_API_KEY || '');
                                                if (audioBuffer && clientWs.readyState === WebSocket.OPEN) {
                                                    clientWs.send(JSON.stringify({
                                                        type: 'assistant.audio',
                                                        audio: audioBuffer.toString('base64'),
                                                        format: 'pcm16',
                                                        sampleRate: 24000,
                                                        source: 'rest-tts',
                                                        timestamp: new Date().toISOString(),
                                                    }));
                                                }
                                            } catch (e) {
                                                console.error('❌ REST TTS fallback error:', e);
                                            }
                                        })();
                                    }
                                } catch (e) {
                                    console.error('❌ REST fallback error:', e);
                                }
                            })();
                        }
                    }

                    // Ne pas relayer les events response.* au front quand Realtime est désactivé
                    if (!realtimeGenEnabled && isRealtimeResponseEvent) {
                        return;
                    }

                    // Ne pas relayer les erreurs response_cancel_not_active
                    if (message.type === 'error' && message.error?.code === 'response_cancel_not_active') {
                        return;
                    }
                    
                    // ⚠️ IMPORTANT: Ne jamais bloquer les événements Realtime
                    // Les handlers spécialisés les traitent et les transforment en events custom
                    // Le blocking des events arrive APRÈS le traitement par les handlers
                    const isRealtimeEvent = typeof message.type === 'string' && message.type.startsWith('response.');
                    const isAudioEvent = message.type === 'response.output_audio.delta' || 
                                         message.type === 'response.audio.delta' ||
                                         message.type === 'response.output_audio.done' ||
                                         message.type === 'response.audio.done' ||
                                         message.type === 'response.audio_transcript.delta' ||
                                         message.type === 'response.output_audio_transcript.delta' ||
                                         message.type === 'response.audio_transcript.done' ||
                                         message.type === 'response.output_audio_transcript.done';
                    
                    // Les handlers audio sont appelés AVANT ce bloc
                    // Donc on bloque l'envoi brut SAUF pour les events audio qui doivent passer
                    // Mieux: ne bloquer QUE les événements qui sont déjà gérés par nos handlers custom
                    if (isRealtimeEvent && realtimeGenEnabled && !isAudioEvent) {
                        // On a déjà traité l'event dans les handlers ci-dessus (assistant.text, assistant.audio.delta, etc.)
                        // Ne pas envoyer l'event brut à nouveau
                        return;
                    }

                    // Transférer vers le client (seulement les événements non-Realtime ou nécessaires)
                    // ✅ BUG FIX: Envoyer JSON string, pas objet brut
                    clientWs.send(JSON.stringify(message));
                }
            } catch (error) {
                console.error(`❌ Erreur transfert réponse: ${error.message}`);
            }
        });

        // Keep-alive (ping périodique)
        const pingInterval = setInterval(() => {
            try {
                if (clientWs.readyState === WebSocket.OPEN) {
                    clientWs.ping();
                }
                if (openaiWs.readyState === WebSocket.OPEN) {
                    openaiWs.ping();
                }
            } catch { }
        }, 30000);

        // Gérer la fermeture
        clientWs.on('close', () => {
            console.log(`🔌 Fermeture connexion client: ${userId}`);
            clearInterval(pingInterval);
            cancelMicroMuetTimer(); // Nettoyer le timer

            if (openaiWs.readyState === WebSocket.OPEN) {
                openaiWs.close();
            }

            // Nettoyer l'état STT
            this.userSTTStates.delete(stateKey);

            this.connections.delete(clientWs);
        });

        openaiWs.on('close', () => {
            console.log(`🔌 Fermeture connexion OpenAI pour thread: ${threadId}`);
            clearInterval(pingInterval);
            cancelMicroMuetTimer(); // Nettoyer le timer

            if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.close();
            }

            // Nettoyer l'état STT
            this.userSTTStates.delete(stateKey);

            this.connections.delete(clientWs);
        });
    }

    /**
     * Obtenir les stats d'une connexion
     */
    getConnectionStats(userId: string, threadId: string) {
        const connection = Array.from(this.connections.values()).find(
            conn => conn.userId === userId && conn.threadId === threadId
        );

        return connection ? {
            userId,
            threadId,
            connected: true,
            connectedAt: connection.connectedAt,
            duration: Date.now() - connection.connectedAt.getTime(),
        } : null;
    }

    /**
     * Obtenir toutes les connexions actives
     */
    getAllConnections() {
        return Array.from(this.connections.values()).map(conn => ({
            userId: conn.userId,
            threadId: conn.threadId,
            connectedAt: conn.connectedAt,
            duration: Date.now() - conn.connectedAt.getTime(),
        }));
    }

    /**
     * Fermer toutes les connexions
     */
    closeAll() {
        this.connections.forEach((conn, key) => {
            conn.openaiWs.close();
            this.connections.delete(key);
        });

        this.wss.close();
    }
}