import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AiService } from '../ai.service';

@ApiTags('ai')
@Controller('ai/models')
export class ModelsController {
  constructor(private readonly aiService: AiService) {}

  @Get()
  @ApiOperation({
    summary: 'Obtenir les modèles disponibles',
    description: 'Récupère la liste des modèles OpenAI disponibles'
  })
  @ApiResponse({
    status: 200,
    description: 'Liste des modèles disponibles',
    schema: {
      type: 'array',
      items: { type: 'string' },
    },
  })
  async getAvailableModels(): Promise<string[]> {
    return this.aiService.getAvailableModels();
  }
}



