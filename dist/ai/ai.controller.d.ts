import { AiService } from './ai.service';
import { AiResponse } from './interfaces/ai.interface';
import { GenerateResponseDto, HealthCheckDto } from './dto/ai.dto';
export declare class AiController {
    private readonly aiService;
    constructor(aiService: AiService);
    generateResponse(request: GenerateResponseDto): Promise<AiResponse>;
    checkHealth(): Promise<HealthCheckDto>;
    getAvailableModels(provider?: string): Promise<string[]>;
    testService(): Promise<{
        message: string;
        timestamp: Date;
    }>;
}
