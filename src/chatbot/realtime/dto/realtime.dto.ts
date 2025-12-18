/**
 * DTOs pour Realtime API
 */

import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, Matches, IsIn, IsObject } from 'class-validator';

const IDENTIFIER_REGEX = /^[A-Za-z0-9:_-]{1,64}$/;

export class CreateEphemeralTokenDto {
    @ApiProperty({
        description: 'ID utilisateur',
        example: 'user-123'
    })
    @IsString()
    @Matches(IDENTIFIER_REGEX, { message: 'userId invalide' })
    userId: string;

    @ApiProperty({
        description: 'ID tenant/organisation',
        example: 'tenant-456'
    })
    @IsString()
    @Matches(IDENTIFIER_REGEX, { message: 'tenantId invalide' })
    tenantId: string;

    @ApiProperty({
        description: 'ID conversation (pour thread unifié)',
        example: 'conv-789',
        required: false
    })
    @IsOptional()
    @IsString()
    @Matches(IDENTIFIER_REGEX, { message: 'conversationId invalide', groups: ['conversation'] })
    conversationId?: string;

    @ApiProperty({
        description: 'Locale (fr, en, etc.)',
        example: 'fr',
        required: false
    })
    @IsOptional()
    @IsString()
    locale?: string;

    @ApiProperty({
        description: 'Version app',
        required: false
    })
    @IsOptional()
    @IsString()
    appVersion?: string;
}

export class EphemeralTokenResponseDto {
    @ApiProperty()
    token: string;

    // Exposé en snake_case pour le front
    @ApiProperty({ name: 'expires_in' })
    // @ts-ignore - aligner l'output JSON sur expires_in
    expires_in: number;

    @ApiProperty()
    sessionId: string;

    @ApiProperty({
        description: 'ID thread Assistant pour cohérence conversationnelle',
        required: false
    })
    assistant_thread_id?: string;
}

export class ExecuteToolDto {
    private static readonly allowedTools = [
        // Legacy tools
        'create_automation', 'analyze_client', 'log_to_crm',
        // Reccos tools
        'list_available_properties', 'get_property_details', 'calculate_investment', 'get_market_stats',
        // Web tools
        'web_search', 'web_open'
    ];

    @ApiProperty({
        description: 'Nom du tool à exécuter',
        enum: ExecuteToolDto.allowedTools
    })
    @IsIn(ExecuteToolDto.allowedTools)
    name: string;

    @ApiProperty({
        description: 'Arguments JSON pour le tool'
    })
    @IsObject()
    arguments: Record<string, any>;

    @ApiProperty()
    @IsString()
    @Matches(IDENTIFIER_REGEX, { message: 'sessionId invalide' })
    sessionId: string;

    @ApiProperty()
    @IsString()
    @Matches(IDENTIFIER_REGEX, { message: 'userId invalide' })
    userId: string;

    @ApiProperty()
    @IsString()
    @Matches(IDENTIFIER_REGEX, { message: 'correlationId invalide' })
    correlationId: string;
}

