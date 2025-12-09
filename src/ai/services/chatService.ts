/**
 * Service Chat REST
 * Utilise l'adaptateur Chat avec le profil
 */

import OpenAI from 'openai';
import { profileJohn } from '../modelProfile';
import { runChatOnce } from '../transports/openaiChat';

/**
 * Service pour la génération de texte via Chat API
 */
export class ChatService {
    private client: OpenAI;
    private profile = profileJohn;

    constructor(client: OpenAI) {
        this.client = client;
    }

    /**
     * Générer une réponse texte à partir d'un prompt utilisateur
     */
    async generateText(prompt: string): Promise<string> {
        try {
            const completion = await runChatOnce(
                this.client,
                this.profile,
                [{ role: 'user', content: prompt }]
            );
            return completion;
        } catch (error) {
            console.error('❌ Chat generation failed:', error);
            return 'Désolé, une erreur est survenue.';
        }
    }
}



