/**
 * Controller pour l'API Realtime (Chatbot Voice)
 * Rôle : Tour de contrôle pour Front ↔ OpenAI Realtime (WebRTC direct)
 */

import { 
    Controller, 
    Post, 
    Get, 
    Body, 
    HttpCode, 
    HttpStatus,
    Req,
    Ip,
    Headers,
    BadRequestException,
    Logger,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { RealtimeService } from './realtime.service';
import { CreateEphemeralTokenDto, EphemeralTokenResponseDto, ExecuteToolDto } from './dto/realtime.dto';
import type { Request } from 'express';

// ══════════════════════════════════════════════════════════════════════════════
// SÉCURITÉ: Validation et sanitisation des identifiants
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Regex pour valider les identifiants (userId, tenantId, sessionId)
 * Autorise: lettres, chiffres, tirets, underscores, et UUIDs
 * Longueur: 1-128 caractères
 */
const SAFE_ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Valide et sanitise un identifiant
 * @throws BadRequestException si l'identifiant est invalide
 */
function validateIdentifier(value: string | undefined, fieldName: string, required: boolean = false): string | undefined {
    if (!value || value.trim() === '') {
        if (required) {
            throw new BadRequestException(`${fieldName} est requis`);
        }
        return undefined;
    }
    
    const trimmed = value.trim();
    
    // Vérifier la longueur
    if (trimmed.length > 128) {
        throw new BadRequestException(`${fieldName} trop long (max 128 caractères)`);
    }
    
    // Vérifier le format (UUID ou ID simple)
    if (!SAFE_ID_REGEX.test(trimmed) && !UUID_REGEX.test(trimmed)) {
        throw new BadRequestException(`${fieldName} contient des caractères invalides`);
    }
    
    return trimmed;
}

/**
 * Détecte les tentatives d'injection dans les headers
 */
function detectHeaderInjection(headers: Record<string, string | undefined>): void {
    const suspiciousPatterns = [
        /[\r\n]/,           // Injection de ligne
        /<script/i,         // XSS
        /javascript:/i,     // XSS
        /\x00/,             // Null byte
    ];
    
    for (const [key, value] of Object.entries(headers)) {
        if (value) {
            for (const pattern of suspiciousPatterns) {
                if (pattern.test(value)) {
                    throw new BadRequestException(`Header ${key} contient des caractères suspects`);
                }
            }
        }
    }
}

@ApiTags('chatbot-realtime')
@Controller('chatbot/realtime')
export class RealtimeController {
    private readonly logger = new Logger(RealtimeController.name);
    
    constructor(private readonly realtimeService: RealtimeService) {}

    /**
     * Créer un token éphémère pour session WebRTC
     * Endpoint: POST /api/v1/chatbot/realtime/ephemeral-token
     */
    @Post('ephemeral-token')
    @Throttle({ default: { limit: 3, ttl: 60000 } })
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Créer un token éphémère pour session Realtime',
        description: 'Génère un token JWT éphémère (TTL court) pour authentification WebRTC avec OpenAI Realtime API'
    })
    @ApiResponse({ status: 200, description: 'Token créé', type: EphemeralTokenResponseDto })
    @ApiResponse({ status: 400, description: 'Requête invalide' })
    @ApiResponse({ status: 429, description: 'Rate limit dépassé' })
    async createEphemeralToken(
        @Body() dto: CreateEphemeralTokenDto,
        @Req() req: Request,
        @Ip() ip: string,
        @Headers('user-agent') userAgent?: string
    ): Promise<EphemeralTokenResponseDto> {
        // Rate-limiting : IP + userId + tenantId
        const rateLimitKey = `realtime_token:${ip}:${dto.userId}:${dto.tenantId}`;

        const res = await this.realtimeService.createEphemeralToken({
            ...dto,
            ip,
            userAgent,
            rateLimitKey
        });

        // Adapter le format attendu par le Front: expires_in (snake_case)
        return {
            token: res.token,
            // @ts-ignore - on expose snake_case pour compat front
            expires_in: res.expiresIn,
            // sessionId optionnel accepté côté front
            // @ts-ignore
            sessionId: res.sessionId,
            // @ts-ignore - assistant_thread_id pour cohérence conversationnelle
            assistant_thread_id: res.assistant_thread_id,
        } as any;
    }

    /**
     * Révocat un token/session en cours
     * Endpoint: POST /api/v1/chatbot/realtime/revoke
     */
    @Post('revoke')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Révoquer un token éphémère',
        description: 'Met fin à une session Realtime en révoquant le token'
    })
    @ApiResponse({ status: 200, description: 'Token révoqué' })
    async revokeToken(
        @Body() dto: { sessionId: string; userId: string }
    ): Promise<{ success: boolean }> {
        return await this.realtimeService.revokeToken(dto.sessionId, dto.userId);
    }

    /**
     * Configuration et policies de session
     * Endpoint: GET /api/v1/chatbot/realtime/config
     */
    @Get('config')
    @ApiOperation({
        summary: 'Obtenir la configuration Realtime',
        description: 'Retourne les policies, modèle, voix, instructions système et tools'
    })
    @ApiResponse({ status: 200, description: 'Configuration' })
    async getConfig(
        @Headers('user-id') userId?: string,
        @Headers('tenant-id') tenantId?: string,
        @Headers('accept-language') acceptLanguage?: string,
        @Headers('locale') locale?: string
    ) {
        // SÉCURITÉ: Détecter les injections dans les headers
        detectHeaderInjection({ 'user-id': userId, 'tenant-id': tenantId, locale, 'accept-language': acceptLanguage });
        
        // SÉCURITÉ: Valider et sanitiser les identifiants
        const safeUserId = validateIdentifier(userId, 'user-id');
        const safeTenantId = validateIdentifier(tenantId, 'tenant-id');
        
        // Utiliser locale ou accept-language pour détecter la langue
        const detectedLocale = locale || acceptLanguage || 'en';
        return await this.realtimeService.getConfig(safeUserId, safeTenantId, detectedLocale);
    }

    /**
     * Exécuter un tool (function call)
     * Endpoint: POST /api/v1/chatbot/tools/execute
     */
    @Post('tools/execute')
    @Throttle({ default: { limit: 15, ttl: 60000 } })
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Exécuter un tool appelé par le modèle',
        description: 'Bridge entre le modèle et le serveur métier (CRM-API)'
    })
    @ApiResponse({ status: 200, description: 'Tool exécuté' })
    @ApiResponse({ status: 400, description: 'Requête invalide ou identifiants suspects' })
    async executeTool(@Body() dto: ExecuteToolDto) {
        // SÉCURITÉ: Valider les identifiants dans le DTO
        const safeUserId = validateIdentifier(dto.userId, 'userId', true);
        const safeSessionId = validateIdentifier(dto.sessionId, 'sessionId', true);
        
        // SÉCURITÉ: Valider le nom du tool (pas d'injection)
        if (dto.name && !/^[a-z_]{1,64}$/.test(dto.name)) {
            throw new BadRequestException('Nom de tool invalide');
        }
        
        this.logger.debug(`[TOOL] Exécution demandée: ${dto.name} par ${safeUserId}`);
        
        return await this.realtimeService.executeTool({
            ...dto,
            userId: safeUserId!,
            sessionId: safeSessionId!,
        });
    }

    /**
     * Health check et heartbeat
     * Endpoint: GET /api/v1/chatbot/realtime/heartbeat
     */
    @Get('heartbeat')
    @ApiOperation({ summary: 'Vérifier la santé du service' })
    async heartbeat() {
        return this.realtimeService.getHeartbeat();
    }
}

