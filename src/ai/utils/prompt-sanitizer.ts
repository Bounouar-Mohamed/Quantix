/**
 * ══════════════════════════════════════════════════════════════════════════════
 * SÉCURITÉ: Protection contre les injections de prompt
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Ce module détecte et neutralise les tentatives d'injection de prompt,
 * une technique d'attaque où un utilisateur malveillant tente de manipuler
 * le comportement du modèle IA en injectant des instructions cachées.
 */

import { Logger } from '@nestjs/common';
import type { AiMessage } from '../interfaces/ai.interface';

/**
 * Patterns dangereux qui pourraient être utilisés pour l'injection de prompt
 */
const PROMPT_INJECTION_PATTERNS: Array<{ pattern: RegExp; description: string }> = [
  // Tentatives de surcharger les instructions système
  { 
    pattern: /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions?|prompts?|rules?)/gi, 
    description: 'override_instructions' 
  },
  { 
    pattern: /disregard\s+(all\s+)?(previous|prior|above)\s+(instructions?|prompts?|rules?)/gi, 
    description: 'override_instructions' 
  },
  { 
    pattern: /forget\s+(everything|all)/gi, 
    description: 'forget_context' 
  },
  
  // Tentatives de role-play malveillant
  { 
    pattern: /you\s+are\s+now\s+(a|an)\s+(different|new|evil|unrestricted)/gi, 
    description: 'roleplay_override' 
  },
  { 
    pattern: /pretend\s+(to\s+be|you\s+are)\s+(a|an)\s+(hacker|evil)/gi, 
    description: 'roleplay_override' 
  },
  { 
    pattern: /act\s+as\s+if\s+you\s+have\s+no\s+restrictions/gi, 
    description: 'bypass_restrictions' 
  },
  
  // Tentatives d'extraction de prompt système
  { 
    pattern: /what\s+(are|is)\s+your\s+(system\s+)?(prompt|instructions?)/gi, 
    description: 'extract_system_prompt' 
  },
  { 
    pattern: /show\s+(me\s+)?your\s+(system\s+)?(prompt|instructions?)/gi, 
    description: 'extract_system_prompt' 
  },
  { 
    pattern: /reveal\s+(your\s+)?(system\s+)?(prompt|instructions?)/gi, 
    description: 'extract_system_prompt' 
  },
  { 
    pattern: /print\s+(your\s+)?(initial|system)\s+(prompt|instructions?)/gi, 
    description: 'extract_system_prompt' 
  },
  
  // Délimiteurs de prompt courants utilisés dans les attaques
  { pattern: /\[INST\]/gi, description: 'llama_delimiter' },
  { pattern: /<<SYS>>/gi, description: 'llama_system_delimiter' },
  { pattern: /<\|im_start\|>/gi, description: 'chatml_delimiter' },
  { pattern: /<\|im_end\|>/gi, description: 'chatml_delimiter' },
  
  // Tentatives de jailbreak connues
  { pattern: /DAN\s+mode/gi, description: 'jailbreak_dan' },
  { pattern: /developer\s+mode\s+enabled/gi, description: 'jailbreak_dev_mode' },
  { 
    pattern: /without\s+(any\s+)?(ethical|moral|safety)\s+(guidelines?|restrictions?)/gi, 
    description: 'bypass_ethics' 
  },
  
  // Encodages suspects (tentatives de bypass)
  { pattern: /base64|btoa|atob/gi, description: 'encoding_bypass' },
];

/**
 * Longueur maximale d'un message (protection DoS)
 */
const MAX_MESSAGE_LENGTH = 10000;

/**
 * Sanitise un message utilisateur pour prévenir les injections de prompt
 * @param content - Contenu du message à sanitiser
 * @param logger - Logger optionnel pour tracer les tentatives d'injection
 * @returns Le contenu sanitisé
 */
export function sanitizePromptContent(content: string, logger?: Logger): string {
  if (!content || typeof content !== 'string') {
    return '';
  }
  
  let sanitized = content;
  const detectedPatterns: string[] = [];
  
  for (const { pattern, description } of PROMPT_INJECTION_PATTERNS) {
    // Reset lastIndex avant le test (important pour les regex globales)
    pattern.lastIndex = 0;
    
    if (pattern.test(sanitized)) {
      detectedPatterns.push(description);
      // Reset à nouveau avant le replace
      pattern.lastIndex = 0;
      // Remplacer le pattern dangereux par une version neutralisée
      sanitized = sanitized.replace(pattern, '[FILTERED]');
    }
  }
  
  if (detectedPatterns.length > 0 && logger) {
    logger.warn(`🚫 [SECURITY] Tentative d'injection de prompt détectée: ${detectedPatterns.join(', ')}`);
    logger.debug(`[SECURITY] Message original (tronqué): ${content.substring(0, 100)}...`);
  }
  
  // Limiter la longueur du message pour éviter les attaques par déni de service
  if (sanitized.length > MAX_MESSAGE_LENGTH) {
    sanitized = sanitized.substring(0, MAX_MESSAGE_LENGTH) + '... [message tronqué]';
    if (logger) {
      logger.warn(`🚫 [SECURITY] Message trop long (${content.length} chars), tronqué à ${MAX_MESSAGE_LENGTH}`);
    }
  }
  
  return sanitized;
}

/**
 * Sanitise tous les messages d'une conversation
 * @param messages - Liste des messages à sanitiser
 * @param logger - Logger optionnel
 * @returns Messages sanitisés
 */
export function sanitizeMessages(messages: AiMessage[], logger?: Logger): AiMessage[] {
  return messages.map(msg => {
    // Ne sanitiser que les messages utilisateur (pas system ni assistant)
    if (msg.role === 'user') {
      return {
        ...msg,
        content: sanitizePromptContent(msg.content, logger),
      };
    }
    return msg;
  });
}

/**
 * Vérifie si un message contient des patterns d'injection
 * @param content - Contenu à vérifier
 * @returns true si des patterns d'injection sont détectés
 */
export function containsInjectionAttempt(content: string): boolean {
  if (!content) return false;
  
  for (const { pattern } of PROMPT_INJECTION_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(content)) {
      return true;
    }
  }
  return false;
}

