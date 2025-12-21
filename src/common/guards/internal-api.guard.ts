import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

/**
 * Routes publiques accessibles sans authentification
 * ATTENTION: Ne jamais exposer de données sensibles (usage, tenants, billing, etc.)
 */
const PUBLIC_ROUTES = [
  '/api/v1/ai/health',     // Health check système
  '/api/v1/ai/models',     // Liste des modèles disponibles
  '/api/docs',             // Documentation Swagger (dev only)
];

/**
 * Routes accessibles uniquement depuis le dashboard interne (localhost)
 * Ces routes nécessitent soit la clé interne, soit être appelées depuis localhost
 */
const DASHBOARD_ROUTES = [
  '/api/v1/monitoring',    // Toutes les routes monitoring
  '/api/v1/tenants',       // Gestion des tenants
];

/**
 * Guard global qui valide la clé interne sur chaque requête HTTP.
 * 
 * Niveaux d'accès:
 * 1. PUBLIC_ROUTES: Accessible par tous (health, models, docs)
 * 2. DASHBOARD_ROUTES: Accessible depuis localhost OU avec clé interne
 * 3. Autres routes: Requiert TOUJOURS la clé interne
 */
@Injectable()
export class InternalApiGuard implements CanActivate {
  private readonly headerName = 'x-internal-key';

  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const path = request.path || request.url;

    // 1. Routes publiques - toujours accessibles
    if (this.isPublicRoute(path)) {
      return true;
    }

    // 2. Routes dashboard - accessibles depuis localhost OU avec clé interne
    if (this.isDashboardRoute(path)) {
      // Vérifier si la requête vient de localhost
      if (this.isLocalRequest(request)) {
        return true;
      }
      // Sinon, vérifier la clé interne
    }

    // 3. Toutes les autres routes requièrent la clé interne
    const expectedKey = this.configService.get<string>('INTERNAL_API_KEY');

    if (!expectedKey) {
      throw new UnauthorizedException(
        'Configuration invalide: INTERNAL_API_KEY manquante',
      );
    }

    const providedKey = this.extractKey(request);
    if (!providedKey || providedKey !== expectedKey) {
      throw new UnauthorizedException('Clé interne invalide');
    }

    return true;
  }

  private isPublicRoute(path: string): boolean {
    return PUBLIC_ROUTES.some(route => path.startsWith(route));
  }

  private isDashboardRoute(path: string): boolean {
    return DASHBOARD_ROUTES.some(route => path.startsWith(route));
  }

  /**
   * Vérifie si la requête provient de localhost (dashboard interne)
   */
  private isLocalRequest(request: Request): boolean {
    const ip = request.ip || request.socket?.remoteAddress || '';
    const forwardedFor = request.headers['x-forwarded-for'];
    
    // Liste des IPs locales
    const localIPs = ['127.0.0.1', '::1', '::ffff:127.0.0.1', 'localhost'];
    
    // Si pas de proxy, vérifier l'IP directe
    if (!forwardedFor) {
      return localIPs.some(local => ip.includes(local));
    }
    
    // Si proxy, vérifier que X-Forwarded-For est aussi local
    const clientIP = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor.split(',')[0].trim();
    return localIPs.some(local => clientIP.includes(local) || ip.includes(local));
  }

  private extractKey(request: Request): string | undefined {
    const directHeader = request.headers[this.headerName] as
      | string
      | undefined;

    if (directHeader) {
      return directHeader.trim();
    }

    const authHeader = request.headers['authorization'];
    if (!authHeader || Array.isArray(authHeader)) {
      return undefined;
    }

    const [scheme, value] = authHeader.split(' ');
    if (scheme?.toLowerCase() === 'bearer' && value) {
      return value.trim();
    }

    return undefined;
  }
}


