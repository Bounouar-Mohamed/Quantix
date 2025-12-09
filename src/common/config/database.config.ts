import { registerAs } from '@nestjs/config';

export const databaseConfig = registerAs('database', () => ({
  // Configuration Prisma (connexion à la DB du CRM)
  prisma: {
    url: process.env.DATABASE_URL || 'postgresql://username:password@localhost:5432/crm_db',
    logLevel: process.env.DATABASE_LOG_LEVEL || 'error',
  },

  // Configuration pour le microservice
  microservice: {
    host: process.env.MICROSERVICE_HOST || 'localhost',
    port: Number(process.env.MICROSERVICE_PORT) || 3001,
    jwtSecret: process.env.MICROSERVICE_JWT_SECRET || 'your-secret-key',
    jwtExpiresIn: process.env.MICROSERVICE_JWT_EXPIRES_IN || '24h',
  },

  // Configuration de connexion au CRM principal
  crmConnection: {
    baseUrl: process.env.CRM_BASE_URL || 'http://localhost:3000',
    apiKey: process.env.CRM_API_KEY || '',
    timeout: Number(process.env.CRM_TIMEOUT) || 10000,
  },

  // Configuration Redis (pour le cache et les sessions)
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: Number(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || '',
    db: Number(process.env.REDIS_DB) || 0,
  },
}));
