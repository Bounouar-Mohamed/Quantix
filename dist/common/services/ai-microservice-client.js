"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var AiMicroserviceClient_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiMicroserviceClient = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const axios_1 = require("axios");
let AiMicroserviceClient = AiMicroserviceClient_1 = class AiMicroserviceClient {
    constructor(configService) {
        this.configService = configService;
        this.logger = new common_1.Logger(AiMicroserviceClient_1.name);
        this.baseUrl = this.configService.get('AI_MICROSERVICE_URL', 'http://localhost:3001/api/v1');
        this.client = axios_1.default.create({
            baseURL: this.baseUrl,
            timeout: 30000,
            headers: {
                'Content-Type': 'application/json',
            },
        });
        this.client.interceptors.request.use((config) => {
            this.logger.debug(`Requête IA: ${config.method?.toUpperCase()} ${config.url}`);
            return config;
        }, (error) => {
            this.logger.error('Erreur requête IA:', error);
            return Promise.reject(error);
        });
        this.client.interceptors.response.use((response) => {
            this.logger.debug(`Réponse IA: ${response.status} ${response.config.url}`);
            return response;
        }, (error) => {
            this.logger.error('Erreur réponse IA:', error.response?.data || error.message);
            return Promise.reject(error);
        });
    }
    async generateResponse(request) {
        try {
            const response = await this.client.post('/ai/generate', request);
            return response.data;
        }
        catch (error) {
            this.logger.error('Erreur lors de la génération IA:', error);
            throw error;
        }
    }
    async checkHealth() {
        try {
            const response = await this.client.get('/ai/health');
            return response.data;
        }
        catch (error) {
            this.logger.error('Erreur lors de la vérification de santé:', error);
            throw error;
        }
    }
    async getAvailableModels(provider) {
        try {
            const url = provider ? `/ai/models?provider=${provider}` : '/ai/models';
            const response = await this.client.get(url);
            return response.data;
        }
        catch (error) {
            this.logger.error('Erreur lors de la récupération des modèles:', error);
            return [];
        }
    }
    async testService() {
        try {
            const response = await this.client.post('/ai/test');
            return response.data;
        }
        catch (error) {
            this.logger.error('Erreur lors du test:', error);
            throw error;
        }
    }
};
exports.AiMicroserviceClient = AiMicroserviceClient;
exports.AiMicroserviceClient = AiMicroserviceClient = AiMicroserviceClient_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], AiMicroserviceClient);
//# sourceMappingURL=ai-microservice-client.js.map