import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString, IsOptional, IsNumber, IsEnum, Min, Max } from 'class-validator';
import type { AiMessage } from '../interfaces/ai.interface';
import { AiProvider } from '../interfaces/ai.interface';

export class AiMessageDto {
  @ApiProperty({
    description: 'Rôle du message',
    enum: ['system', 'user', 'assistant'],
    example: 'user',
  })
  @IsEnum(['system', 'user', 'assistant'])
  role: 'system' | 'user' | 'assistant';

  @ApiProperty({
    description: 'Contenu du message',
    example: 'Bonjour, comment allez-vous ?',
  })
  @IsString()
  content: string;
}

export class GenerateResponseDto {
  @ApiProperty({
    description: 'Messages de la conversation',
    type: [AiMessageDto],
  })
  @IsArray()
  messages: AiMessage[];

  @ApiProperty({
    description: 'Modèle IA à utiliser',
    example: 'gpt-3.5-turbo',
    required: false,
  })
  @IsOptional()
  @IsString()
  model?: string;

  @ApiProperty({
    description: 'Température de génération (0-2)',
    example: 0.7,
    minimum: 0,
    maximum: 2,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number;

  @ApiProperty({
    description: 'Nombre maximum de tokens',
    example: 1000,
    minimum: 1,
    maximum: 4000,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(4000)
  maxTokens?: number;

  @ApiProperty({
    description: 'Provider IA à utiliser',
    enum: ['openai', 'anthropic'],
    example: 'openai',
    required: false,
  })
  @IsOptional()
  @IsEnum(['openai', 'anthropic'])
  provider?: AiProvider;

  @ApiProperty({
    description: 'ID de l\'utilisateur',
    example: 'user-123',
    required: false,
  })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiProperty({
    description: 'ID de la session',
    example: 'session-456',
    required: false,
  })
  @IsOptional()
  @IsString()
  sessionId?: string;

  @ApiProperty({
    description: 'ID de la conversation (alias de sessionId, pour compatibilité)',
    example: '31a6d69b-8dce-488a-8f7b-3fbf9c91040d',
    required: false,
  })
  @IsOptional()
  @IsString()
  conversationId?: string;

  @ApiProperty({
    description: 'ID du tenant (pour isolation multi-tenant)',
    example: 'tenant-123',
    required: false,
  })
  @IsOptional()
  @IsString()
  tenantId?: string;
}

export class HealthCheckDto {
  @ApiProperty({
    description: 'État du service OpenAI',
    example: true,
  })
  openai: boolean;

  @ApiProperty({
    description: 'État du service Anthropic',
    example: false,
  })
  anthropic: boolean;

  @ApiProperty({
    description: 'État global des services IA',
    example: true,
  })
  overall: boolean;

  @ApiProperty({
    description: 'Timestamp de la vérification',
    example: '2024-01-15T10:30:00Z',
  })
  timestamp: Date;
}
