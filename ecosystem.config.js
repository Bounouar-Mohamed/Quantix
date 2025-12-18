const dotenv = require('dotenv');
const path = require('path');

// Charger le fichier .env
const envPath = path.resolve(__dirname, '.env');
const envConfig = dotenv.config({ path: envPath });

module.exports = {
  apps: [
    {
      name: 'quantix-service',
      script: 'bun',
      args: 'run src/main.ts',
      cwd: '/srv/all4one/Quantix',
      interpreter: '/usr/bin/env',
      env: {
        NODE_ENV: 'production',
        PORT: '3101',
        ...envConfig.parsed, // Charger toutes les variables du .env
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: '3101',
        ...envConfig.parsed,
      },
      watch: false,
      autorestart: true,
      max_memory_restart: '1G',
      time: true,
    },
  ],
};

