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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const ai_service_1 = require("./ai.service");
const ai_dto_1 = require("./dto/ai.dto");
let AiController = class AiController {
    constructor(aiService) {
        this.aiService = aiService;
    }
    async generateResponse(request) {
        return this.aiService.generateResponse(request.messages, {
            model: request.model,
            temperature: request.temperature,
            maxTokens: request.maxTokens,
            provider: request.provider,
        });
    }
    async checkHealth() {
        const health = await this.aiService.checkHealth();
        return {
            openai: health.openai,
            anthropic: health.anthropic,
            overall: health.overall,
            timestamp: new Date(),
        };
    }
    async getAvailableModels(provider) {
        return this.aiService.getAvailableModels(provider);
    }
    async testService() {
        const testMessages = [
            { role: 'user', content: 'Bonjour, pouvez-vous me dire bonjour en français ?' }
        ];
        const response = await this.aiService.generateResponse(testMessages);
        return {
            message: `Test réussi ! Réponse: ${response.content.substring(0, 100)}...`,
            timestamp: new Date(),
        };
    }
};
exports.AiController = AiController;
__decorate([
    (0, common_1.Post)('generate'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: 'Générer une réponse IA',
        description: 'Génère une réponse en utilisant les APIs IA configurées'
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: 'Réponse générée avec succès',
    }),
    (0, swagger_1.ApiResponse)({
        status: 400,
        description: 'Requête invalide',
    }),
    (0, swagger_1.ApiResponse)({
        status: 503,
        description: 'Service IA indisponible',
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [ai_dto_1.GenerateResponseDto]),
    __metadata("design:returntype", Promise)
], AiController.prototype, "generateResponse", null);
__decorate([
    (0, common_1.Get)('health'),
    (0, swagger_1.ApiOperation)({
        summary: 'Vérifier la santé des services IA',
        description: 'Vérifie la disponibilité et l\'état des providers IA'
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: 'État de santé des services IA',
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AiController.prototype, "checkHealth", null);
__decorate([
    (0, common_1.Get)('models'),
    (0, swagger_1.ApiOperation)({
        summary: 'Obtenir les modèles disponibles',
        description: 'Récupère la liste des modèles IA disponibles pour un provider'
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: 'Liste des modèles disponibles',
        schema: {
            type: 'array',
            items: { type: 'string' },
        },
    }),
    __param(0, (0, common_1.Query)('provider')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AiController.prototype, "getAvailableModels", null);
__decorate([
    (0, common_1.Post)('test'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: 'Test rapide des services IA',
        description: 'Effectue un test simple pour vérifier le fonctionnement'
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: 'Test réussi',
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AiController.prototype, "testService", null);
exports.AiController = AiController = __decorate([
    (0, swagger_1.ApiTags)('ai'),
    (0, common_1.Controller)('ai'),
    __metadata("design:paramtypes", [ai_service_1.AiService])
], AiController);
//# sourceMappingURL=ai.controller.js.map