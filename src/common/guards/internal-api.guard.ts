import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

/**
 * Guard global qui valide la clé interne sur chaque requête HTTP.
 * Évite toute utilisation non autorisée de l'API Quantix.
 */
@Injectable()
export class InternalApiGuard implements CanActivate {
  private readonly headerName = 'x-internal-key';

  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
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


