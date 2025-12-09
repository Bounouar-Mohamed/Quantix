/**
 * Service TTS (Text-to-Speech) REST
 * Génère de l'audio PCM16 à partir de texte
 */

/**
 * Génération audio TTS via REST API
 */
export async function generateTTS(text: string, apiKey: string): Promise<Buffer | null> {
    try {
        if (!apiKey) {
            console.error('❌ OPENAI_API_KEY manquant');
            return null;
        }

        // Limiter la longueur du texte pour TTS plus rapide
        const maxLength = 300;
        const shortText = text.length > maxLength ? text.substring(0, maxLength) + '...' : text;

        const response = await fetch('https://api.openai.com/v1/audio/speech', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: process.env.OPENAI_MODEL_TTS || 'tts-1',
                input: shortText,
                voice: 'alloy',
                response_format: 'pcm',
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`❌ TTS API error: ${response.status} - ${errorText}`);
            return null;
        }

        // Récupérer le body comme un ArrayBuffer
        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
    } catch (error) {
        console.error('❌ REST TTS failed:', error);
        return null;
    }
}



