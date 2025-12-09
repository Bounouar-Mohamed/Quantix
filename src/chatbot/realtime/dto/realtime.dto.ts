/**
 * DTOs pour Realtime API
 */

import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber } from 'class-validator';

export class CreateEphemeralTokenDto {
    @ApiProperty({
        description: 'ID utilisateur',
        example: 'user-123'
    })
    @IsString()
    userId: string;

    @ApiProperty({
        description: 'ID tenant/organisation',
        example: 'tenant-456'
    })
    @IsString()
    tenantId: string;

    @ApiProperty({
        description: 'ID conversation (pour thread unifié)',
        example: 'conv-789',
        required: false
    })
    @IsOptional()
    @IsString()
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
    @ApiProperty()
    name: string;

    @ApiProperty()
    arguments: any;

    @ApiProperty()
    sessionId: string;

    @ApiProperty()
    userId: string;

    @ApiProperty()
    correlationId: string;
}

