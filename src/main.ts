import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { configureSafeConsole } from './common/utils/console-sanitizer';

async function bootstrap() {
  configureSafeConsole();
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  // Configuration de sécurité
  app.use(helmet());
  app.enableCors({
    origin: configService.get('CORS_ORIGINS', '*').split(','),
    credentials: true,
  });

  // Configuration des pipes de validation
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }));

  // Configuration Swagger
  const config = new DocumentBuilder()
    .setTitle('AI Management Service')
    .setDescription('Microservice de gestion IA centralisé pour CRM')
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('ai', 'Gestion des APIs IA')
    .addTag('consumption', 'Monitoring des consommations')
    .addTag('users', 'Gestion des utilisateurs')
    .addTag('automation', 'Automatisations')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  // Configuration du préfixe global
  app.setGlobalPrefix('api/v1');

  const port = configService.get('PORT', 3001);
  await app.listen(port);

  logger.log(`AI Management Service démarré sur le port ${port}`);
  logger.log(`Documentation disponible sur http://localhost:${port}/api/docs`);
}

bootstrap();
