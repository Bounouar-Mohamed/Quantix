/**
 * Adaptateur OpenAI Chat API
 * Transforme le profil de modèle en requête chat.completions
 */

import OpenAI from "openai";
import { ModelProfile } from "../modelProfile";

export interface ChatMessage {
    role: "system" | "user" | "assistant";
    content: string;
}

/**
 * Exécuter une requête chat avec un profil de modèle
 */
export async function runChatOnce(
    client: OpenAI,
    profile: ModelProfile,
    messages: ChatMessage[]
): Promise<string> {
    // Injecter les instructions système depuis le profil
    const finalMessages = [
        { role: "system" as const, content: profile.instructions },
        ...messages
    ];

    const completion = await client.chat.completions.create({
        model: process.env.OPENAI_MODEL_TEXT || "gpt-4o-mini",
        temperature: profile.temperature,
        messages: finalMessages,
        tools: profile.tools.map(t => ({
            type: "function" as const,
            function: {
                name: t.name,
                description: t.description,
                parameters: t.parameters
            }
        }))
    });

    return completion.choices[0]?.message?.content || "";
}



