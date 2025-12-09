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
Object.defineProperty(exports, "__esModule", { value: true });
exports.HealthCheckDto = exports.GenerateResponseDto = exports.AiMessageDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class AiMessageDto {
}
exports.AiMessageDto = AiMessageDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Rôle du message',
        enum: ['system', 'user', 'assistant'],
        example: 'user',
    }),
    (0, class_validator_1.IsEnum)(['system', 'user', 'assistant']),
    __metadata("design:type", String)
], AiMessageDto.prototype, "role", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Contenu du message',
        example: 'Bonjour, comment allez-vous ?',
    }),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], AiMessageDto.prototype, "content", void 0);
class GenerateResponseDto {
}
exports.GenerateResponseDto = GenerateResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Messages de la conversation',
        type: [AiMessageDto],
    }),
    (0, class_validator_1.IsArray)(),
    __metadata("design:type", Array)
], GenerateResponseDto.prototype, "messages", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Modèle IA à utiliser',
        example: 'gpt-3.5-turbo',
        required: false,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], GenerateResponseDto.prototype, "model", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Température de génération (0-2)',
        example: 0.7,
        minimum: 0,
        maximum: 2,
        required: false,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.Max)(2),
    __metadata("design:type", Number)
], GenerateResponseDto.prototype, "temperature", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Nombre maximum de tokens',
        example: 1000,
        minimum: 1,
        maximum: 4000,
        required: false,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(4000),
    __metadata("design:type", Number)
], GenerateResponseDto.prototype, "maxTokens", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Provider IA à utiliser',
        enum: ['openai', 'anthropic'],
        example: 'openai',
        required: false,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(['openai', 'anthropic']),
    __metadata("design:type", String)
], GenerateResponseDto.prototype, "provider", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'ID de l\'utilisateur',
        example: 'user-123',
        required: false,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], GenerateResponseDto.prototype, "userId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'ID de la session',
        example: 'session-456',
        required: false,
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], GenerateResponseDto.prototype, "sessionId", void 0);
class HealthCheckDto {
}
exports.HealthCheckDto = HealthCheckDto;
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'État du service OpenAI',
        example: true,
    }),
    __metadata("design:type", Boolean)
], HealthCheckDto.prototype, "openai", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'État du service Anthropic',
        example: false,
    }),
    __metadata("design:type", Boolean)
], HealthCheckDto.prototype, "anthropic", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'État global des services IA',
        example: true,
    }),
    __metadata("design:type", Boolean)
], HealthCheckDto.prototype, "overall", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        description: 'Timestamp de la vérification',
        example: '2024-01-15T10:30:00Z',
    }),
    __metadata("design:type", Date)
], HealthCheckDto.prototype, "timestamp", void 0);
//# sourceMappingURL=ai.dto.js.map