import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

export interface AiMicroserviceRequest {
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  userId?: string;
  sessionId?: string;
}

export interface AiMicroserviceResponse {
  content: string;
  provider: string;
  model: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  duration: number;
  timestamp: Date;
}

@Injectable()
export class AiMicroserviceClient {
  private readonly logger = new Logger(AiMicroserviceClient.name);
  private readonly client: AxiosInstance;
  private readonly baseUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.baseUrl = this.configService.get('AI_MICROSERVICE_URL', 'http://localhost:3001/api/v1');
    
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Intercepteur pour les logs
    this.client.interceptors.request.use(
      (config) => {
        this.logger.debug(`Requête IA: ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => {
        this.logger.error('Erreur requête IA:', error);
        return Promise.reject(error);
      }
    );

    this.client.interceptors.response.use(
      (response) => {
        this.logger.debug(`Réponse IA: ${response.status} ${response.config.url}`);
        return response;
      },
      (error) => {
        this.logger.error('Erreur réponse IA:', error.response?.data || error.message);
        return Promise.reject(error);
      }
    );
  }

  /**
   * Génère une réponse via le microservice IA
   */
  async generateResponse(request: AiMicroserviceRequest): Promise<AiMicroserviceResponse> {
    try {
      const response = await this.client.post('/ai/generate', request);
      return response.data;
    } catch (error) {
      this.logger.error('Erreur lors de la génération IA:', error);
      throw error;
    }
  }

  /**
   * Vérifie la santé du microservice IA
   */
  async checkHealth(): Promise<{
    openai: boolean;
    anthropic: boolean;
    overall: boolean;
    timestamp: Date;
  }> {
    try {
      const response = await this.client.get('/ai/health');
      return response.data;
    } catch (error) {
      this.logger.error('Erreur lors de la vérification de santé:', error);
      throw error;
    }
  }

  /**
   * Obtient les modèles disponibles
   */
  async getAvailableModels(provider?: string): Promise<string[]> {
    try {
      const url = provider ? `/ai/models?provider=${provider}` : '/ai/models';
      const response = await this.client.get(url);
      return response.data;
    } catch (error) {
      this.logger.error('Erreur lors de la récupération des modèles:', error);
      return [];
    }
  }

  /**
   * Test rapide du microservice
   */
  async testService(): Promise<{ message: string; timestamp: Date }> {
    try {
      const response = await this.client.post('/ai/test');
      return response.data;
    } catch (error) {
      this.logger.error('Erreur lors du test:', error);
      throw error;
    }
  }
}
