/**
 * ══════════════════════════════════════════════════════════════════════════════
 * BUSINESS LOGIC MIDDLEWARE
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Ce middleware contient toute la logique métier spécifique à Reccos/Noor :
 * - Détection d'intention (liste de propriétés, questions profit)
 * - Réponses hardcodées pour la conformité réglementaire
 * - Génération de templates de propriétés
 * 
 * Séparé du service IA pour garder le core générique et réutilisable.
 */

import { Logger } from '@nestjs/common';
import type { AiMessage, AiUsage } from '../interfaces/ai.interface';
import { executeTool } from '../toolRegistry';
import {
  detectLang,
  SupportedLang,
  isProfitQuestion,
  isListIntent,
  mentionsBudget,
  getProfitResponse,
  getNoPropertiesResponse,
  renderPropertyListMessage,
  PropertySectionsPayload,
  getPropertiesIntro,
  getPropertiesOutro,
  getUiCopyForPayload,
} from '../utils/response-filters';
import { Buffer } from 'buffer';

export interface BusinessMiddlewareResult {
  handled: boolean;
  content?: string;
  usage?: Partial<AiUsage>;
}

interface MiddlewareContext {
  userId?: string;
  model: string;
  logger: Logger;
}

/**
 * Applique la logique métier avant l'appel au modèle IA
 * Retourne { handled: true, content } si la requête est gérée directement
 */
export async function applyBusinessMiddleware(
  userMessage: string,
  history: AiMessage[],
  ctx: MiddlewareContext
): Promise<BusinessMiddlewareResult> {
  const lang = detectLang(userMessage);

  // ════════════════════════════════════════════════════════════════════════════
  // BARRIÈRE 1: Questions sur les profits/rendements (conformité réglementaire)
  // ════════════════════════════════════════════════════════════════════════════
  if (isProfitQuestion(userMessage)) {
    ctx.logger.log(`🚫 [COMPLIANCE] Question profit détectée → réponse hardcodée (${lang})`);
    return {
      handled: true,
      content: getProfitResponse(lang),
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    };
  }

  // ════════════════════════════════════════════════════════════════════════════
  // BARRIÈRE 2: Demande de liste de propriétés → bypass LLM
  // ════════════════════════════════════════════════════════════════════════════
  const wantsProperties = isListIntent(userMessage) || mentionsBudget(userMessage) || detectFollowUp(userMessage, history);
  
  if (wantsProperties) {
    ctx.logger.log(`🏠 [PROPERTIES] Génération via template (${lang})`);
    
    try {
      const output = await executeTool('list_available_properties', {}, { userId: ctx.userId || 'anonymous' });
      const payload: PropertySectionsPayload = Array.isArray(output) ? { properties: output } : (output || {});
      
      // Vérifier si le tool a retourné une erreur ou un message "no_properties_found"
      if (output?.status === 'no_properties_found' || output?.error) {
        return {
          handled: true,
          content: getNoPropertiesResponse(lang),
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        };
      }
      
      const groups = payload.groups || {};
      const totalCount = (groups.available?.length || 0) + (groups.upcoming?.length || 0) + (payload.properties?.length || 0);

      if (totalCount === 0) {
        return {
          handled: true,
          content: getNoPropertiesResponse(lang),
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        };
      }

      const rendered = renderPropertyListMessage(payload, lang).trim();
      const marker = buildPropertiesMarker(payload, lang);
      const content = marker ? `${rendered}\n\n${marker}` : rendered;

      return {
        handled: true,
        content,
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      };
    } catch (error: any) {
      ctx.logger.error(`❌ Erreur list_available_properties: ${error.message}`);
      
      // ═══════════════════════════════════════════════════════════════════════════════
      // CRITIQUE: NE JAMAIS laisser le LLM répondre s'il y a une erreur
      // Sinon il va INVENTER des propriétés qui n'existent pas
      // ═══════════════════════════════════════════════════════════════════════════════
      const errorResponses: Record<SupportedLang, string> = {
        fr: "Je ne peux pas accéder à notre catalogue de propriétés pour le moment. 🔧\n\nL'équipe Reccos travaille dessus. En attendant, tu peux :\n• Visiter reccos.com pour voir les propriétés en ligne\n• Me recontacter dans quelques minutes\n\nDésolée pour ce désagrément ! 🤍",
        en: "I can't access our property catalog right now. 🔧\n\nThe Reccos team is working on it. In the meantime, you can:\n• Visit reccos.com to browse properties online\n• Try again in a few minutes\n\nSorry for the inconvenience! 🤍",
        ar: "لا أستطيع الوصول إلى كتالوج العقارات الآن. 🔧\n\nفريق ريكوس يعمل على حل المشكلة. في هذه الأثناء يمكنك:\n• زيارة reccos.com لتصفح العقارات\n• المحاولة مرة أخرى بعد دقائق\n\nعذراً على الإزعاج! 🤍",
      };
      
      return {
        handled: true,
        content: errorResponses[lang] || errorResponses.en,
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      };
    }
  }

  // Pas de logique métier applicable → le LLM va répondre
  return { handled: false };
}

/**
 * Détecte si l'utilisateur demande "plus" ou "autres" propriétés
 */
function detectFollowUp(message: string, history: AiMessage[]): boolean {
  const normalized = message.toLowerCase();
  const patterns = [/\bencore\b/, /\bd['']?autres\b/, /\bplus\b/, /\bmore\b/, /\bother\b/];
  
  if (!patterns.some(p => p.test(normalized))) {
    return false;
  }

  const lastAssistant = [...history].reverse().find(m => m.role === 'assistant');
  if (!lastAssistant) return false;

  return /__NOOR_PROPERTIES__/.test(lastAssistant.content || '') || /[✅⏳]/.test(lastAssistant.content || '');
}

/**
 * Construit le marqueur structuré pour le frontend
 */
function buildPropertiesMarker(payload: PropertySectionsPayload, lang: SupportedLang): string | null {
  const properties = payload.properties || [];
  const available = payload.groups?.available ?? properties.filter(p => p.isAvailableNow !== false);
  const upcoming = payload.groups?.upcoming ?? properties.filter(p => p.isAvailableNow === false);

  if (!available.length && !upcoming.length) return null;

  const uiCopy = getUiCopyForPayload(lang);

  const data = {
    lang,
    intro: getPropertiesIntro(lang),
    outro: getPropertiesOutro(lang),
    copy: uiCopy,
    sections: [
      { key: 'available', title: uiCopy.sectionAvailable, properties: sanitizeProperties(available) },
      { key: 'upcoming', title: uiCopy.sectionUpcoming, properties: sanitizeProperties(upcoming) },
    ],
  };

  try {
    const encoded = Buffer.from(JSON.stringify(data), 'utf-8').toString('base64');
    return `<!--__NOOR_PROPERTIES__:${encoded}-->\n__NOOR_PROPERTIES__:${encoded}__NOOR_END__`;
  } catch {
    return null;
  }
}

function sanitizeProperties(items: any[]): any[] {
  return items.map(p => ({
    id: p.id,
    title: p.title,
    zone: p.zone,
    type: p.type,
    pricePerShare: p.pricePerShare,
    pricePerShareFormatted: p.pricePerShareFormatted,
    availableShares: p.availableShares,
    totalShares: p.totalShares,
    bedrooms: p.bedrooms,
    bathrooms: p.bathrooms,
    totalArea: p.totalArea,
    mainImage: p.mainImage,
    isAvailableNow: p.isAvailableNow,
    availableAt: p.availableAt,
    pitch: p.pitch,
  }));
}

