/**
 * Adaptateur OpenAI Realtime API
 * Transforme le profil de modèle en configuration de session WebSocket
 */

import { ModelProfile } from "../modelProfile";

export interface RealtimeSessionConfig {
    type: "session.update";
    session: {
        model: string;
        temperature: number;
        voice?: string;
        modalities: string[];
        instructions: string;
        tools: Array<{
            type: "function";
            name: string;
            description: string;
            parameters: any;
        }>;
        turn_detection: {
            type: "server_vad";
            threshold: number;
            prefix_padding_ms: number;
            silence_duration_ms: number;
            create_response: boolean;
            interrupt_response: boolean;
        };
        input_audio_transcription: {
            enabled?: boolean;
            model: string;
        };
        input_audio_format: string;
        output_audio_format: string;
    };
}

/**
 * Construire la configuration de session Realtime à partir d'un profil de modèle
 */
export function buildRealtimeSessionUpdate(profile: ModelProfile): RealtimeSessionConfig {
    return {
        type: "session.update",
        session: {
            model: profile.id,
            temperature: profile.temperature,
            voice: profile.voice,
            modalities: profile.modalities,
            instructions: profile.instructions,
            tools: profile.tools.map(t => ({
                type: "function",
                name: t.name,
                description: t.description,
                parameters: t.parameters
            })),
            turn_detection: {
                type: "server_vad",
                threshold: 0.5,  // Seuil plus bas pour réactivité
                prefix_padding_ms: 250,
                silence_duration_ms: 500,  // Silence plus court
                create_response: false,  // ❌ NE PAS créer de réponse tout seul
                interrupt_response: true
            },
            input_audio_transcription: {
                enabled: true, // ✅ Activer explicitement la STT utilisateur
                model: process.env.STT_REALTIME_MODEL || "gpt-4o-mini-transcribe"
            },
            input_audio_format: "pcm16",
            output_audio_format: "pcm16" // ✅ String, pas objet
        }
    };
}



