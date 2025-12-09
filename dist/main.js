"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const config_1 = require("@nestjs/config");
const helmet_1 = require("helmet");
const app_module_1 = require("./app.module");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    const configService = app.get(config_1.ConfigService);
    app.use((0, helmet_1.default)());
    app.enableCors({
        origin: configService.get('CORS_ORIGINS', '*').split(','),
        credentials: true,
    });
    app.useGlobalPipes(new common_1.ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
    }));
    const config = new swagger_1.DocumentBuilder()
        .setTitle('AI Management Service')
        .setDescription('Microservice de gestion IA centralisé pour CRM')
        .setVersion('1.0')
        .addBearerAuth()
        .addTag('ai', 'Gestion des APIs IA')
        .addTag('consumption', 'Monitoring des consommations')
        .addTag('users', 'Gestion des utilisateurs')
        .addTag('automation', 'Automatisations')
        .build();
    const document = swagger_1.SwaggerModule.createDocument(app, config);
    swagger_1.SwaggerModule.setup('api/docs', app, document);
    app.setGlobalPrefix('api/v1');
    const port = configService.get('PORT', 3001);
    await app.listen(port);
    console.log(`🚀 AI Management Service démarré sur le port ${port}`);
    console.log(`📚 Documentation disponible sur http://localhost:${port}/api/docs`);
}
bootstrap();
//# sourceMappingURL=main.js.map