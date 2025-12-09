/**
 * Router d'événements normalisé
 * Unifie les événements entre Realtime et Chat REST
 */

import WebSocket from "ws";

export interface AssistantTextEvent {
    type: "assistant.text";
    text: string;
    responseId?: string;
    source?: string;
    timestamp: string;
}

export interface AssistantAudioEvent {
    type: "assistant.audio";
    audio: string; // base64
    format: string;
    sampleRate: number;
    source?: string;
    timestamp: string;
}

export interface AssistantAudioDeltaEvent {
    type: "assistant.audio.delta";
    audio: string; // base64
    format: string;
    sampleRate: number;
    responseId?: string;
    timestamp: string;
}

export interface AssistantCitationsEvent {
    type: "assistant.citations";
    results: Array<{ title: string; url: string; snippet?: string }>;
    timestamp: string;
}

export interface UserTranscriptEvent {
    type: "user.transcript";
    text: string;
    timestamp: string;
}

/**
 * Envoyer un événement de texte assistant
 */
export function forwardAssistantText(
    ws: WebSocket,
    text: string,
    responseId?: string,
    source?: string,
    timestamp?: string  // Timestamp optionnel pour cohérence avec DB
): void {
    if (ws.readyState !== WebSocket.OPEN) return;
    
    const event: AssistantTextEvent = {
        type: "assistant.text",
        text,
        responseId,
        source,
        timestamp: timestamp || new Date().toISOString()
    };
    
    ws.send(JSON.stringify(event));
}

/**
 * Envoyer un événement audio assistant (complet)
 */
export function forwardAssistantAudio(
    ws: WebSocket,
    base64Audio: string,
    source?: string
): void {
    if (ws.readyState !== WebSocket.OPEN) return;
    
    const event: AssistantAudioEvent = {
        type: "assistant.audio",
        audio: base64Audio,
        format: "pcm16",
        sampleRate: 24000,
        source,
        timestamp: new Date().toISOString()
    };
    
    ws.send(JSON.stringify(event));
}

/**
 * Envoyer un événement audio delta (streaming)
 */
export function forwardAssistantAudioDelta(
    ws: WebSocket,
    base64Audio: string,
    responseId?: string
): void {
    if (ws.readyState !== WebSocket.OPEN) return;
    
    const event: AssistantAudioDeltaEvent = {
        type: "assistant.audio.delta",
        audio: base64Audio,
        format: "pcm16",
        sampleRate: 24000,
        responseId,
        timestamp: new Date().toISOString()
    };
    
    ws.send(JSON.stringify(event));
}

/**
 * Envoyer un événement de citations
 */
export function forwardAssistantCitations(
    ws: WebSocket,
    results: Array<{ title: string; url: string; snippet?: string }>
): void {
    if (ws.readyState !== WebSocket.OPEN) return;
    
    const event: AssistantCitationsEvent = {
        type: "assistant.citations",
        results,
        timestamp: new Date().toISOString()
    };
    
    ws.send(JSON.stringify(event));
}

/**
 * Envoyer un événement de transcription utilisateur
 */
export function forwardUserTranscript(
    ws: WebSocket,
    text: string,
    timestamp?: string  // Timestamp optionnel pour cohérence avec DB
): void {
    if (ws.readyState !== WebSocket.OPEN) return;
    
    const event: UserTranscriptEvent = {
        type: "user.transcript",
        text,
        timestamp: timestamp || new Date().toISOString()
    };
    
    ws.send(JSON.stringify(event));
}



