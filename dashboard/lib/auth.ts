/**
 * Système d'authentification pour le dashboard Quantix
 */

// Credentials admin (à configurer via env en production)
const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL || 'admin@quantix.ai';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Quantix2025!';

// Token secret pour signer les sessions
const TOKEN_SECRET = process.env.TOKEN_SECRET || 'quantix-dashboard-secret-key-2025';

/**
 * Génère un token simple basé sur l'email et le timestamp
 */
export function generateToken(email: string): string {
  const payload = {
    email,
    exp: Date.now() + 24 * 60 * 60 * 1000, // 24h
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64');
  const signature = Buffer.from(`${encoded}.${TOKEN_SECRET}`).toString('base64').slice(0, 16);
  return `${encoded}.${signature}`;
}

/**
 * Vérifie un token et retourne l'email si valide
 */
export function verifyToken(token: string): { valid: boolean; email?: string } {
  try {
    const [encoded, signature] = token.split('.');
    if (!encoded || !signature) return { valid: false };
    
    // Vérifier la signature
    const expectedSig = Buffer.from(`${encoded}.${TOKEN_SECRET}`).toString('base64').slice(0, 16);
    if (signature !== expectedSig) return { valid: false };
    
    // Décoder le payload
    const payload = JSON.parse(Buffer.from(encoded, 'base64').toString());
    
    // Vérifier l'expiration
    if (payload.exp < Date.now()) return { valid: false };
    
    return { valid: true, email: payload.email };
  } catch {
    return { valid: false };
  }
}

/**
 * Vérifie les credentials
 */
export function validateCredentials(email: string, password: string): boolean {
  return email === ADMIN_EMAIL && password === ADMIN_PASSWORD;
}

/**
 * Stocke le token côté client
 */
export function setAuthToken(token: string): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem('quantix_token', token);
    // Aussi en cookie pour le middleware
    document.cookie = `quantix_token=${token}; path=/; max-age=${24 * 60 * 60}; SameSite=Strict`;
  }
}

/**
 * Récupère le token côté client
 */
export function getAuthToken(): string | null {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('quantix_token');
  }
  return null;
}

/**
 * Supprime le token (logout)
 */
export function clearAuthToken(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('quantix_token');
    document.cookie = 'quantix_token=; path=/; max-age=0';
  }
}

/**
 * Vérifie si l'utilisateur est authentifié
 */
export function isAuthenticated(): boolean {
  const token = getAuthToken();
  if (!token) return false;
  return verifyToken(token).valid;
}

