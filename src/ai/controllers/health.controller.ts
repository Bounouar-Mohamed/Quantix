import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AiService } from '../ai.service';
import { HealthCheckDto } from '../dto/ai.dto';

@ApiTags('ai')
@Controller('ai/health')
export class HealthController {
  constructor(private readonly aiService: AiService) {}

  @Get()
  @ApiOperation({
    summary: 'Vérifier la santé des services IA',
    description: 'Vérifie la disponibilité et l\'état des providers IA'
  })
  @ApiResponse({
    status: 200,
    description: 'État de santé des services IA',
  })
  async checkHealth(): Promise<HealthCheckDto> {
    const health = await this.aiService.checkHealth();
    return {
      openai: health.openai,
      overall: health.overall,
      timestamp: new Date(),
    };
  }
}



