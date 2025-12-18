/**
 * Adaptateur OpenAI Realtime API
 * Transforme le profil de modèle en configuration de session WebSocket
 */

import { ModelProfile, getRealtimeInstructionsForLang } from "../modelProfile";

export interface RealtimeSessionConfig {
    type: "session.update";
    session: {
        model: string;
        temperature: number;
        frequency_penalty?: number;
        presence_penalty?: number;
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
 * ⚠️ IMPORTANT: Ne JAMAIS utiliser profile.instructions (trop long, en FR)
 * On utilise uniquement les instructions realtime multilingues
 * Le modèle OpenAI Realtime détecte automatiquement la langue de l'utilisateur
 */
export function buildRealtimeSessionUpdate(
    profile: ModelProfile
): RealtimeSessionConfig {
    // ═══════════════════════════════════════════════════════════════════════════
    // REALTIME: Instructions multilingues - détection automatique par le modèle
    // ═══════════════════════════════════════════════════════════════════════════
    const realtimeInstructions = getRealtimeInstructionsForLang();
    
    return {
        type: "session.update",
        session: {
            model: profile.id,
            temperature: profile.temperature,
            frequency_penalty: profile.frequencyPenalty,
            presence_penalty: profile.presencePenalty,
            voice: profile.voice,
            modalities: profile.modalities,
            instructions: realtimeInstructions, // ✅ Instructions realtime dynamiques
            tools: profile.tools.map(t => ({
                type: "function",
                name: t.name,
                description: t.description,
                parameters: t.parameters
            })),
            turn_detection: {
                type: "server_vad",
                threshold: 0.5,
                prefix_padding_ms: 250,
                silence_duration_ms: 500,
                create_response: false,
                interrupt_response: true
            },
            input_audio_transcription: {
                enabled: true,
                // ⚠️ IMPORTANT: Ne pas forcer la langue, laisser l'auto-détection
                model: process.env.STT_REALTIME_MODEL || "gpt-4o-mini-transcribe"
            },
            input_audio_format: "pcm16",
            output_audio_format: "pcm16"
        }
    };
}



