/**
 * Filtres de réponses IA - Anti-conseil, anti-duplication, multilingue
 * Utilisé par ai.service.ts et assistants.service.ts
 */

// ============================================
// DÉTECTION DE LANGUE
// ============================================

export type SupportedLang = 'fr' | 'en' | 'ar';

/**
 * Détecte la langue du texte utilisateur
 * RÈGLES STRICTES sur les premiers mots (hello → EN, bonjour → FR)
 * Fallback = TOUJOURS ANGLAIS (jamais français par défaut)
 */
export function detectLang(text: string): SupportedLang {
  const t = (text || '').trim();
  if (!t) return 'en'; // ✅ NEVER default to French

  const lower = t.toLowerCase();

  // ═══════════════════════════════════════════════════════════════════════════
  // RÈGLE 1: PREMIERS MOTS STRICTS (priorité maximale)
  // ═══════════════════════════════════════════════════════════════════════════
  // Si le message COMMENCE par un mot anglais → anglais
  if (/^(hi|hello|hey|good\s*(morning|afternoon|evening)|what|how|why|when|where|who|can|could|would|should|i\s+want|i\s+need|show\s+me|list|tell\s+me)\b/i.test(lower)) {
    return 'en';
  }
  
  // Si le message COMMENCE par un mot français → français
  if (/^(bonjour|salut|coucou|bonsoir|quoi|comment|pourquoi|où|qui|est-ce|qu'est|je\s+veux|je\s+voudrais|montre|affiche|liste)\b/i.test(lower)) {
    return 'fr';
  }
  
  // Si le message contient "ça va" n'importe où → français
  if (/ça\s*va/i.test(lower)) {
    return 'fr';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RÈGLE 2: ARABE (caractères Unicode)
  // ═══════════════════════════════════════════════════════════════════════════
  if (/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(t)) {
    return 'ar';
  }
  
  // Mots arabes communs (translittération ou début de phrase)
  if (/^(مرحبا|أهلا|صباح الخير|مساء الخير|كيفك|كيف حالك)\b/.test(t)) {
    return 'ar';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RÈGLE 3: HEURISTIQUE (si aucune règle stricte ne match)
  // ═══════════════════════════════════════════════════════════════════════════
  // Mots français distinctifs (pas en début de phrase)
  const frWords = /\b(je|tu|nous|vous|ils|elles|le|la|les|un|une|des|est|sont|avec|pour|sur|dans|par|merci|oui|non|bien|quoi|où|qui|que|quand|combien|c'est|d'accord|dispo|propri[eé]t[eé]s?)\b/i;
  
  // Mots anglais distinctifs (pas en début de phrase)
  const enWords = /\b(the|this|that|is|are|was|were|have|has|had|want|need|like|yes|no|please|thanks|thank|ok|okay|available|properties|budget|price|share|shares|show|list|tell)\b/i;

  const hasFr = frWords.test(lower);
  const hasEn = enWords.test(lower);

  // Priorité à l'anglais si détecté
  if (hasEn && !hasFr) return 'en';
  if (hasFr && !hasEn) return 'fr';
  
  // Si les deux sont détectés, compter les occurrences
  if (hasFr && hasEn) {
    const frMatches = (lower.match(frWords) || []).length;
    const enMatches = (lower.match(enWords) || []).length;
    // ✅ En cas d'égalité, préférer l'anglais
    if (frMatches > enMatches) return 'fr';
    return 'en'; // ✅ Préférer anglais
  }

  // Si caractères accentués français et pas de mots anglais
  if (/[àâäéèêëïîôùûüÿç]/.test(t) && !hasEn) return 'fr';

  // ✅ FALLBACK = ANGLAIS (jamais français)
  return 'en';
}

// ============================================
// I18N - Textes multilingues
// ============================================

const I18N = {
  profit: {
    fr: "Je ne peux pas te dire quel bien va « rapporter le plus » ni faire une recommandation d'investissement. Je peux te donner les infos factuelles (prix par part, zone, statut, parts restantes) pour que tu compares. Tu veux que je liste les biens ?",
    en: "I can't tell you which property will \"make the most money\" or recommend an investment. I can share factual info (price per share, area, status, remaining shares) so you can compare. Want me to list what's available?",
    ar: "ما أقدر أقول لك أي عقار «يربح أكثر» أو أعطي توصية استثمارية. أقدر أعطيك معلومات واقعية (السعر للحصة، المنطقة، الحالة، الحصص المتبقية) عشان تقارن بنفسك. تبي أعرض لك المتاح؟",
  },
  noneAvailable: {
    fr: "Là tout de suite, on n'a rien de dispo 😕 Tu veux que je te prévienne dès qu'un nouveau bien sort ?",
    en: "Nothing is available right now 😕 Want me to notify you as soon as a new property is published?",
    ar: "حالياً ما في شيء متاح 😕 تبي أنبهك أول ما ينزل عقار جديد؟",
  },
  propertiesIntro: {
    fr: "Voici les propriétés disponibles ✨",
    en: "Here are the available properties ✨",
    ar: "هذي العقارات المتاحة ✨",
  },
  propertiesOutro: {
    fr: "Tu veux plus de détails sur un bien ? Donne-moi l'ID !",
    en: "Want more details on a property? Give me the ID!",
    ar: "تبي تفاصيل أكثر عن عقار؟ أعطني الـ ID!",
  },
  fallback: {
    fr: "Voici les informations disponibles. Tu veux que je t'affiche une propriété en particulier ?",
    en: "Here's the available information. Want me to show you a specific property?",
    ar: "هذي المعلومات المتاحة. تبي أعرض لك عقار معين؟",
  },
};

/**
 * Fonction de traduction
 */
export function t<K extends keyof typeof I18N>(key: K, lang: SupportedLang): string {
  return I18N[key][lang] || I18N[key].en;
}

/**
 * Réponse hardcoded pour les questions profit (multilingue)
 */
export function getProfitResponse(lang: SupportedLang): string {
  return t('profit', lang);
}

/**
 * Réponse "pas de propriétés" (multilingue)
 */
export function getNoPropertiesResponse(lang: SupportedLang): string {
  return t('noneAvailable', lang);
}

/**
 * Intro liste propriétés (multilingue)
 */
export function getPropertiesIntro(lang: SupportedLang): string {
  return t('propertiesIntro', lang);
}

/**
 * Outro liste propriétés (multilingue)
 */
export function getPropertiesOutro(lang: SupportedLang): string {
  return t('propertiesOutro', lang);
}

/**
 * Fallback response (multilingue)
 */
export function getFallbackResponse(lang: SupportedLang): string {
  return t('fallback', lang);
}

// ============================================
// PROMPT DE REWRITE CONFORMITÉ (multilingue)
// ============================================

/**
 * Génère le prompt de rewrite conformité dans la langue de l'utilisateur
 */
export function getComplianceRewritePrompt(lang: SupportedLang): string {
  return `You are a compliance rewriter for Reccos.
Rewrite the text in the SAME LANGUAGE as the user (${lang === 'ar' ? 'Arabic' : lang === 'fr' ? 'French' : 'English'}).

Rules:
- Remove any investment advice, comparison, or predictions.
- Remove phrases like "I recommend", "you should", "best investment", "potential", "could earn".
- Do NOT list properties, do NOT use bullet lists, do NOT reformat cards.
- Keep it friendly and natural, max 2-3 short sentences.
- Say you can't advise and offer to show factual info if the user wants.

Return ONLY the rewritten text, nothing else.`;
}

// ============================================
// BARRIÈRES DURES - Anti-conseil d'investissement
// ============================================

// Mots-clés qui déclenchent la réponse hardcoded "pas de conseil"
export const PROFIT_KEYWORDS = [
  // Profit / rentabilité (FR)
  'rapport', 'rapporter', 'rapporte', 'rentable', 'rentabilité',
  'profit', 'roi', 'rendement', "plus d'argent",
  // Profit / rentabilité (EN)
  'return', 'returns', 'yield', 'more money', 'make money', 'earn', 'profitable',
  // Profit / rentabilité (AR)
  'يربح', 'ربح', 'عائد', 'أرباح',
  // Comparaison / meilleur (FR)
  'meilleur', 'meilleure', 'plus rentable', 'lequel choisir',
  'quel est le mieux', 'laquelle est', 'lequel est', 'la plus', 'le plus',
  // Comparaison / meilleur (EN)
  'which is better', 'best investment', 'most profitable', 'which one', 'better option',
  // Comparaison / meilleur (AR)
  'أفضل', 'أحسن', 'أكثر ربح',
  // Conseil (FR)
  'conseils', 'conseiller', 'conseille', 'tu me conseils',
  'recommande', 'recommander', 'suggère', 'suggérer',
  // Conseil (EN)
  'what should i', 'which should i', 'should i choose', 'recommend', 'suggest', 'advise',
  // Conseil (AR)
  'تنصحني', 'نصيحة', 'تقترح',
];

// Patterns de conseil à détecter dans les réponses (pour le filtre de conformité)
export const ADVICE_PATTERNS = [
  // FR
  /\b(je te conseille|je recommande|tu devrais|meilleur investissement|bon investissement)\b/i,
  /\b(rentable|rentabilité|potentiel|valorisation|forte demande|attirer des locataires)\b/i,
  /\b(peut|pourrait)\s+(rapporter|gagner|générer|performer|valoriser)\b/i,
  /\b(te permettrait de faire|meilleur choix|bon choix|excellent choix)\b/i,
  /\b(a tendance à|peut potentiellement|peut favoriser)\b/i,
  /\b(maximiser|optimiser|meilleure stratégie)\b/i,
  // EN
  /\b(i recommend|you should|best investment|good investment|great investment)\b/i,
  /\b(profitable|potential|appreciation|high demand|attract tenants)\b/i,
  /\b(could|might)\s+(earn|make|generate|perform)\b/i,
  /\b(would allow you|better choice|best choice|excellent choice)\b/i,
  /\b(tends to|could potentially|may favor)\b/i,
  /\b(maximize|optimize|best strategy)\b/i,
];

export function containsAdvice(text: string): boolean {
  return ADVICE_PATTERNS.some(pattern => pattern.test(text));
}

export function isProfitQuestion(text: string): boolean {
  const lowerText = text.toLowerCase();
  return PROFIT_KEYWORDS.some(kw => lowerText.includes(kw));
}

// ============================================
// DÉTECTION D'INTENTION STRICTE
// ============================================

// Intention "lister les propriétés" (demande explicite)
export const LIST_INTENT_PATTERNS = [
  // FR
  /\b(liste|lister|montre|affiche)\b.*\b(propri[eé]t[eé]s?|biens?)\b/i,
  /\b(propri[eé]t[eé]s?|biens?)\b.*\b(disponibles?|dispo)\b/i,
  /qu['']?est[- ]ce que vous avez/i,
  /quoi de dispo/i,
  // EN
  /\b(list|show|display)\b.*\b(properties|available)\b/i,
  /\b(properties)\b.*\b(available)\b/i,
  /available properties/i,
  /what do you have/i,
  /\b(see|view)\b.*\b(properties)\b/i,
  // AR
  /عرض.*عقار/i,
  /العقارات.*المتاحة/i,
];

// Intention "budget" (l'utilisateur mentionne un montant)
export const BUDGET_PATTERN = /\b\d[\d\s,.]*\s*(aed|dirham|dhs|usd|eur|€|\$|درهم)\b/i;

// Intention "comparer" (questions sur choix sans demander la liste)
export const COMPARE_INTENT_PATTERN = /\b(laquelle|lequel|choisir|mieux|plus int[eé]ressant|compare|comparaison|which one|between|أي|أيهما)\b/i;

export function isListIntent(text: string): boolean {
  return LIST_INTENT_PATTERNS.some(r => r.test(text));
}

export function mentionsBudget(text: string): boolean {
  return BUDGET_PATTERN.test(text);
}

export function isCompareIntent(text: string): boolean {
  return COMPARE_INTENT_PATTERN.test(text);
}

// ============================================
// ANTI-DUPLICATION - Strip des blocs UI de propriétés
// ============================================

export function stripUiPropertyBlock(text: string): string {
  const propertyBlockPatterns = [
    /AVAILABLE PROPERT(Y|IES)/i,
    /^🏠/m,
    /DISCOVER$/m,
    /^\d+\.\s*\*\*[^*]+\*\*\s*$/m,
    /^━+$/m,
  ];

  let result = text;

  for (const pattern of propertyBlockPatterns) {
    const match = result.match(pattern);
    if (match && match.index !== undefined) {
      const beforeMatch = result.slice(0, match.index).trim();
      if (beforeMatch.length > 20) {
        result = beforeMatch;
        break;
      }
    }
  }

  const lines = result.split('\n');
  const cleaned: string[] = [];
  
  for (const line of lines) {
    const t = line.trim();
    if (/^🏠/.test(t)) continue;
    if (/^DISCOVER$/i.test(t)) continue;
    if (/^AVAILABLE$/i.test(t)) continue;
    if (/^\d+\.\s*\*\*/.test(t) && /\*\*\s*$/.test(t)) continue;
    if (/^━+$/.test(t)) continue;
    if (/^\d[\d,.\s]*AED\s*$/i.test(t)) continue;
    cleaned.push(line);
  }
  
  return cleaned.join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const UNSUPPORTED_PROMISE_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  {
    pattern: /je (?:peux|vais) te mettre sur liste d'attente[^.?!]*[.?!]?/gi,
    replacement: "Je ne peux pas t'ajouter automatiquement à une liste d'attente, mais je peux te partager les disponibilités ici dès que tu me le demandes.",
  },
  {
    pattern: /i (?:can|will) put you on (?:the )?waitlist[^.?!]*[.?!]?/gi,
    replacement: "I can't automatically add you to a waitlist, but I can keep sharing availability updates here whenever you ask.",
  },
];

function stripUnsupportedPromises(text: string): string {
  return UNSUPPORTED_PROMISE_PATTERNS.reduce(
    (acc, rule) => acc.replace(rule.pattern, rule.replacement),
    text,
  );
}

// ============================================
// ANTI-BOUCLE - Questions génériques
// ============================================

/**
 * Supprime les questions génériques d'onboarding en début de réponse
 */
export function stripGenericFirstQuestion(text: string): string {
  const patterns = [
    // FR
    /^tu connais d[eé]j[aà] reccos\s*\??\s*/i,
    /^t['']?as un budget en t[eê]te\s*\??\s*/i,
    /^tu as un budget\s*\??\s*/i,
    /^quel est ton budget\s*\??\s*/i,
    /^tu veux d[eé]couvrir reccos\s*\??\s*/i,
    /^tu cherches quoi exactement\s*\??\s*/i,
    // EN
    /^do you know reccos\s*\??\s*/i,
    /^do you have a budget\s*\??\s*/i,
    /^what's your budget\s*\??\s*/i,
    /^want to discover reccos\s*\??\s*/i,
    /^what are you looking for\s*\??\s*/i,
    // AR
    /^تعرف ريكوس\s*\??\s*/i,
    /^عندك ميزانية\s*\??\s*/i,
  ];
  
  let out = text.trim();
  for (const p of patterns) {
    out = out.replace(p, '');
  }
  return out.trim();
}

// ============================================
// HELPERS
// ============================================

/**
 * Détermine si on doit afficher les propriétés
 */
export function shouldShowProperties(userMessage: string): boolean {
  return isListIntent(userMessage) || mentionsBudget(userMessage);
}

/**
 * Nettoie une réponse si elle contient des blocs de propriétés non désirés
 */
export function cleanResponse(content: string, userMessage: string): string {
  let cleaned = content;
  if (!shouldShowProperties(userMessage)) {
    cleaned = stripUiPropertyBlock(cleaned);
  }
  cleaned = stripUnsupportedPromises(cleaned);
  return cleaned;
}




