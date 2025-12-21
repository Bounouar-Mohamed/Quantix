const normalize = (text: string): string => (text || '').toLowerCase();

const LIST_INTENT_PATTERNS = [
  /\b(liste|lister|montre|affiche)\b.*\b(propri[eé]t[eé]s?|biens?)\b/i,
  /\b(propri[eé]t[eé]s?|biens?)\b.*\b(disponibles?|dispo)\b/i,
  /qu['']?est[- ]ce que vous avez/i,
  /quoi de dispo/i,
  /\b(list|show|display)\b.*\b(properties|available)\b/i,
  /\b(properties)\b.*\b(available)\b/i,
  /available properties/i,
  /what do you have/i,
  /\b(see|view)\b.*\b(properties)\b/i,
  /\b(any|other|more)\s+properties\b/i,
  /\bshow\s+me\s+(?:more|other)\s+properties\b/i,
  /\byou\s+have\s+(?:any\s+)?other\s+properties\b/i,
  /\bdo\s+you\s+have\s+properties\b/i,
  /\bproperties?\s+(?:not\s+)?available\b/i,
  /\bonly\s+one\s+property\b/i,
  /عرض.*عقار/i,
  /العقارات.*المتاحة/i,
];

const BUDGET_PATTERN = /\b\d[\d\s,.]*\s*(aed|dirham|dhs|usd|eur|€|\$|درهم)\b/i;

const COMPARE_INTENT_PATTERN = /\b(laquelle|lequel|choisir|mieux|plus int[eé]ressant|compare|comparaison|which one|between|أي|أيهما)\b/i;

export function isListIntent(text: string): boolean {
  const value = normalize(text);
  if (!value) return false;
  return LIST_INTENT_PATTERNS.some((pattern) => pattern.test(value));
}

export function mentionsBudget(text: string): boolean {
  const value = normalize(text);
  if (!value) return false;
  return BUDGET_PATTERN.test(value);
}

export function isCompareIntent(text: string): boolean {
  const value = normalize(text);
  if (!value) return false;
  return COMPARE_INTENT_PATTERN.test(value);
}




