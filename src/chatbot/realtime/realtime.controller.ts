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
    Headers
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { RealtimeService } from './realtime.service';
import { CreateEphemeralTokenDto, EphemeralTokenResponseDto, ExecuteToolDto } from './dto/realtime.dto';
import type { Request } from 'express';

@ApiTags('chatbot-realtime')
@Controller('chatbot/realtime')
export class RealtimeController {
    constructor(private readonly realtimeService: RealtimeService) {}

    /**
     * Créer un token éphémère pour session WebRTC
     * Endpoint: POST /api/v1/chatbot/realtime/ephemeral-token
     */
    @Post('ephemeral-token')
    @Throttle(3, 60)
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
        // Utiliser locale ou accept-language pour détecter la langue
        const detectedLocale = locale || acceptLanguage || 'en';
        return await this.realtimeService.getConfig(userId, tenantId, detectedLocale);
    }

    /**
     * Exécuter un tool (function call)
     * Endpoint: POST /api/v1/chatbot/tools/execute
     */
    @Post('tools/execute')
    @Throttle(15, 60)
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Exécuter un tool appelé par le modèle',
        description: 'Bridge entre le modèle et le serveur métier (CRM-API)'
    })
    @ApiResponse({ status: 200, description: 'Tool exécuté' })
    async executeTool(@Body() dto: ExecuteToolDto) {
        return await this.realtimeService.executeTool(dto);
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

