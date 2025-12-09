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
var AiService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const openai_1 = require("openai");
let AiService = AiService_1 = class AiService {
    constructor(configService) {
        this.configService = configService;
        this.logger = new common_1.Logger(AiService_1.name);
        this.config = this.configService.get('ai');
        this.initializeClients();
    }
    initializeClients() {
        try {
            if (this.config.openai.apiKey) {
                this.openaiClient = new openai_1.default({
                    apiKey: this.config.openai.apiKey,
                    baseURL: this.config.openai.baseUrl,
                    timeout: this.config.openai.timeout,
                });
                this.logger.log('✅ Client OpenAI initialisé');
            }
            else {
                this.logger.warn('⚠️ Clé API OpenAI manquante');
            }
        }
        catch (error) {
            this.logger.error('❌ Erreur lors de l\'initialisation des clients IA:', error);
        }
    }
    async generateResponse(messages, options) {
        const provider = options?.provider || this.config.defaultProvider;
        switch (provider) {
            case 'openai':
                return this.generateWithOpenAI(messages, options);
            case 'anthropic':
                return this.generateWithAnthropic(messages, options);
            default:
                throw new common_1.BadRequestException(`Provider IA non supporté: ${provider}`);
        }
    }
    async generateWithOpenAI(messages, options) {
        if (!this.openaiClient) {
            throw new common_1.ServiceUnavailableException('Client OpenAI non initialisé');
        }
        try {
            const startTime = Date.now();
            const response = await this.openaiClient.chat.completions.create({
                model: options?.model || this.config.openai.defaultModel,
                messages: messages.map(msg => ({
                    role: msg.role,
                    content: msg.content,
                })),
                temperature: options?.temperature || this.config.openai.temperature,
                max_tokens: options?.maxTokens || this.config.openai.maxTokens,
            });
            const duration = Date.now() - startTime;
            const content = response.choices[0]?.message?.content || '';
            const usage = response.usage;
            this.logger.log(`✅ Réponse OpenAI générée en ${duration}ms`);
            return {
                content,
                provider: 'openai',
                model: options?.model || this.config.openai.defaultModel,
                usage: {
                    promptTokens: usage?.prompt_tokens || 0,
                    completionTokens: usage?.completion_tokens || 0,
                    totalTokens: usage?.total_tokens || 0,
                },
                duration,
                timestamp: new Date(),
            };
        }
        catch (error) {
            this.logger.error('❌ Erreur OpenAI:', error);
            throw new common_1.ServiceUnavailableException(`Erreur OpenAI: ${error.message}`);
        }
    }
    async generateWithAnthropic(messages, options) {
        throw new common_1.ServiceUnavailableException('Provider Anthropic non encore implémenté');
    }
    async checkHealth() {
        const health = {
            openai: false,
            anthropic: false,
            overall: false,
        };
        try {
            if (this.openaiClient) {
                await this.openaiClient.models.list();
                health.openai = true;
            }
        }
        catch (error) {
            this.logger.warn('OpenAI non disponible:', error.message);
        }
        health.anthropic = false;
        health.overall = health.openai || health.anthropic;
        return health;
    }
    async getAvailableModels(provider = 'openai') {
        switch (provider) {
            case 'openai':
                if (!this.openaiClient)
                    return [];
                try {
                    const models = await this.openaiClient.models.list();
                    return models.data
                        .filter(model => model.id.includes('gpt'))
                        .map(model => model.id);
                }
                catch (error) {
                    this.logger.error('Erreur lors de la récupération des modèles OpenAI:', error);
                    return [];
                }
            case 'anthropic':
                return [];
            default:
                return [];
        }
    }
    calculateCost(usage, provider = 'openai') {
        const pricing = {
            openai: {
                'gpt-3.5-turbo': { input: 0.0015 / 1000, output: 0.002 / 1000 },
                'gpt-4': { input: 0.03 / 1000, output: 0.06 / 1000 },
                'gpt-4-turbo': { input: 0.01 / 1000, output: 0.03 / 1000 },
            },
            anthropic: {
                'claude-3-sonnet-20240229': { input: 0.003 / 1000, output: 0.015 / 1000 },
                'claude-3-haiku-20240307': { input: 0.00025 / 1000, output: 0.00125 / 1000 },
            },
        };
        const providerPricing = pricing[provider];
        if (!providerPricing)
            return 0;
        const modelPricing = providerPricing[this.config.openai.defaultModel] || providerPricing['gpt-3.5-turbo'];
        return (usage.promptTokens * modelPricing.input) + (usage.completionTokens * modelPricing.output);
    }
};
exports.AiService = AiService;
exports.AiService = AiService = AiService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], AiService);
//# sourceMappingURL=ai.service.js.map