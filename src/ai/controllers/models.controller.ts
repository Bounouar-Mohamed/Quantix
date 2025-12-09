import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AiService } from '../ai.service';
import { AiProvider } from '../interfaces/ai.interface';

@ApiTags('ai')
@Controller('ai/models')
export class ModelsController {
  constructor(private readonly aiService: AiService) {}

  @Get()
  @ApiOperation({
    summary: 'Obtenir les modèles disponibles',
    description: 'Récupère la liste des modèles IA disponibles pour un provider'
  })
  @ApiResponse({
    status: 200,
    description: 'Liste des modèles disponibles',
    schema: {
      type: 'array',
      items: { type: 'string' },
    },
  })
  async getAvailableModels(@Query('provider') provider?: string): Promise<string[]> {
    return this.aiService.getAvailableModels(provider as AiProvider);
  }
}



