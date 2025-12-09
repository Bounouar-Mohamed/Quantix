import { Controller, Post, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AiService } from '../ai.service';

@ApiTags('ai')
@Controller('ai')
export class TestController {
  constructor(private readonly aiService: AiService) {}

  @Post('test')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Test rapide des services IA',
    description: 'Effectue un test simple pour vérifier le fonctionnement'
  })
  @ApiResponse({
    status: 200,
    description: 'Test réussi',
  })
  async testService(): Promise<{ message: string; timestamp: Date }> {
    const testMessages = [
      { role: 'user' as const, content: 'Bonjour, pouvez-vous me dire bonjour en français ?' }
    ];

    const response = await this.aiService.generateResponse(testMessages);
    
    return {
      message: `Test réussi ! Réponse: ${response.content.substring(0, 100)}...`,
      timestamp: new Date(),
    };
  }
}



