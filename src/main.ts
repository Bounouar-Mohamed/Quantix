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

  // ══════════════════════════════════════════════════════════════════════════════
  // SÉCURITÉ: Configuration Helmet renforcée
  // ══════════════════════════════════════════════════════════════════════════════
  app.use(helmet({
    // Content Security Policy - Empêche XSS et injection de scripts
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", "https://api.openai.com", "wss://api.openai.com"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: [],
      },
    },
    // HSTS - Force HTTPS
    hsts: {
      maxAge: 31536000, // 1 an
      includeSubDomains: true,
      preload: true,
    },
    // Empêche le clickjacking
    frameguard: { action: 'deny' },
    // Cache les infos du serveur
    hidePoweredBy: true,
    // Empêche le MIME sniffing
    noSniff: true,
    // Protection XSS
    xssFilter: true,
    // Politique de référent stricte
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  }));

  // ══════════════════════════════════════════════════════════════════════════════
  // SÉCURITÉ: Configuration CORS stricte
  // ══════════════════════════════════════════════════════════════════════════════
  const allowedOrigins = configService.get<string>('CORS_ORIGINS', '');
  const corsOrigins = allowedOrigins
    ? allowedOrigins.split(',').map(o => o.trim()).filter(Boolean)
    : [];
  
  // Ajouter les origines par défaut pour le développement et le dashboard
  const defaultOrigins = [
    'http://localhost:3102', // Dashboard Quantix
    'http://localhost:3000', // Frontend principal
    'http://127.0.0.1:3102',
    'http://127.0.0.1:3000',
  ];
  const allAllowedOrigins = [...new Set([...defaultOrigins, ...corsOrigins])];

  app.enableCors({
    origin: (origin, callback) => {
      // Autoriser les requêtes sans origin (ex: Postman, curl, appels internes)
      if (!origin) {
        return callback(null, true);
      }
      // Vérifier si l'origine est dans la liste autorisée
      if (allAllowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      // Rejeter les origines non autorisées
      logger.warn(`CORS: Origine rejetée: ${origin}`);
      return callback(new Error('Not allowed by CORS'), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-internal-key',
      'x-request-id',
      'conversation-id',
      'tenant-id',
      'user-id',
      'accept-language',
    ],
    exposedHeaders: ['x-request-id'],
    maxAge: 86400, // Cache preflight pendant 24h
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
